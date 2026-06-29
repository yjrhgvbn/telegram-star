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

通知转发配置通过 Web UI 的「通知设置」页面管理，底层采用 Apprise，配置保存在 SQLite 数据库中。每个转发通道可独立设置标题/正文模板，并可使用简洁、详情、Markdown 三种内置格式预设。

其他变量通常保持默认。

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

## 8. 常见问题

### 8.1 容器不断重启

查看日志：

```bash
docker compose logs --tail=200 telegram-star
```

优先检查 Telegram 凭证配置状态与数据库文件权限。

### 8.2 迁移失败

确认：

- migration 文件存在于镜像内 `packages/server/prisma/migrations`
- `DATABASE_URL` 与 `DB_PATH` 指向可写路径

### 8.3 页面可访问但无消息

- 先在 UI 完成 Telegram API 配置与 Telegram 登录
- 确认已创建筛选器
- 检查后端日志中 Telegram 连接状态
