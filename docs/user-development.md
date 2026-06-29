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

# 运行单元测试
pnpm test

# 仅运行前端测试
pnpm test:web

# 仅运行后端与 shared 测试
pnpm test:server

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
  - `src/features/*`: 领域功能实现。页面 wrapper 只负责挂载 feature，不承载复杂业务逻辑。
  - `src/shared/api/*`: 按领域拆分的 typed API 调用。`src/api/client.ts` 只保留兼容聚合入口。
  - `src/shared/query/*`: TanStack Query client 与 query keys。新增服务端状态请求优先使用 `useQuery` / `useMutation`，并通过统一 query key 做缓存更新或失效。
- `packages/server`: Fastify + Prisma 后端
  - `src/modules/*`: 领域模块。优先采用 `*.routes.ts` + `*.service.ts` + `*.repository.ts` 结构。
  - `src/routes/*`: 仅保留尚未模块化或天然轻量的 HTTP 边界，例如 auth/chats。
  - `src/services/telegram/*`: Telegram client、监听、历史拉取、媒体元信息与已读同步等外部服务边界。
- `packages/shared`: 前后端共享 contract、schema 与类型
- `packages/server/prisma`: schema 与 migrations
- `packages/server/src`: 业务代码
- `Dockerfile` 与 `docker-compose.yml`: 镜像构建与部署

新增后端领域功能时，优先复用以下模板：

1. 在 `packages/shared/src/contracts/<domain>.ts` 定义输入、输出与响应 schema。
2. 在 `packages/server/src/modules/<domain>/<domain>.repository.ts` 放 Prisma 查询与写入。
3. 在 `packages/server/src/modules/<domain>/<domain>.service.ts` 放业务编排、错误语义与响应格式化。
4. 在 `packages/server/src/modules/<domain>/<domain>.routes.ts` 放 HTTP 注册、schema parse 和状态码映射。
5. 为纯逻辑、格式化、边界值或高影响副作用补充 Vitest 测试。

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

### 7.4 单元测试

当前测试使用 Vitest，优先覆盖过滤器匹配、消息分页、配置解析、媒体缓存策略、Telegram 媒体元信息、后端 service 边界等可独立验证的纯逻辑：

```bash
pnpm test
```

新增共享契约或业务规则时，应优先补充对应测试，再进行页面或后端模块拆分。

更多测试分层与新增用例建议见 [测试策略](testing-strategy.md)。

### 7.5 重构恢复入口

跨多轮继续重构时，先阅读 [docs/code-refactor-roadmap.md](code-refactor-roadmap.md)。该文档记录每个阶段的目标、决策、完成记录、验证命令与当前架构快照，避免上下文压缩后丢失目标。
