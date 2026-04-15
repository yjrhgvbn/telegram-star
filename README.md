# Telegram Star ⭐

Telegram 消息追踪工具 - 监控群组/频道消息，关键词过滤，已读管理。

## 功能

- 🔑 **关键词过滤** - 设置关键词自动匹配消息
- 👥 **群组/频道监听** - 追踪特定群组或频道的所有消息
- 📋 **消息列表** - 卡片式展示，支持搜索和分页
- 👍 **已读管理** - 点赞标记为已读，支持批量操作
- 🔗 **跳转原文** - 一键跳转 Telegram 客户端查看原始消息
- 🐳 **Docker 部署** - 一键启动，数据持久化

## 技术栈

| 层级 | 技术 |
| :--- | :--- |
| 前端 | React + Vite + TypeScript |
| 后端 | Fastify + TypeScript |
| Telegram | GramJS (MTProto) |
| ORM | Drizzle ORM |
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

# 4. 启动开发服务
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

## 项目结构

```
telegram-star/
├── packages/
│   ├── server/          # Fastify 后端
│   │   └── src/
│   │       ├── db/      # Drizzle ORM + SQLite
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
