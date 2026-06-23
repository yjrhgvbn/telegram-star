# Telegram Star 开发文档

本文档面向项目开发者，覆盖本地开发、数据库变更、联调与常见问题。

## 1. 环境要求

- Node.js 20+
- pnpm 10+
- Python 3 & pip (用于安装 Apprise)
- Docker（可选，用于容器化验证）
- Telegram 开发者凭证：`TELEGRAM_API_ID`、`TELEGRAM_API_HASH`（可启动后在 Web UI 中填写）

## 2. 初始化

```bash
pnpm install
cp .env.example .env
```

推荐保留默认值：

- `DATABASE_URL=file:./data/telegram-star.db`
- `DB_PATH=./data/telegram-star.db`
- `SESSION_PATH=./data/session.txt`

Telegram API ID/Hash 推荐在首次打开 Web UI 时填写，配置会保存到 SQLite 数据库。也可以在 `.env` 中预先填写 `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`，数据库配置会优先于 `.env`，`.env` 仅在数据库未保存配置时兜底。

通知转发配置通过 Web UI 的「通知设置」页面管理，底层调用 Apprise 命令行，配置存储于 SQLite 数据库中。

> **注意**：本地开发环境如果在非 Docker 下运行 `pnpm dev:server` 且需要测试通知推送功能，请确保本机的系统或环境中已安装 apprise 命令行工具，例如：
> `pip3 install apprise --break-system-packages` 或 `brew install apprise`。

## 3. 启动本地开发

```bash
pnpm db:deploy
pnpm dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3000

说明：

- `pnpm db:deploy` 会先构建 server，再执行 `prisma migrate deploy`。
- `pnpm dev` 会并行启动 web 与 server。
- server 使用 `tsdown --watch` 持续构建，由 Node 运行 `dist/index.js`。

## 4. 常用命令

```bash
# 全量构建
pnpm build

# 仅启动生产链路（本机）
pnpm start

# 仅生成 Prisma Client
pnpm db:generate

# 创建新 migration（开发环境）
pnpm db:migrate -- --name <migration-name>

# 应用 migration（部署环境）
pnpm db:deploy

# 直接按 schema 推送（不生成 migration，谨慎）
pnpm db:push
```

## 5. 数据库变更流程（推荐）

1. 修改 `packages/server/prisma/schema.prisma`
2. 运行 `pnpm db:migrate -- --name <migration-name>`
3. 提交新 migration 文件
4. 在部署环境执行 `pnpm db:deploy`

不要在生产环境使用 `db push` 代替 migration。

## 6. 代码结构说明

- `packages/web`: React + Vite 前端
- `packages/server`: Fastify + Prisma 后端
- `packages/server/prisma`: schema 与 migrations
- `packages/server/src`: 业务代码
- `Dockerfile` 与 `docker-compose.yml`: 镜像构建与部署

## 7. 排障建议

### 7.1 Prisma 相关错误

先执行：

```bash
pnpm --filter @telegram-star/server build
pnpm --filter @telegram-star/server db:deploy
```

### 7.2 端口冲突

- web 默认 5173
- server 默认 3000

调整 `.env` 中 `PORT` 或停止占用端口的进程。

### 7.3 Telegram 登录失败

检查：

- Web UI 中保存的 Telegram API ID 是否为数字，或 `.env` 中的 `TELEGRAM_API_ID` 是否为数字
- Web UI 中保存的 Telegram API Hash 是否完整，或 `.env` 中的 `TELEGRAM_API_HASH` 是否完整
- 本机网络是否能访问 Telegram
