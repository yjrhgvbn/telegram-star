# 开发文档

## 环境与初始化

- 推荐 Node.js 24，与 [Dockerfile](../Dockerfile) 一致；使用 [package.json](../package.json) 锁定的 pnpm 11.9.0。
- 本机测试通知转发时需要 `apprise` 命令行；Docker 镜像已安装。可通过系统包管理器或独立 Python 环境安装，并确保服务进程能找到该命令。
- 仅开发 Web / server 时不需要 Rust、Android 或 iOS 工具链。

在仓库根目录执行：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` 并行启动 Web 与 server。server 启动前会构建并应用 migration，开发期间使用 `tsdown --watch` 构建，由 Node 运行 `dist/index.js`。

| 入口 | 默认地址 | 命令 |
| --- | --- | --- |
| Web | http://localhost:5173 | `pnpm dev:web` |
| server | http://localhost:3000 | `pnpm dev:server` |
| 桌面壳前端 | http://127.0.0.1:5180 | `pnpm dev:desktop` |
| 手机壳前端 | http://127.0.0.1:5182 | `pnpm dev:mobile` |

首次在页面填写 Telegram API ID / Hash 并登录。凭证保存在 SQLite，优先于环境变量；转发通道的 Apprise 地址及消息格式在「转发」中配置。

## 配置

完整变量见 [.env.example](../.env.example)。本地建议保留数据库与会话默认路径；修改时让 `DATABASE_URL` 和 `DB_PATH` 指向同一文件。

| 变量 | 用途 |
| --- | --- |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | 可选；数据库没有凭证时兜底 |
| `DATABASE_URL` / `DB_PATH` | 默认 `file:./data/telegram-star.db` / `./data/telegram-star.db` |
| `SESSION_PATH` | Telegram 会话文件，默认 `./data/session.txt` |
| `PORT` / `HOST` | server 监听地址，默认 `3000` / `0.0.0.0` |
| `API_PROXY_TARGET` | Web 开发代理的后端根地址，默认 `http://localhost:3000` |
| `CORS_ORIGIN` | 示例配置为 `*`；远程访问约束见 [部署文档](user-deployment.md#访问与缓存) |
| `LOG_LEVEL` / `GRAMJS_LOG_LEVEL` | 应用 / Telegram 库日志，示例配置为 `info` / `warn` |

server 读取仓库根目录 `.env`。直接运行 Prisma CLI 时由 [prisma.config.ts](../packages/server/prisma.config.ts) 读取配置；使用自定义数据库路径时，应将一致的数据库变量传入该命令，避免迁移到另一文件。

## 构建与验证

```bash
pnpm test
pnpm build
pnpm db:deploy
```

- `pnpm build` 构建 shared、Web、桌面壳前端、手机壳前端和 server，**不生成原生客户端安装包**。
- `pnpm test:web` 只运行 Web 测试；`pnpm test:server` 运行 server 与 shared 测试。
- `pnpm db:deploy` 先构建 shared / server，再执行 migration 部署程序。
- `pnpm start` 构建 shared / server、应用 migration 并启动 Node；本机生产模式需先用 `pnpm build` 生成 Web 产物。
- 修改启动链路时补验 `pnpm start`；修改 UI 时检查实际页面和相关窄屏操作。

发布前确认消息、规则、转发、设置可访问，刷新或 PWA 更新后能加载新版本；有 migration 时确认现有消息与配置仍可读取。Docker 发布验证见 [部署文档](user-deployment.md)。

## 数据库变更

1. 修改 [schema.prisma](../packages/server/prisma/schema.prisma)。
2. 在开发数据库生成 migration：

   ```bash
   pnpm db:migrate -- --name <migration-name>
   ```

3. 检查并提交生成的 migration，按需运行 `pnpm db:generate` 更新 Prisma Client。
4. 部署环境仅执行 `pnpm db:deploy`，不使用 `pnpm db:push` 代替 migration。

更改数据库前备份数据；恢复和版本回退见 [部署文档](user-deployment.md#数据备份与恢复)。

## 原生客户端

桌面与手机客户端是连接远程后端的轻壳，不内置 Fastify、Prisma 或 Telegram 服务。业务页面随服务端 Web 更新；原生壳能力变更才需要重新打包客户端。

| 平台 | 工具链 | 开发 / 打包 |
| --- | --- | --- |
| Desktop | Rust、`cargo tauri` CLI、对应系统构建依赖 | `pnpm tauri:dev` / `pnpm tauri:build` |
| Android | Rust、Tauri CLI、Android Studio / SDK / NDK | `pnpm tauri:android:dev` / `pnpm tauri:android:build` |
| iOS | Rust、Tauri CLI、macOS、Xcode 与签名配置 | `pnpm tauri:ios:dev` / `pnpm tauri:ios:build` |

Android / iOS 首次运行前分别执行 `pnpm tauri:android:init` / `pnpm tauri:ios:init`。`pnpm build:desktop` / `pnpm build:mobile` 只验证壳前端；Tauri 打包命令会通过配置自动构建对应前端。

原生变更需在目标平台检查连接、离线重试、远程页面和系统外链；桌面另验托盘、通知与更新入口，手机另验二维码导入、设备注册。相机扫码依赖 WebView 支持 `BarcodeDetector` 和相机访问；当前未接入 APNs / FCM。

桌面更新检查的公钥与地址在原生编译时配置：

```bash
TAURI_UPDATER_PUBKEY="<public key>" \
TAURI_UPDATER_ENDPOINT_TEMPLATE="https://updates.example.com/{{channel}}/{{target}}/{{arch}}/{{current_version}}" \
pnpm tauri:build
```

`{{channel}}` 为 `stable` 或 `beta`，其余占位符由 Tauri updater 处理。未配置公钥时，检查更新入口显示通道尚未配置。

## 代码与设计入口

| 目录 | 职责 |
| --- | --- |
| `packages/web` | React 页面、领域 feature、共享 API / Query 缓存 |
| `packages/server` | Fastify 路由、领域 service / repository、Telegram 集成、Prisma schema / migrations |
| `packages/shared` | 前后端共享 contract、schema 与类型 |
| `packages/desktop` / `packages/mobile` | 本地连接壳与 Tauri 原生工程 |

前端共用 [UI 设计基准](ui-design.md)。页面 / 组件样式放在源码附近；全局设计 token、基础样式与跨页规则放在 `index.css`。工程约束见 [根 AGENTS.md](../AGENTS.md) 和各包的 AGENTS.md。

shadcn 组件使用仓库已锁定的 CLI，避免 `pnpm dlx shadcn@latest` 引入不同依赖树：

```bash
pnpm shadcn info --json
pnpm shadcn docs button
pnpm shadcn add <component>
```
