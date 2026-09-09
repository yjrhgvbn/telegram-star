import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareAndroidSigning, validateSigningSecrets } from "./android-signing.mjs";

// This fixture follows Tauri's generated app Gradle structure; it has no signing key.
const template = `import java.util.Properties
plugins { id("com.android.application") }
android {
    defaultConfig { manifestPlaceholders["usesCleartextTraffic"] = "false" }
    buildTypes {
        getByName("debug") { isDebuggable = true }
        getByName("release") { isMinifyEnabled = true }
    }
}
apply(from = "tauri.build.gradle.kts")
`;

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "telegram-star-signing-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const androidProjectDir = join(root, "android");
  const gradlePath = join(androidProjectDir, "app/build.gradle.kts");
  mkdirSync(join(androidProjectDir, "app"), { recursive: true });
  writeFileSync(gradlePath, template);
  // Arbitrary bytes exercise storage without creating a certificate usable for distribution.
  const keystore = Buffer.from("test-fixture-not-a-real-keystore");
  const env = {
    ANDROID_KEYSTORE_BASE64: keystore.toString("base64"),
    ANDROID_KEY_ALIAS: "fixture-signing-alias",
    ANDROID_KEY_PASSWORD: 'fixture-password-"-\\-\n-${not_code}',
    ANDROID_STORE_PASSWORD: "fixture-store-password",
    RUNNER_TEMP: root,
    GITHUB_ENV: join(root, "github-env"),
  };
  return { root, androidProjectDir, gradlePath, keystore, env };
}

test("Android signing fails before writing files when any credential is missing", (t) => {
  const fixture = createFixture(t);
  for (const name of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD", "ANDROID_STORE_PASSWORD"]) {
    assert.throws(() => prepareAndroidSigning({ ...fixture, env: { ...fixture.env, [name]: "" } }),
      (error) => error.message.includes(name) && !error.message.includes(fixture.env.ANDROID_STORE_PASSWORD));
  }
  assert.deepEqual(readdirSync(fixture.root), ["android"]);
  assert.equal(readFileSync(fixture.gradlePath, "utf8"), template);
});

test("Android signing rejects corrupted base64 and accepts standard wrapped base64", (t) => {
  const { env, keystore } = createFixture(t);
  for (const value of ["garbage!", "====", `${env.ANDROID_KEYSTORE_BASE64}!`]) {
    assert.throws(() => validateSigningSecrets({ ...env, ANDROID_KEYSTORE_BASE64: value }), /complete base64/);
  }
  const wrapped = env.ANDROID_KEYSTORE_BASE64.match(/.{1,8}/g).join("\n") + "\n";
  assert.deepEqual(validateSigningSecrets({ ...env, ANDROID_KEYSTORE_BASE64: wrapped }), keystore);
});

test("Android signing keeps secrets out of generated Gradle and only exports the temporary key path", (t) => {
  const fixture = createFixture(t);
  const keyPath = prepareAndroidSigning(fixture);
  assert.deepEqual(readFileSync(keyPath), fixture.keystore);
  assert.ok(keyPath.startsWith(join(fixture.root, "telegram-star-android-signing-")));
  if (process.platform !== "win32") assert.equal(statSync(keyPath).mode & 0o777, 0o600);

  const gradle = readFileSync(fixture.gradlePath, "utf8");
  assert.ok(gradle.startsWith(template.trimEnd()));
  for (const name of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD", "ANDROID_STORE_PASSWORD"]) {
    assert.equal(gradle.includes(fixture.env[name]), false);
  }
  assert.equal(gradle.includes(keyPath), false);
  assert.match(gradle, /signingConfig = signingConfigs.getByName\("telegramStarRelease"\)/);
  assert.equal(readFileSync(fixture.env.GITHUB_ENV, "utf8"), `ANDROID_KEYSTORE_PATH=${keyPath}\n`);
});

test("Android signing configuration can be prepared again without duplicate Gradle blocks", (t) => {
  const fixture = createFixture(t);
  prepareAndroidSigning(fixture);
  const first = readFileSync(fixture.gradlePath, "utf8");
  prepareAndroidSigning(fixture);
  assert.equal(readFileSync(fixture.gradlePath, "utf8"), first);
});

test("Android signing refuses missing release blocks and conflicting signing configuration", (t) => {
  const fixture = createFixture(t);
  writeFileSync(fixture.gradlePath, "android {}\n");
  assert.throws(() => prepareAndroidSigning(fixture), /release configuration was not found/);
  writeFileSync(fixture.gradlePath, template + '\nandroid { signingConfigs { create("telegramStarRelease") {} } }\n');
  assert.throws(() => prepareAndroidSigning(fixture), /unexpected Telegram Star signing configuration/);
  assert.deepEqual(readdirSync(fixture.root), ["android"]);
});

test("Android signing requires the CI temporary directory and environment file", (t) => {
  const fixture = createFixture(t);
  for (const name of ["RUNNER_TEMP", "GITHUB_ENV"]) {
    assert.throws(() => prepareAndroidSigning({ ...fixture, env: { ...fixture.env, [name]: "" } }),
      /requires RUNNER_TEMP and GITHUB_ENV/);
  }
  assert.deepEqual(readdirSync(fixture.root), ["android"]);
});
