# Telegram Star 部署文档

本文档面向部署与运维，提供 Docker 部署、升级与回滚建议。

## 1. 部署方式

推荐使用 Docker Compose。

核心特性：

- 镜像内自动执行数据库迁移：`pnpm --filter @telegram-star/server db:deploy`
- SQLite 与 Telegram 会话持久化在卷：`telegram-star-data`
- 应用启动后对外暴露 3000 端口

## 2. 部署前准备

1. 安装 Docker 与 Docker Compose
2. 准备 `.env` 文件
3. 填写 Telegram 凭证

示例：

```bash
cp .env.example .env
```

关键变量：

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

通知转发配置通过 Web UI 的「通知设置」页面管理，默认保存到 `./data/notification-settings.json`。

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

优先检查 Telegram 凭证与数据库文件权限。

### 8.2 迁移失败

确认：

- migration 文件存在于镜像内 `packages/server/prisma/migrations`
- `DATABASE_URL` 与 `DB_PATH` 指向可写路径

### 8.3 页面可访问但无消息

- 先在 UI 完成 Telegram 登录
- 确认已创建筛选器
- 检查后端日志中 Telegram 连接状态
