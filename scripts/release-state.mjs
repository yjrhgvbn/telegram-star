import { appendFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeVersion } from "./release-version.mjs";

const NOT_FOUND = Symbol("release-not-found");

function githubRequest(env) {
  const tag = env.RELEASE_TAG ?? "";
  if (tag !== `v${normalizeVersion(tag)}`) throw new Error("RELEASE_TAG must be a stable vX.Y.Z tag.");
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(env.GH_REPO ?? "")) {
    throw new Error("GH_REPO must be owner/repository.");
  }
  if (!env.GH_TOKEN?.trim()) throw new Error("GH_TOKEN is required to check release state.");
  const api = new URL(env.GITHUB_API_URL || "https://api.github.com");
  if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash) {
    throw new Error("GITHUB_API_URL must be an HTTPS API base URL without credentials or query parameters.");
  }
  const repository = env.GH_REPO.split("/").map(encodeURIComponent).join("/");
  return {
    tag,
    releasesUrl: `${api.href.replace(/\/+$/, "")}/repos/${repository}/releases`,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GH_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "telegram-star-release-check",
    },
  };
}

async function requestJson(url, headers, fetchImpl, allowNotFound = false) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Do not echo request details or token-bearing network errors into CI output.
    throw new Error("Unable to query GitHub release state. Retry after resolving network or API access errors.");
  }
  if (response.status === 404 && allowNotFound) return NOT_FOUND;
  if (response.status !== 200) throw new Error(`GitHub release state check failed (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error("GitHub returned invalid release state JSON.");
  }
}

function checkDraft(release, tag, localAssetNames) {
  if (!release || release.tag_name !== tag || typeof release.draft !== "boolean" || !Array.isArray(release.assets)) {
    throw new Error("GitHub returned an unexpected release state.");
  }
  if (!release.draft) throw new Error("Published versions cannot be rebuilt or overwritten. Choose a new version.");
  if (release.assets.some(asset => !asset || typeof asset.name !== "string")) {
    throw new Error("GitHub returned an unexpected release asset list.");
  }
  if (localAssetNames) {
    const localNames = new Set(localAssetNames);
    const stale = release.assets.map(asset => asset.name).filter(name => !localNames.has(name));
    if (stale.length) {
      throw new Error(`The draft contains assets absent from this build: ${JSON.stringify(stale)}. Review the draft and remove stale assets, or choose a new version before rerunning.`);
    }
  }
  return { exists: true };
}

export async function inspectReleaseState({ env = process.env, fetchImpl = globalThis.fetch, localAssetNames } = {}) {
  const { tag, releasesUrl, headers } = githubRequest(env);
  const release = await requestJson(`${releasesUrl}/tags/${encodeURIComponent(tag)}`, headers, fetchImpl, true);
  if (release !== NOT_FOUND) return checkDraft(release, tag, localAssetNames);

  // The tag endpoint only promises published releases; authenticated listing finds drafts.
  // A bounded page count fails closed instead of silently ignoring old or inaccessible drafts.
  for (let page = 1; page <= 100; page++) {
    const releases = await requestJson(`${releasesUrl}?per_page=100&page=${page}`, headers, fetchImpl);
    if (!Array.isArray(releases) || releases.some(item => !item || typeof item.tag_name !== "string")) {
      throw new Error("GitHub returned an unexpected release list.");
    }
    const matches = releases.filter(item => item.tag_name === tag);
    if (matches.length > 1) throw new Error("Multiple releases use this tag; review the drafts before rerunning.");
    if (matches.length === 1) return checkDraft(matches[0], tag, localAssetNames);
    if (releases.length < 100) return { exists: false };
  }
  throw new Error("Release lookup exceeded 100 pages. Review the release history before rerunning.");
}

export async function runReleaseStateCheck(args, { env = process.env, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  if (args.length && (args.length !== 2 || args[0] !== "--assets" || !args[1])) {
    throw new Error("Usage: release-state.mjs [--assets release-assets]");
  }
  let localAssetNames;
  if (args.length) {
    const entries = await readdir(path.resolve(args[1]), { withFileTypes: true });
    if (!entries.length || entries.some(entry => !entry.isFile())) {
      throw new Error("The local release asset directory must contain only files and must not be empty.");
    }
    localAssetNames = entries.map(entry => entry.name);
  }
  const state = await inspectReleaseState({ env, fetchImpl, localAssetNames });
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `exists=${state.exists}\n`);
  log(state.exists ? "Existing release is a draft; release state checks passed." : "No release exists for this tag; a new draft may be created.");
  return state;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runReleaseStateCheck(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
