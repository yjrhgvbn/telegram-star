import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectReleaseState, runReleaseStateCheck } from "./release-state.mjs";

const env = { RELEASE_TAG: "v1.2.3", GH_REPO: "example/telegram-star", GH_TOKEN: "test-token-never-sent" };
const draft = { tag_name: env.RELEASE_TAG, draft: true, assets: [{ name: "installer.apk" }] };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("release lookup refuses a published tag and keeps authorization in request headers", async () => {
  const requests = [];
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return json({ ...draft, draft: false });
  } }), /Published versions cannot be rebuilt/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.github.com/repos/example/telegram-star/releases/tags/v1.2.3");
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${env.GH_TOKEN}`);
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(requests[0].url.includes(env.GH_TOKEN), false);
});

test("only a tag 404 followed by a successful empty listing permits a new release", async () => {
  const requests = [];
  const result = await inspectReleaseState({ env, fetchImpl: async url => {
    requests.push(url);
    return requests.length === 1 ? json({}, 404) : json([]);
  } });
  assert.deepEqual(result, { exists: false });
  assert.equal(requests[1], "https://api.github.com/repos/example/telegram-star/releases?per_page=100&page=1");
});

test("release lookup finds drafts through paginated listings after a tag 404", async () => {
  let calls = 0;
  const result = await inspectReleaseState({ env, localAssetNames: ["installer.apk"], fetchImpl: async url => {
    calls++;
    if (calls === 1) return json({}, 404);
    if (calls === 2) return json(Array.from({ length: 100 }, (_, index) => ({ tag_name: `v9.0.${index}` })));
    assert.match(url, /page=2$/);
    return json([draft]);
  } });
  assert.equal(calls, 3);
  assert.deepEqual(result, { exists: true });
});

test("release state fails closed for HTTP, network, malformed JSON and response schema errors", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => json({}, status) }), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => { throw new Error(env.GH_TOKEN); } }),
    error => /Unable to query/.test(error.message) && !error.message.includes(env.GH_TOKEN));
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => new Response("not JSON") }), /invalid release state JSON/);
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => json(null) }), /unexpected release state/);
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => json({ tag_name: env.RELEASE_TAG }) }), /unexpected release state/);
  let calls = 0;
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => json({}, ++calls === 1 ? 404 : 403) }), /HTTP 403/);
  calls = 0;
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => json({}, ++calls === 1 ? 404 : 200) }), /unexpected release list/);
});

test("draft pagination has a hard upper bound and rejects failed pages", async () => {
  let requests = 0;
  const page = Array.from({ length: 100 }, (_, index) => ({ tag_name: `v9.0.${index}` }));
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => ++requests === 1 ? json({}, 404) : json(page) }), /exceeded 100 pages/);
  assert.equal(requests, 101);
  requests = 0;
  await assert.rejects(inspectReleaseState({ env, fetchImpl: async () => { requests++; return json({}, 404); } }), /HTTP 404/);
  assert.equal(requests, 2);
});

test("draft refresh refuses stale remote assets but accepts a matching or incomplete remote set", async () => {
  await assert.rejects(inspectReleaseState({ env, localAssetNames: ["desktop.dmg"], fetchImpl: async () => json(draft) }),
    /installer\.apk.*Review the draft and remove stale assets/);
  assert.deepEqual(await inspectReleaseState({ env, localAssetNames: ["installer.apk", "SHA256SUMS.txt"], fetchImpl: async () => json(draft) }),
    { exists: true });
});

test("release lookup validates tag, repository, token and HTTPS API base before any request", async () => {
  for (const overrides of [
    { RELEASE_TAG: "v1.2.3;echo" }, { RELEASE_TAG: "1.2.3" }, { GH_REPO: "../other/repo" },
    { GH_TOKEN: "" }, { GITHUB_API_URL: "http://example.test" }, { GITHUB_API_URL: "https://user:pass@example.test" },
  ]) {
    await assert.rejects(inspectReleaseState({ env: { ...env, ...overrides }, fetchImpl: async () => assert.fail("Invalid input must not make requests") }));
  }
  let requestedUrl;
  await inspectReleaseState({ env: { ...env, GITHUB_API_URL: "https://github.example.test/api/v3/" }, fetchImpl: async url => {
    requestedUrl = url;
    return json(draft);
  } });
  assert.equal(requestedUrl, "https://github.example.test/api/v3/repos/example/telegram-star/releases/tags/v1.2.3");
});

test("CLI outputs create/update decisions only after state and local asset checks succeed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "telegram-star-release-state-"));
  try {
    const output = path.join(root, "output");
    const cliEnv = { ...env, GITHUB_OUTPUT: output };
    const logs = [];
    let requests = 0;
    await runReleaseStateCheck([], { env: cliEnv, log: message => logs.push(message), fetchImpl: async () => ++requests === 1 ? json({}, 404) : json([]) });
    assert.equal(await readFile(output, "utf8"), "exists=false\n");
    await writeFile(path.join(root, "installer.apk"), "synthetic artifact");
    await runReleaseStateCheck(["--assets", root], { env: cliEnv, log: message => logs.push(message), fetchImpl: async () => json(draft) });
    assert.equal(await readFile(output, "utf8"), "exists=false\nexists=true\n");
    await assert.rejects(runReleaseStateCheck(["--assets"], { env: cliEnv }), /Usage/);
    await assert.rejects(runReleaseStateCheck([], { env: cliEnv, fetchImpl: async () => json({ ...draft, draft: false }) }), /Published versions/);
    assert.equal(await readFile(output, "utf8"), "exists=false\nexists=true\n");
    assert.ok(logs.every(message => !message.includes(env.GH_TOKEN)));
  } finally { await rm(root, { recursive: true, force: true }); }
});
