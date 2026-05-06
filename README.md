# Telegram Star ⭐

Telegram 消息追踪工具 - 监控群组/频道消息，关键词过滤，已读管理。

## 功能

- 🔑 **关键词过滤** - 设置关键词自动匹配消息
- 👥 **群组/频道监听** - 追踪特定群组或频道的所有消息
- 📋 **消息列表** - 卡片式展示，支持搜索和分页
- 👍 **已读管理** - 点赞标记为已读，支持批量操作
- 🔗 **跳转原文** - 一键跳转 Telegram 客户端查看原始消息
- 🔔 **通知转发** - 将命中消息转发到外部应用（当前支持飞书）
- 🐳 **Docker 部署** - 一键启动，数据持久化

## 技术栈

| 层级 | 技术 |
| :--- | :--- |
| 前端 | React + Vite + TypeScript |
| 后端 | Fastify + TypeScript |
| Telegram | GramJS (MTProto) |
| ORM | Prisma ORM v7 |
| 数据库 | SQLite |
| 部署 | Docker |

## 快速开始

### 前置条件

1. Node.js 20+
2. pnpm (`npm install -g pnpm`)
3. 在 [my.telegram.org/apps](https://my.telegram.org/apps) 获取 `api_id` 和 `api_hash`

### 本地开发

```bash
# 1. 克隆项目
git clone <repo-url> telegram-star
cd telegram-star

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 TELEGRAM_API_ID 和 TELEGRAM_API_HASH

# 3. 安装依赖
pnpm install

# 4. 同步数据库结构并启动开发服务
pnpm db:deploy
pnpm dev
```

前端: http://localhost:5173
后端 API: http://localhost:3000

### Docker 部署

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env

# 启动
docker compose up -d

# 访问
open http://localhost:3000
```

## 使用流程

1. 打开 Web UI（http://localhost:5173 或 http://localhost:3000）
2. 输入手机号，接收验证码完成 Telegram 登录
3. 在左侧面板创建过滤器（关键词/群组/频道）
4. 匹配的消息会自动出现在消息列表中
5. 点赞消息标记为已读，点击「查看原文」跳转 Telegram
6. 在「通知设置」页可开启/关闭飞书通知并在线更新 webhook（配置保存到 `./data/notification-settings.json`）

## 项目结构

```
telegram-star/
├── packages/
│   ├── server/          # Fastify 后端
│   │   └── src/
│   │       ├── db/      # Prisma runtime + SQLite
│   │       ├── routes/  # API 路由
│   │       └── services/ # Telegram 服务
│   └── web/             # React + Vite 前端
│       └── src/
│           ├── components/
│           ├── hooks/
│           └── api/
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## License

MIT

## Prisma v7 更新说明

- 运行时查询已从 Drizzle 切换为 Prisma Client + libSQL adapter，继续使用同一个 SQLite 数据文件。
- 后续修改数据结构时，开发环境使用 `pnpm db:migrate -- --name <migration-name>` 生成 migration；部署环境统一执行 `pnpm db:deploy`。

## 文档导航

- 开发文档: [docs/user-development.md](docs/user-development.md)
- 部署文档: [docs/user-deployment.md](docs/user-deployment.md)
- Agent 全局约束: [CLAUDE.md](CLAUDE.md)
- Agent Server 约束: [packages/server/CLAUDE.md](packages/server/CLAUDE.md)
