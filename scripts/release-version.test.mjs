import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
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
    assert.equal(lock.after.replace(/(name = "telegram-star-desktop"\nversion = ")[^"]+/, "$1APP"),
      lock.before.replace(/(name = "telegram-star-desktop"\nversion = ")[^"]+/, "$1APP"));
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
