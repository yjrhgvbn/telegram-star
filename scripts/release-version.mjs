import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function normalizeVersion(value) {
  const version = value.replace(/^v/, "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Use a stable version such as 0.0.1 or v0.0.1 (no prerelease suffix).");
  }
  const [major, minor, patch] = version.split(".").map(Number);
  // Keep one version representable by desktop installers and Android versionCode.
  if (major === 0 && minor === 0 && patch === 0) throw new Error("Version must be at least 0.0.1 for Android.");
  if (major > 2000 || minor > 999 || patch > 999) throw new Error("Version exceeds native package limits.");
  return version;
}

function replaceExactlyOnce(source, pattern, replacement, file) {
  if ([...source.matchAll(pattern)].length !== 1) throw new Error(`Unexpected version layout: ${file}`);
  return source.replace(pattern, replacement);
}

export async function planVersionChanges(root, value) {
  const version = normalizeVersion(value);
  const changes = [];
  const jsonFiles = ["package.json", ...["shared", "server", "web", "desktop", "mobile"].map(p => `packages/${p}/package.json`),
    "packages/desktop/src-tauri/tauri.conf.json", "packages/mobile/src-tauri/tauri.conf.json"];
  for (const file of jsonFiles) {
    const before = await readFile(path.join(root, file), "utf8");
    const data = JSON.parse(before);
    if (typeof data.version !== "string") throw new Error(`Missing version: ${file}`);
    data.version = version;
    changes.push({ file, before, after: JSON.stringify(data, null, 2) + "\n" });
  }
  for (const platform of ["desktop", "mobile"]) {
    for (const name of ["Cargo.toml", "Cargo.lock"]) {
      const file = `packages/${platform}/src-tauri/${name}`;
      const before = await readFile(path.join(root, file), "utf8");
      const pattern = new RegExp(`(name = "telegram-star-${platform}"\\r?\\nversion = ")[^"]+("(?:\\r?\\n|$))`, "g");
      changes.push({ file, before, after: replaceExactlyOnce(before, pattern, `$1${version}$2`, file) });
    }
  }
  const healthFile = "packages/server/src/modules/health/health.service.ts";
  const healthBefore = await readFile(path.join(root, healthFile), "utf8");
  changes.push({ file: healthFile, before: healthBefore, after: replaceExactlyOnce(healthBefore,
    /(export const HEALTH_SERVER_VERSION = ")[^"]+(";)/g, `$1${version}$2`, healthFile) });
  // API/minimum-client versions are compatibility decisions, not release numbers.
  for (const [file, constant] of [
    ["packages/web/src/shared/runtime/clientRuntime.ts", "__APP_VERSION__"],
    ["packages/mobile/src/runtime/clientDevice.ts", "__MOBILE_APP_VERSION__"],
  ]) {
    const before = await readFile(path.join(root, file), "utf8");
    const pattern = new RegExp(`(typeof ${constant} === "undefined" \\? ")[^"]+(" : ${constant})`, "g");
    changes.push({ file, before, after: replaceExactlyOnce(before, pattern, `$1${version}$2`, file) });
  }
  for (const file of ["docker-compose.yml", ".env.example"]) {
    const before = await readFile(path.join(root, file), "utf8");
    changes.push({ file, before, after: replaceExactlyOnce(before,
      /(docker\.io\/yjrhgvbn\/telegram-star:)\d+\.\d+\.\d+/g, `$1${version}`, file) });
  }
  return changes;
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const args = process.argv.slice(2);
  const check = args[0] === "--check";
  if (check) args.shift();
  if (args.length > 1 || (!check && args.length !== 1)) throw new Error("Usage: release-version.mjs [--check] [0.0.1]");
  const current = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
  const version = normalizeVersion(args[0] ?? current);
  // Validate every file before writing anything, so a missing marker cannot cause a partial bump.
  const changes = await planVersionChanges(root, version);
  const dirty = changes.filter(change => change.before !== change.after);
  if (check && dirty.length) throw new Error(`Version ${version} is inconsistent:\n${dirty.map(c => c.file).join("\n")}\nRun pnpm release:version ${version}, then commit before tagging.`);
  if (!check) for (const change of dirty) await writeFile(path.join(root, change.file), change.after);
  console.log(check ? `All release versions match ${version}.` : `Synchronized ${dirty.length} files to ${version}. Review and commit before creating tag v${version}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
