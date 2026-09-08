# 部署文档

## Docker Compose 部署

需要 Docker、`docker compose` 和仓库代码。镜像包含 Node.js 24、Web 产物、server 与 Apprise；桌面 / 手机客户端另行打包，连接同一后端。

在仓库目录执行：

```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 telegram-star
```

默认访问 `http://<server-ip>:3000`，在页面填写 Telegram API ID / Hash 并登录，再配置监听规则与转发通道。

容器启动时先运行 `pnpm --filter @telegram-star/server db:deploy`，成功后由 Node 启动 server；迁移失败不会继续启动应用。首次部署应确认容器运行、日志没有迁移 / 启动错误，并检查 `/api/health` 与页面可访问。

## 配置与持久化

完整配置见 [docker-compose.yml](../docker-compose.yml)、[Dockerfile](../Dockerfile) 和 [.env.example](../.env.example)。当前 Compose 从 `.env` 读取：

| 变量 | 默认 / 用途 |
| --- | --- |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | 可选；数据库没有 Telegram 凭证时兜底 |
| `TELEGRAM_STAR_MEMORY_LIMIT` | `1536m`，容器内存上限 |
| `NODE_MAX_OLD_SPACE_SIZE_MB` | `768`，Node V8 堆上限，应低于容器内存上限 |
| `LOG_LEVEL` | `info`，应用日志 |
| `GRAMJS_LOG_LEVEL` | `warn`，Telegram 库日志 |

以下值由 Compose 固定，修改根目录 `.env` 不会覆盖，需修改 Compose 或使用覆盖文件：

- 端口映射 `3000:3000`，容器监听 `0.0.0.0:3000`。
- `DATABASE_URL=file:/app/data/telegram-star.db`、`DB_PATH=/app/data/telegram-star.db`。
- `SESSION_PATH=/app/data/session.txt`、`CORS_ORIGIN=*`。

数据库与 Telegram 会话保存在容器 `/app/data`，挂载 Compose 命名卷 `telegram-star-data`。Docker 实际卷名通常带 Compose 项目前缀。重建容器保留数据卷；`docker compose down -v` 会删除该卷，不用于普通升级。

数据库还包含 Telegram API 凭证、规则与 Apprise 地址。`.env`、数据库、会话文件及其备份均按敏感配置保管。

## 升级与发布验证

升级前备份数据，再执行：

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 telegram-star
```

发布前的代码检查为 `pnpm test`、`pnpm build`、`pnpm db:deploy`，详见 [开发文档](user-development.md#构建与验证)。发布后确认：

- 容器持续运行，迁移成功，Web 与 `/api/health` 可访问。
- Telegram 状态、消息列表、规则与转发配置可读取；涉及相关改动时验证对应操作。
- 页面刷新 / PWA 更新后加载当前版本；使用客户端时确认能连接、设备已注册且最近活动时间更新。

Web/PWA 业务页面随镜像更新。桌面 / 手机壳能力变更需要额外发布原生包；`pnpm build` 不包含原生打包，见 [原生客户端](user-development.md#原生客户端)。

## 数据备份与恢复

可在维护窗口停止服务，再复制完整数据目录，避免复制正在写入的 SQLite 文件：

```bash
mkdir -p backups
backup_dir="backups/$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
docker compose stop telegram-star
docker compose cp telegram-star:/app/data/. "$backup_dir/"
docker compose start telegram-star
```

备份至少应包含数据库及 `session.txt`（登录后生成）；完整目录复制也会保留可能存在的 SQLite WAL / SHM 文件。确认复制成功并将备份保存在数据卷之外。服务端缩略图使用内存缓存，无需单独备份。

恢复步骤：

1. 停止服务，保留当前数据备份，并选定与备份数据库兼容的代码 / 镜像版本。
2. 将备份完整还原到容器挂载的 `/app/data`，使用空数据卷以免混入旧数据库或 WAL / SHM 文件；确认目录可写。
3. 启动服务，检查 migration 日志、Telegram 状态以及消息、规则、转发配置。

只回退代码 / 镜像前，必须确认已执行的 migration 向后兼容；Prisma 部署流程不会自动执行反向迁移。不兼容时恢复升级前数据库备份，备份之后新增的数据不会随之保留。

## GitHub Actions 自动部署

[deploy.yml](../.github/workflows/deploy.yml) 在推送 `main` 或手动触发时，通过 SSH 更新服务器上的 `main` 并执行 Compose 重建。

服务器需预先安装 Git、Docker 和 Compose，在部署目录克隆仓库、准备 `.env`；SSH 用户需有仓库读取权限、目录写权限和 Docker 操作权限。该目录应保持干净，以便 `git pull --ff-only` 成功。

仓库 Actions Secrets：

| Secret | 内容 |
| --- | --- |
| `SSH_HOST` | 服务器地址 |
| `SSH_PORT` | SSH 端口，例如 `22` |
| `SSH_USER` | 部署用户 |
| `SSH_PRIVATE_KEY` | 对应已授权公钥的私钥 |
| `DEPLOY_PATH` | 服务器上的仓库绝对路径 |

工作流依次运行 `git fetch --all --prune`、`git checkout main`、`git pull --ff-only origin main`、`docker compose up -d --build` 和 `docker compose ps`。它**不运行测试、不自动备份，也不等待应用健康检查**；代码验证、备份及发布后检查仍需完成。

## 日志

应用使用单行 JSON 日志。Compose 使用 Docker `local` 驱动，每个容器配置 `20m × 10`，按容量轮转并压缩，不能保证保留多少天。重建容器后旧容器日志不随数据卷保留；需要跨发布保留时另行收集日志。

```bash
docker compose logs -f telegram-star
docker inspect --format '{{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}' telegram-star
```

排查单条消息可搜索日志中的 `rowId` 或 `messageKey`（`chatId:telegramMessageId`）；检查监听延迟与回补时关注 `lagMs` 和 `telegram.catch_up` 事件。

## 访问与缓存

当前应用没有应用层账号或密码保护，Telegram 登录也不是访问控制。后端只应暴露在可信网络，或置于有认证的反向代理之后；CORS 不提供身份验证。

Web/PWA 同源访问不需要额外 CORS。Tauri 本地壳会跨源调用后端健康检查及设备接口；限制 `CORS_ORIGIN` 时需实际验证 WebView 来源。当前实现接受 `*` 或一个来源字符串，不支持逗号分隔白名单。Compose 中该值固定为 `*`，如需更改应覆盖 Compose 环境配置。

远程客户端建议使用 HTTPS 后端根地址；内网 HTTP 仅用于可信网络。使用带认证的代理时，需验证浏览器、PWA 和原生壳都能完成认证并访问 API。

服务端已设置以下缓存策略，反向代理应保留：

| 资源 | Cache-Control |
| --- | --- |
| HTML / 其他静态入口 | `no-cache` |
| `/assets/*` | `public, max-age=31536000, immutable` |
| API 默认 | `no-store` |
| 媒体缩略图等例外 | 由接口显式设置私有缓存策略 |
