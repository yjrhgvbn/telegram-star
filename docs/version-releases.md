# 版本发布：镜像与安装包

**推送 `main` 更新自己的服务器；推送版本 tag 发布 Docker Hub 镜像和客户端安装包，两条流程互相独立。** 分支推送和 PR 不触发独立 CI，需要检查时手动运行 **CI**；版本发布工作流会自行构建和测试。不走应用商店，不需要购买商店账号。

公开产物：服务端 + Web 的 amd64 / arm64 镜像；macOS 两种架构的 DMG；Windows x64 EXE；Linux x64 AppImage / DEB；可选 Android arm64 APK。普通用户只需安装 Docker，复制 Release 中的命令即可启动，客户端连接自己的后端。

## 首次配置 GitHub

先在 Docker Hub 创建 Public 仓库 `yjrhgvbn/telegram-star`。在 Docker 账号设置创建一个有 **Read & Write** 权限的 Personal Access Token，不需要 Delete 权限。[Docker Token 说明](https://docs.docker.com/security/access-tokens/personal-access-tokens/)

然后进入 GitHub 仓库 **Settings → Secrets and variables → Actions**，使用 **Repository secrets** 和 **Repository variables**：

| 类型 | 名称 | 填写内容 |
| --- | --- | --- |
| Repository secret | `DOCKERHUB_USERNAME` | Docker Hub 登录用户名 |
| Repository secret | `DOCKERHUB_TOKEN` | 上面创建的 Token |
| Repository variable | `DOCKERHUB_IMAGE` | `yjrhgvbn/telegram-star`，不带 `docker.io/` 和版本号 |

这个账号要有目标仓库的推送权限。发布工作流使用这些配置登录并推送镜像，方式见 [Docker GitHub Actions 说明](https://docs.docker.com/build/ci/github-actions/push-multi-registries/)。模板使用 `docker.io/yjrhgvbn/telegram-star:0.0.1`；Release 附件会自动填入本次发布的版本。

## 维护者发布步骤

首发使用 `0.0.1`，后续依次使用 `0.0.2`、`0.0.3`；每次发布都创建对应的新 tag。

先提交功能改动，完成[构建与验证](user-development.md#构建与验证)，确保工作区干净，再执行：

```bash
pnpm release:version 0.0.1
pnpm release:check
git diff
git add -u
git diff --cached --stat
git commit -m "chore: release v0.0.1"
git tag -a v0.0.1 -m "Telegram Star v0.0.1"
git push origin main
git push origin v0.0.1
```

只使用 `X.Y.Z` 版本，tag 带 `v`；[版本脚本](../scripts/release-version.mjs)会同步各端版本。上面的 `git push origin main` 会部署自己的服务器；`git push origin v0.0.1` 只触发公开产物验证，推送 `docker.io/yjrhgvbn/telegram-star:0.0.1` 并打包客户端，不使用 `latest`。

在 Actions 等待 **Build Version Release** 成功，再打开 [Releases](https://github.com/yjrhgvbn/telegram-star/releases) 的草稿，试装、补充更新说明，然后点 **Publish release**。草稿包含安装包、Docker 启动命令、校验文件，以及可选的 Compose 和环境模板附件。镜像在生成草稿前已推送 Docker Hub；这条发布流程不部署服务器。

网络或 runner 临时故障可在 Actions 用已有 tag 重跑。若修复了代码或构建脚本，tag 需指向包含修复的提交；尚未正式发布且未分发的版本，经明确确认可更新原 tag，已发布或分发的版本需使用新版本号。仅更新 `main` 再重跑未移动的旧 tag 仍会使用旧源码。若提示草稿含过期附件，审阅后删除旧附件再重跑。完整执行逻辑见[发布工作流](../.github/workflows/release.yml)。

桌面发布在初始化 pnpm 缓存前检查版本并运行版本同步回归测试。版本脚本保留 JSON 原有的 LF / CRLF 换行符，Windows 检出时的换行转换不会被误判成版本不一致；实际版本不同仍会阻止打包。

## 需要 Android APK 时

APK 直接下载安装也需要签名，但使用自己生成的 keystore 即可，无需商店账号。已有密钥就继续使用；首次可在装有 Java 的电脑执行：

```bash
mkdir -p ~/telegram-star-signing
keytool -genkeypair -v -keystore ~/telegram-star-signing/release.jks \
  -alias telegram-star -keyalg RSA -keysize 2048 -validity 10000
openssl base64 -A -in ~/telegram-star-signing/release.jks \
  -out ~/telegram-star-signing/release.base64.txt
```

在 GitHub Actions 增加四个 Repository secrets：

| 名称 | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `release.base64.txt` 完整内容 |
| `ANDROID_KEY_ALIAS` | `telegram-star`，或已有密钥的别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |
| `ANDROID_STORE_PASSWORD` | keystore 密码 |

再添加 Repository variable `RELEASE_ANDROID=true`。不设置时跳过 APK；启用但缺密钥时构建会失败。保管好 keystore 和密码，后续使用同一密钥才能覆盖安装升级。[Android 签名说明](https://v2.tauri.app/distribute/sign/android/)

## 部署到自己的服务器

[Deploy To Server 工作流](../.github/workflows/deploy.yml)在推送 `main` 时自动执行，也可手动运行。服务器需要 Git、Docker 和 Compose，预先克隆仓库并准备 `.env`；SSH 用户需有仓库读取、目录写入和 Docker 操作权限。保持部署目录干净，保留原目录、项目名和数据卷。

在仓库 Actions 配置五个 Repository secrets：

| 名称 | 内容 |
| --- | --- |
| `SSH_HOST` | 服务器地址 |
| `SSH_PORT` | SSH 端口，例如 `22` |
| `SSH_USER` | 部署用户 |
| `SSH_PRIVATE_KEY` | 对应已授权公钥的私钥 |
| `DEPLOY_PATH` | 服务器上的代码仓库绝对路径 |

部署先执行 `git fetch --all --prune`、`git checkout main`、`git pull --ff-only origin main`，再在服务器构建本地镜像 `telegram-star:local`：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build --wait --wait-timeout 180
```

手动运行入口为 **Actions → Deploy To Server → Run workflow**，不填镜像版本。此流程不读取 Docker Hub 配置或改写 `.env`，不推镜像、不发布安装包，也不额外运行 CI 测试。部署前自行备份；健康检查失败时需检查日志并修复或回退，工作流不自动回滚。

用户的镜像安装、升级与备份统一见[部署指南](user-deployment.md)，客户端下载见[使用教程](user-guide.md#6-连接其他客户端)。首次版本发布完成前，示例镜像和安装包还不能下载。
