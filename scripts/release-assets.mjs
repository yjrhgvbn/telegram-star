import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeVersion } from "./release-version.mjs";

export async function prepareReleaseAssets(output, env = process.env) {
  const version = normalizeVersion(env.RELEASE_TAG ?? "");
  const tag = `v${version}`;
  if (env.RELEASE_TAG !== tag) throw new Error("RELEASE_TAG must have a v prefix.");
  const image = env.RELEASE_IMAGE ?? "";
  if (!/^docker\.io\/[a-z0-9]+([._-][a-z0-9]+)*\/[a-z0-9]+([._-][a-z0-9]+)*:\d+\.\d+\.\d+$/.test(image) || !image.endsWith(`:${version}`)) {
    throw new Error("RELEASE_IMAGE must be a version-matched Docker Hub image.");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(env.IMAGE_DIGEST ?? "")) throw new Error("Missing multi-platform image digest.");
  if (!["success", "skipped"].includes(env.ANDROID_RESULT)) throw new Error("Android build did not complete or was not explicitly skipped.");
  const expected = ["macos-arm64.dmg", "macos-x64.dmg", "windows-x64.exe", "linux-x64.AppImage", "linux-x64.deb"]
    .map(suffix => `telegram-star-${tag}-${suffix}`);
  if (env.ANDROID_RESULT === "success") expected.push(`Telegram-Star-${tag}-android-arm64.apk`);
  const files = await readdir(output);
  for (const name of expected) {
    if (!files.includes(name) || !(await stat(path.join(output, name))).size) throw new Error(`Missing installer: ${name}`);
  }
  if (files.some(name => !expected.includes(name))) throw new Error("Unexpected files in release artifact directory.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const compose = (await readFile(path.join(root, "docker-compose.yml"), "utf8"))
    .replace(/docker\.io\/yjrhgvbn\/telegram-star:\d+\.\d+\.\d+/, image);
  const settings = (await readFile(path.join(root, ".env.example"), "utf8"))
    .replace(/docker\.io\/yjrhgvbn\/telegram-star:\d+\.\d+\.\d+/, image);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "docker-compose.yml"), compose);
  await writeFile(path.join(output, "telegram-star.env.example"), settings);
  await writeFile(path.join(output, "image-digest.txt"), `${image}\n${image.slice(0, image.lastIndexOf(":"))}@${env.IMAGE_DIGEST}\n`);
  const instructions = `# Telegram Star ${tag}

客户端下载本 Release 的 DMG（macOS）、EXE（Windows）、DEB / AppImage（Linux）安装。客户端连接你部署的后端。

Android：${env.ANDROID_RESULT === "success" ? "下载本 Release 的 arm64 APK，允许浏览器或文件管理器安装应用后打开 APK 安装。" : "本 Release 不包含 APK；维护者配置 Android 签名密钥并启用 RELEASE_ANDROID 后即可构建。"}

macOS 包未公证，首次打开可能需要在系统设置中允许；Windows 可能提示未知发行者。客户端升级时下载新版安装包，Android 保持同一签名密钥。

镜像：\`${image}\`（linux/amd64、linux/arm64）。安装 Docker 后执行，无需下载配置文件：

\`\`\`bash
docker run -d --name telegram-star --restart unless-stopped --init \\
  -p 3000:3000 -v telegram-star-data:/app/data \\
  --log-driver local \\
  ${image}
\`\`\`

访问 http://localhost:3000 配置 Telegram。Android 客户端连接 HTTPS 后端。真实实例放在可信网络或认证反向代理后。

数据保存在 \`telegram-star-data\` 数据卷，升级前备份并复用同一卷，具体步骤见[部署指南](https://github.com/yjrhgvbn/telegram-star/blob/${tag}/docs/user-deployment.md)。已有 Compose 部署继续使用原目录、项目名和数据卷；Compose 和环境模板仅作为可选附件。SHA256SUMS.txt 校验附件，image-digest.txt 提供精确镜像摘要。
`;
  await writeFile(path.join(output, "DEPLOYMENT.md"), instructions);
  return instructions;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  prepareReleaseAssets(path.resolve(process.argv[2] ?? "release-assets"))
    .then(notes => writeFile("release-notes.md", notes))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
