# Telegram Star 部署文档

本文档面向部署与运维，提供 Docker 部署、升级与回滚建议。

## 0. GitHub Actions 自动部署（推荐）

仓库已提供工作流：[.github/workflows/deploy.yml](.github/workflows/deploy.yml)。

触发方式：

- push 到 `main`
- 在 GitHub Actions 页面手动执行 `workflow_dispatch`

### 0.1 服务器准备

在服务器上准备代码目录（示例路径 `/opt/telegram-star`）：

```bash
mkdir -p /opt/telegram-star
cd /opt/telegram-star
git clone <your-repo-url> .
cp .env.example .env
# 可选：编辑 .env 覆盖端口、数据库路径或预置 TELEGRAM_API_ID / TELEGRAM_API_HASH
```

确保服务器已安装：

- Docker
- Docker Compose（`docker compose` 子命令可用）

### 0.2 GitHub Secrets 配置

在仓库 `Settings -> Secrets and variables -> Actions` 中添加：

- `SSH_HOST`：服务器 IP 或域名
- `SSH_PORT`：SSH 端口（通常 `22`）
- `SSH_USER`：SSH 用户
- `SSH_PRIVATE_KEY`：用于登录服务器的私钥内容
- `DEPLOY_PATH`：服务器上的项目目录（如 `/opt/telegram-star`）

说明：

- 建议为部署单独创建 SSH 密钥对
- 将公钥写入服务器目标用户的 `~/.ssh/authorized_keys`
- 私钥完整内容（含 `BEGIN/END`）放入 `SSH_PRIVATE_KEY`

### 0.3 工作流执行内容

工作流在服务器执行：

```bash
cd "$DEPLOY_PATH"
git fetch --all --prune
git checkout main
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
```

这会自动完成：

- 拉取最新代码
- 重建并重启容器
- 容器启动时自动执行 Prisma `db:deploy`

### 0.4 首次验证

首次配置完成后，建议手动触发一次 Actions 并检查：

- Actions 日志是否成功
- 服务器上 `docker compose ps` 状态是否正常
- 页面是否可访问（默认 `http://<server-ip>:3000`）

## 1. 部署方式

推荐使用 Docker Compose。

核心特性：

- 镜像内自动执行数据库迁移：`pnpm --filter @telegram-star/server db:deploy`
- SQLite 与 Telegram 会话持久化在卷：`telegram-star-data`
- 应用启动后对外暴露 3000 端口

多端部署关系：

- 后端和 Web/PWA 仍只部署一份，由 Docker 容器托管。
- Tauri Desktop 和 Tauri Mobile 不内置后端，只保存用户填写或扫码得到的后端根地址。
- 桌面壳、手机壳的发版与后端 Docker 发版独立；业务页面更新随后端 Web dist 更新，壳能力更新才需要重新打包客户端。

## 2. 部署前准备

1. 安装 Docker 与 Docker Compose
2. 准备 `.env` 文件（可选但推荐保留默认运行参数）
3. 启动后在 Web UI 填写 Telegram 凭证，或在 `.env` 中预先填写

示例：

```bash
cp .env.example .env
```

关键变量：

- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`：可选；仅在数据库未保存 Telegram 配置时作为兜底
- `DATABASE_URL` / `DB_PATH`：保留默认即可，Docker 中指向 `/app/data/telegram-star.db`
- `TELEGRAM_STAR_MEMORY_LIMIT`：容器内存硬上限，默认 `1536m`；异常时只重启容器，避免拖死宿主机
- `NODE_MAX_OLD_SPACE_SIZE_MB`：Node.js V8 堆上限，默认 `768`；应低于容器内存上限

通知转发配置通过 Web UI 的「通知设置」页面管理，底层采用 Apprise，配置保存在 SQLite 数据库中。每个转发通道可独立设置标题/正文模板，并可使用简洁、详情、Markdown 三种内置格式预设。

其他变量通常保持默认。

生产宿主机建议额外配置 2–4 GiB Swap。Swap 不是内存泄漏的解决方案，但能在瞬时内存压力下为 SSH、Docker 和系统守护进程保留恢复窗口。

## 3. 首次部署

```bash
docker compose up -d --build
```

检查状态：

```bash
docker compose ps
docker compose logs -f telegram-star
```

访问地址：

- http://localhost:3000

如果桌面壳或手机壳连接远程后端，建议使用 HTTPS 域名作为 `serverUrl`。内网 HTTP 可用于局域网或 Tailscale 等可信网络，但不建议裸露到公网。

## 4. 升级发布

```bash
git pull
docker compose up -d --build
```

说明：

- 容器启动命令会自动执行 `db:deploy`，应用新 migration。
- 数据卷不删除时，历史消息与 session 会保留。

## 5. 回滚建议

推荐策略：

1. 回滚代码/镜像版本
2. 保留同一数据卷
3. 重启服务并确认日志

注意：

- 如果新版本 migration 已执行，回滚前需确认 schema 向后兼容。
- Prisma 默认不自动 down migration，生产回滚请提前演练。

## 6. 数据与备份

持久化位置：

- 容器内：`/app/data`
- Compose 卷：`telegram-star-data`

备份建议：

- 备份 SQLite 文件：`telegram-star.db`
- 备份会话文件：`session.txt`
- SQLite 中包含 Web UI 保存的 Telegram API 配置，请按敏感数据处理

可在维护窗口执行卷级备份。

## 7. 安全建议

- 不要将 `.env` 提交到仓库
- 使用强访问控制保护宿主机
- 生产环境建议将 `CORS_ORIGIN` 设置为明确域名
- 定期更新镜像基础版本与依赖

### 7.1 多端访问与 CORS

Web/PWA 直接访问后端同源页面时，不需要额外 CORS 配置。Tauri Desktop / Mobile 的本地壳会从本地 WebView origin 请求远程后端 `/api/health`、`/api/clients/register` 等接口，因此需要后端允许对应来源。

推荐做法：

- 个人内网或 Tailscale 部署可保留 `CORS_ORIGIN=*`，便于不同端连接。
- 公网反向代理部署应优先通过 Cloudflare Access、Basic Auth 或私有网络限制访问，而不是只依赖 CORS。
- 如果改成明确 CORS 白名单，需要把 Web 域名和 Tauri WebView origin 一并纳入测试。

### 7.2 无应用层认证的访问边界

当前应用按单用户自用工具设计，不内置应用层登录或单用户密码保护。因此部署后不应将无保护的后端直接暴露到不可信公网，否则消息、媒体、过滤器、通知配置、Telegram API 配置等接口都可能被访问。

推荐至少采用一种网络层或反向代理层保护：

| 方式 | 适用场景 | 说明 |
| --- | --- | --- |
| Tailscale / ZeroTier | 个人自用、跨设备访问 | 后端只暴露在私有网络内，推荐优先考虑 |
| Cloudflare Tunnel + Access | 需要固定域名和公网访问 | 由 Cloudflare Access 负责访问控制 |
| Nginx Basic Auth | 简单公网保护 | 成本低，但体验和安全能力有限 |
| 局域网 / NAS 内网 | 仅家庭或办公室访问 | 不离开可信网络时最简单 |

如果后续必须直接公网访问，应先重新评估并补充应用层认证，再开放服务。

### 7.3 HTTPS 与缓存建议

推荐响应头：

```text
/index.html
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/api/*
  Cache-Control: no-store

/api/media/*/thumb
  Cache-Control: private, max-age=86400
```

说明：

- `index.html` 不强缓存，便于 Web/PWA/Tauri 远程业务页发现新版本。
- Vite hash 资源可长期缓存，提升浏览器和 WebView 二次加载速度。
- API 默认不缓存，避免消息、配置和 Telegram 状态泄露或过期。
- 移动端扫码配置建议使用 HTTPS serverUrl；内网 HTTP 只用于可信网络。

## 8. 多端发布建议

后端 / Web / PWA：

```bash
git pull
docker compose up -d --build
```

Tauri Desktop：

```bash
pnpm build:desktop
pnpm tauri:build
```

Tauri Mobile：

```bash
pnpm build:mobile
pnpm tauri:android:build
pnpm tauri:ios:build
```

说明：

- `pnpm build:mobile` 只验证手机壳前端产物，不需要 Android / iOS 原生工具链。
- `pnpm tauri:android:*` 需要 Android Studio、SDK、NDK 与目标模拟器/真机。
- `pnpm tauri:ios:*` 需要 macOS、Xcode 与签名配置。
- 手机壳第一版预留 Push token 字段，但未接入 APNs / FCM，部署后不会产生推送服务依赖。

## 9. 常见问题

### 9.1 容器不断重启

查看日志：

```bash
docker compose logs --tail=200 telegram-star
```

优先检查 Telegram 凭证配置状态与数据库文件权限。

### 9.2 迁移失败

确认：

- migration 文件存在于镜像内 `packages/server/prisma/migrations`
- `DATABASE_URL` 与 `DB_PATH` 指向可写路径

### 9.3 页面可访问但无消息

- 先在 UI 完成 Telegram API 配置与 Telegram 登录
- 确认已创建筛选器
- 检查后端日志中 Telegram 连接状态
