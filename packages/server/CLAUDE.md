# packages/server/CLAUDE.md

本文件仅约束 `packages/server` 范围内的 AI 开发行为。

## 1. 模块事实（请先理解再改）

- 构建：tsdown，输出到 `dist`
- 运行：`node dist/index.js`
- DB 部署：`node dist/db/deploy.js` -> `prisma migrate deploy`
- Prisma Client 输出目录：`src/generated/prisma`

关键文件：

- schema: [packages/server/prisma/schema.prisma](packages/server/prisma/schema.prisma)
- migrate deploy 脚本: [packages/server/src/db/deploy.ts](packages/server/src/db/deploy.ts)
- Prisma 初始化: [packages/server/src/db/index.ts](packages/server/src/db/index.ts)
- 服务入口: [packages/server/src/index.ts](packages/server/src/index.ts)
- 打包配置: [packages/server/tsdown.config.ts](packages/server/tsdown.config.ts)

## 2. 绝对约束

- 不要把 server 启动改回 `tsx src/index.ts`
- 不要跳过 migration 直接在运行时建表
- 不要手写 SQL 去替代 Prisma 模型层（除非明确要求）
- 不要改动 Prisma 生成目录结构，除非同步修改 import 与构建验证

## 3. 数据库改动流程（强制）

1. 修改 [packages/server/prisma/schema.prisma](packages/server/prisma/schema.prisma)
2. 执行：

```bash
pnpm db:migrate -- --name <migration-name>
```

3. 检查 migration 文件是否合理
4. 执行：

```bash
pnpm build
pnpm db:deploy
```

## 4. API 改动注意事项

- 新增或修改业务接口时，优先放入 `src/modules/<domain>`：
  - `*.routes.ts`：HTTP 注册、shared schema parse、状态码映射
  - `*.service.ts`：业务编排、错误语义、响应格式化
  - `*.repository.ts`：Prisma 查询与写入
- 修改 API contract 时，优先同步 [packages/shared/src/contracts](../shared/src/contracts)。
- web 侧 API 首选 [packages/web/src/shared/api](../web/src/shared/api)，[packages/web/src/api/client.ts](../web/src/api/client.ts) 仅作为兼容聚合入口。
- 返回结构尽量保持 shared contract 兼容，避免前端无感知破坏。

## 5. 提交前最小验证

至少执行：

```bash
pnpm --filter @telegram-star/server build
pnpm --filter @telegram-star/server db:deploy
```

若改动入口、路由或数据库行为，再执行：

```bash
pnpm start
```

## 6. Docker 相关联动

当 server 构建产物路径、启动命令、Prisma 目录发生变化时，必须同步检查：

- [Dockerfile](Dockerfile)
- [docker-compose.yml](docker-compose.yml)

并验证容器启动链路仍然是“先 deploy，再 start”。
