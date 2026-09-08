# Telegram Star

Telegram 消息监听工具：从群组和频道中筛选关心的内容，按消息组追踪更新、标记完成，并通过 Apprise 转发。

## 功能

- **消息**：查看原文与附件，搜索、筛选、批量标记完成，恢复浏览位置。
- **规则**：按消息来源、关键词等条件筛选，支持条件组、排除组和匹配样本预览。
- **转发**：配置 Apprise 地址、接收规则及标题/正文模板。
- **设置**：管理服务器连接、Telegram 凭据、媒体策略和客户端设备。
- **多端**：Web/PWA，以及连接同一后端的 Tauri 桌面和手机轻壳。

“完成”表示内容已处理或视频已看完；打开消息、附件或 Telegram 链接本身不会自动标记完成。

## 本地开发

使用与 Docker 镜像一致的 Node.js 24，以及 [package.json](package.json) 指定的 pnpm 11.9.0。

```bash
cp .env.example .env
pnpm install
pnpm db:deploy
pnpm dev
```

前端：http://localhost:5173；后端：http://localhost:3000。

首次进入页面时填写从 [Telegram](https://my.telegram.org/apps) 获取的 API ID/Hash，按提示登录，再创建监听规则。凭据也可预先写入 `.env`。本地测试转发需要另行安装 Apprise CLI。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

访问 http://localhost:3000。容器启动时应用数据库迁移，SQLite 和 Telegram 会话保存在 `telegram-star-data` 命名卷。

## 代码结构

| 目录 | 职责 |
| --- | --- |
| `packages/web` | React + Vite 业务界面 |
| `packages/server` | Fastify、GramJS、Prisma v7 + SQLite；tsdown 构建后由 Node 运行 |
| `packages/shared` | 前后端共享契约、校验与类型 |
| `packages/desktop` | Tauri 桌面轻壳 |
| `packages/mobile` | Tauri 手机轻壳 |

## 文档

- [开发](docs/user-development.md)：环境、命令、代码组织与数据库变更。
- [部署](docs/user-deployment.md)：配置、更新、备份恢复与自动部署。
- [UI 基准与页面行为](docs/ui-design.md)：统一样式、交互约定和四个 Tab 的当前行为。
- [Agent 工程约束](AGENTS.md)：自动化开发的边界与验证要求。

文档只维护当前用法和需要持续遵循的约定；改动过程与历史记录保留在 Git 中。

## License

MIT
