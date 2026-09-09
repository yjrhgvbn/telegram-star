import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareReleaseAssets } from "./release-assets.mjs";

test("release assembly refuses incomplete downloads and records optional Android accurately", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "telegram-star-assets-"));
  const env = { RELEASE_TAG: "v1.2.3", RELEASE_IMAGE: "docker.io/example/telegram-star:1.2.3", IMAGE_DIGEST: `sha256:${"a".repeat(64)}`, ANDROID_RESULT: "skipped" };
  try {
    for (const image of ["ghcr.io/example/telegram-star:1.2.3", "docker.io/example/telegram-star:1.2.4", "docker.io/example/team/app:1.2.3"]) {
      await assert.rejects(prepareReleaseAssets(dir, { ...env, RELEASE_IMAGE: image }), /version-matched Docker Hub/);
    }
    await assert.rejects(prepareReleaseAssets(dir, env), /Missing installer/);
    for (const suffix of ["macos-arm64.dmg", "macos-x64.dmg", "windows-x64.exe", "linux-x64.AppImage", "linux-x64.deb"]) {
      await writeFile(path.join(dir, `telegram-star-v1.2.3-${suffix}`), "synthetic test artifact");
    }
    await assert.rejects(prepareReleaseAssets(dir, { ...env, ANDROID_RESULT: "success" }), /android-arm64.apk/);
    await assert.rejects(prepareReleaseAssets(dir, { ...env, IMAGE_DIGEST: "" }), /digest/);
    const notes = await prepareReleaseAssets(dir, env);
    assert.match(notes, /不包含 APK/);
    assert.match(await readFile(path.join(dir, "docker-compose.yml"), "utf8"), /docker.io\/example\/telegram-star:1.2.3/);
    assert.match(await readFile(path.join(dir, "image-digest.txt"), "utf8"), /telegram-star@sha256:/);
    assert.match(await readFile(path.join(dir, "telegram-star.env.example"), "utf8"), /TELEGRAM_STAR_IMAGE=docker.io\/example\/telegram-star:1.2.3/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
