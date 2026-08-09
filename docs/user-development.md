# Telegram Star 开发文档

本文档面向项目开发者，覆盖本地开发、数据库变更、联调与常见问题。

## 1. 环境要求

- Node.js 20+
- pnpm 10+
- Python 3 & pip (用于安装 Apprise)
- Docker（可选，用于容器化验证）
- Rust 与 Tauri CLI（可选，仅在运行或打包桌面 / 手机 App 时需要）
- Android Studio / Android SDK / NDK（可选，仅在运行或打包 Android Tauri Mobile 时需要）
- Xcode（可选，仅在运行或打包 iOS Tauri Mobile 时需要，macOS）
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

通知转发配置通过 Web UI 的「通知设置」页面管理，底层调用 Apprise 命令行，配置存储于 SQLite 数据库中。每个转发通道可独立设置标题/正文模板，并可使用简洁、详情、Markdown 三种内置格式预设。

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
- 桌面本地壳开发页：http://127.0.0.1:5180
- 手机本地壳开发页：http://127.0.0.1:5182

说明：

- `pnpm db:deploy` 会先构建 server，再执行 `prisma migrate deploy`。
- `pnpm dev` 会并行启动 web 与 server。
- server 使用 `tsdown --watch` 持续构建，由 Node 运行 `dist/index.js`。
- `pnpm dev:desktop` 只启动 Tauri 本地壳的 Vite 页面，用于验证连接页、加载页和离线页。
- `pnpm tauri:dev` 通过 `packages/desktop/src-tauri` 启动原生桌面壳，需要本机已安装 Rust 与 Tauri CLI。
- 桌面壳的托盘、系统通知、窗口状态、系统外链和更新检查只在 `pnpm tauri:dev` / `pnpm tauri:build` 的原生 Tauri 环境中完整生效。
- `pnpm dev:mobile` 只启动 Tauri Mobile 本地壳的 Vite 页面，用于验证手机连接页、二维码内容导入和远程业务页承载。
- `pnpm tauri:android:*` / `pnpm tauri:ios:*` 会进入 Tauri Mobile 原生命令，需要额外安装 Android 或 iOS 工具链。

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

# 查询或管理前端 shadcn 组件（参数会传给项目内已安装的 CLI）
pnpm shadcn info --json
pnpm shadcn docs button

# 仅启动桌面本地壳开发页
pnpm dev:desktop

# 仅构建桌面本地壳前端产物
pnpm build:desktop

# 仅启动手机本地壳开发页
pnpm dev:mobile

# 仅构建手机本地壳前端产物
pnpm build:mobile

# 启动 Tauri 原生桌面壳（需要 Rust 与 Tauri CLI）
pnpm tauri:dev

# 打包 Tauri 原生桌面壳（需要 Rust 与 Tauri CLI）
pnpm tauri:build

# 初始化/运行/打包 Android 手机壳（需要 Android Studio / SDK / NDK）
pnpm tauri:android:init
pnpm tauri:android:dev
pnpm tauri:android:build

# 初始化/运行/打包 iOS 手机壳（需要 macOS + Xcode）
pnpm tauri:ios:init
pnpm tauri:ios:dev
pnpm tauri:ios:build

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

桌面壳更新通道可在原生打包时通过环境变量配置：

```bash
TAURI_UPDATER_PUBKEY="<public key>"
TAURI_UPDATER_ENDPOINT_TEMPLATE="https://updates.example.com/{{channel}}/{{target}}/{{arch}}/{{current_version}}"
pnpm tauri:build
```

说明：

- `{{channel}}` 由本地壳替换为 `stable` 或 `beta`。
- `{{target}}`、`{{arch}}`、`{{current_version}}` 由 Tauri updater 继续处理。
- 未配置这些变量时，桌面壳仍可启动，检查更新入口会显示“更新通道尚未配置”。

构建范围说明：

- `pnpm build` 包含 shared、web、desktop 前端壳、mobile 前端壳和 server 构建。
- `pnpm build` 不执行 `cargo tauri build`、Android build 或 iOS build，避免普通 Web/server CI 被本机原生工具链阻塞。
- 原生桌面和手机包分别使用 `pnpm tauri:build`、`pnpm tauri:android:build`、`pnpm tauri:ios:build` 验证。

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
- `packages/desktop`: Tauri + React 本地轻壳
  - `src/runtime/*`: 桌面壳本地 serverUrl 存储、health check、远程业务页 URL 构造和 Tauri 原生桥接。
  - `src/shell/*`: 连接页、加载页、离线页、远程业务页承载和桌面能力入口。
  - `src-tauri/*`: Tauri v2 原生工程配置；不内置 Fastify / Prisma / Telegram 后端，只承载托盘、通知、外链、窗口状态和更新检查等客户端能力。
- `packages/mobile`: Tauri Mobile + React 本地轻壳
  - `src/runtime/*`: 手机壳本地 serverUrl 存储、health check、二维码配置解析、设备注册和系统外链。
  - `src/shell/*`: 手机连接页、扫码/导入配置、加载页、离线页和远程业务页承载。
  - `src-tauri/*`: Tauri Mobile 原生工程配置；不内置后端，Android/iOS 工程由 Tauri CLI init 命令生成。
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

### 7.6 shadcn CLI 依赖解析错误

项目已经在 `packages/web` 中安装并锁定了兼容的 `shadcn` 与 Zod 依赖。请从仓库根目录通过项目入口运行 CLI：

```bash
pnpm shadcn info --json
pnpm shadcn docs skeleton
pnpm shadcn add <component>
```

不要在本项目中使用 `pnpm dlx shadcn@latest`。`dlx` 会创建独立的临时依赖树，某些 shadcn / MCP SDK 版本组合可能将 SDK 连接到不兼容的 Zod 版本，并触发 `ERR_PACKAGE_PATH_NOT_EXPORTED: zod/v3`。项目入口直接复用 `packages/web` 已安装的 CLI，不受该临时解析问题影响。
