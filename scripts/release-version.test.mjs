import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeVersion, planVersionChanges } from "./release-version.mjs";

test("release tags reject prereleases, shell input and native version overflow", () => {
  assert.equal(normalizeVersion("v1.2.3"), "1.2.3");
  assert.equal(normalizeVersion("v0.0.1"), "0.0.1");
  for (const value of ["0.0.0", "1.0.0-beta.1", "v1.0.0;echo", "01.2.3", "1.1000.0", "2001.0.0", "1.2"]) {
    assert.throws(() => normalizeVersion(value));
  }
});

test("version synchronization changes only the app, preserving dependencies and compatibility", async () => {
  const sourceRoot = new URL("../", import.meta.url);
  const root = await mkdtemp(path.join(tmpdir(), "telegram-star-version-"));
  try {
    const sourcePlan = await planVersionChanges(fileURLToPath(sourceRoot), "1.2.3");
    for (const change of sourcePlan) {
      await mkdir(path.dirname(path.join(root, change.file)), { recursive: true });
      await writeFile(path.join(root, change.file), change.before);
    }
    const plan = await planVersionChanges(root, "1.2.3");
    const lock = plan.find(c => c.file.endsWith("desktop/src-tauri/Cargo.lock"));
    assert.equal(lock.after.replace(/(name = "telegram-star-desktop"\r?\nversion = ")[^"]+/, "$1APP"),
      lock.before.replace(/(name = "telegram-star-desktop"\r?\nversion = ")[^"]+/, "$1APP"));
    const health = plan.find(c => c.file.endsWith("health.service.ts"));
    assert.match(health.after, /HEALTH_SERVER_VERSION = "1.2.3"/);
    assert.equal(health.after.replace(/HEALTH_SERVER_VERSION = "[^"]+"/, "APP"), health.before.replace(/HEALTH_SERVER_VERSION = "[^"]+"/, "APP"));
    assert.match(plan.find(c => c.file === "docker-compose.yml").after, /telegram-star:1.2.3/);
    assert.match(plan.find(c => c.file.endsWith("clientRuntime.ts")).after, /undefined" \? "1.2.3"/);
    assert.match(plan.find(c => c.file.endsWith("clientDevice.ts")).after, /undefined" \? "1.2.3"/);
    for (const change of plan) await writeFile(path.join(root, change.file), change.after);
    assert.ok((await planVersionChanges(root, "v1.2.3")).every(c => c.before === c.after));
    await writeFile(path.join(root, "packages/mobile/src-tauri/Cargo.toml"), "invalid template");
    await assert.rejects(planVersionChanges(root, "1.2.4"), /Unexpected version layout/);
    assert.equal(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version, "1.2.3");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const [name, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`release CLI checks and synchronizes ${name} files without changing line endings`, async () => {
    // Resolve macOS temp-directory symlinks so the copied CLI's entry-point guard executes.
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "telegram-star-version-cli-")));
    try {
      const sourcePlan = await planVersionChanges(fileURLToPath(new URL("../", import.meta.url)), "1.2.3");
      for (const change of sourcePlan) {
        await mkdir(path.dirname(path.join(root, change.file)), { recursive: true });
        await writeFile(path.join(root, change.file), change.after.replace(/\r?\n/g, eol));
      }
      const scriptFile = "scripts/release-version.mjs";
      await mkdir(path.join(root, "scripts"), { recursive: true });
      await writeFile(path.join(root, scriptFile),
        (await readFile(new URL("./release-version.mjs", import.meta.url), "utf8")).replace(/\r?\n/g, eol));
      const files = [...sourcePlan.map(change => change.file), scriptFile];
      const snapshot = async () => Promise.all(files.map(async file => ({
        file,
        content: await readFile(path.join(root, file), "utf8"),
        modifiedAt: (await stat(path.join(root, file), { bigint: true })).mtimeNs,
      })));
      const run = (...args) => {
        const result = spawnSync(process.execPath, [path.join(root, scriptFile), ...args], {
          cwd: root, encoding: "utf8", timeout: 10_000,
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        return result;
      };

      const initialFiles = await snapshot();
      const consistent = run("--check", "1.2.3");
      assert.equal(consistent.status, 0, consistent.stderr);
      assert.equal(consistent.stdout, "All release versions match 1.2.3.\n");
      assert.equal(consistent.stderr, "");
      assert.deepEqual(await snapshot(), initialFiles, "successful checks must not rewrite files");

      const staleFile = "packages/web/package.json";
      const stalePath = path.join(root, staleFile);
      await writeFile(stalePath, (await readFile(stalePath, "utf8"))
        .replace('"version": "1.2.3"', '"version": "1.2.2"'));
      const staleFiles = await snapshot();
      const inconsistent = run("--check", "1.2.3");
      assert.equal(inconsistent.status, 1);
      assert.equal(inconsistent.stderr,
        `Version 1.2.3 is inconsistent:\n${staleFile}\nRun pnpm release:version 1.2.3, then commit before tagging.\n`);
      assert.deepEqual(await snapshot(), staleFiles, "failed checks must not rewrite files");

      const synchronized = run("1.2.4");
      assert.equal(synchronized.status, 0, synchronized.stderr);
      assert.match(synchronized.stdout, /Synchronized \d+ files to 1\.2\.4\./);
      for (const change of sourcePlan) {
        const content = await readFile(path.join(root, change.file), "utf8");
        const lineEndings = content.match(/\r\n|\n|\r/g);
        assert.ok(lineEndings?.length, `${change.file} must retain its line endings`);
        assert.ok(lineEndings.every(ending => ending === eol), `${change.file} must keep ${name}`);
      }
      const synchronizedFiles = await snapshot();
      const rechecked = run("--check", "1.2.4");
      assert.equal(rechecked.status, 0, rechecked.stderr);
      assert.equal(rechecked.stdout, "All release versions match 1.2.4.\n");
      assert.deepEqual(await snapshot(), synchronizedFiles, "checks after synchronization must remain read-only");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
