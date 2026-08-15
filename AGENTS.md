# AGENTS.md

本文件面向在本仓库工作的 AI Coding Agent（包括 Codex、Copilot Agent、Cursor Agent 等）。

## 1. 目标与边界

- 目标：在不破坏现有行为的前提下，持续交付可运行、可构建、可部署的改动。
- 技术栈：
  - 前端：React + Vite + TypeScript
  - 后端：Fastify + TypeScript
  - 数据层：Prisma v7 + SQLite
  - 打包：tsdown（server）
- 禁止：
  - 未经明确要求大规模重构
  - 未验证即改动数据库结构
  - 提交与任务无关的格式化噪音

## 2. 工作前检查

每次改动前优先确认：

1. 当前脚本与命令：查看 [package.json](package.json)、[packages/server/package.json](packages/server/package.json)
2. 环境变量：查看 [.env.example](.env.example)
3. 部署链路：查看 [Dockerfile](Dockerfile)、[docker-compose.yml](docker-compose.yml)

## 3. 必须遵循的工程约束

- 后端运行方式：
  - 使用 tsdown 产物 + Node 运行
  - 不要把启动链路改回 tsx
- 数据库变更方式：
  - 先改 Prisma schema，再生成 migration
  - 部署侧仅执行 `pnpm db:deploy`
- 代码改动原则：
  - 最小改动优先
  - 保持 API 兼容，除非用户明确要求 breaking change
- 前端样式组织：
  - [packages/web/src/index.css](packages/web/src/index.css) 仅放全局设计 token、基础元素样式和跨页面共享规则
  - 页面、功能或组件专属样式应放在对应源码附近（如 `Component.css`），并由使用它的组件显式引入，避免继续堆积到 `index.css`

## 4. 推荐执行顺序

1. 读取相关模块代码与文档
2. 实施最小改动
3. 本地验证（至少执行）：

```bash
pnpm build
pnpm db:deploy
```

4. 如果涉及启动链路，补充验证：

```bash
pnpm start
```

## 5. 文档同步策略

出现以下变更时，必须同步文档：

- 命令变化：更新 [docs/user-development.md](docs/user-development.md) 与 [README.md](README.md)
- 部署变化：更新 [docs/user-deployment.md](docs/user-deployment.md)
- agent 约束变化：更新本文件与目录级 [AGENTS.md](AGENTS.md)（如 [packages/server/AGENTS.md](packages/server/AGENTS.md)、[packages/web/AGENTS.md](packages/web/AGENTS.md)）

## 6. 目录级规则

- 全局规则：本文件 [AGENTS.md](AGENTS.md)
- server 规则：就近遵循 [packages/server/AGENTS.md](packages/server/AGENTS.md)
- web 规则：就近遵循 [packages/web/AGENTS.md](packages/web/AGENTS.md)

当目录级规则冲突时：子目录规则优先。

## 7. 测试规则
- 后端服务端口默认 3000，前端默认 5173。
- 直接访问 http://localhost:5173/ 访问前端，http://localhost:3000/ 访问后端，如果可以访问，说明服务端和前端都正常运行。
- 修改后不用重新启动服务，有热更新的情况下，直接访问前端和后端地址都可以访问最新的代码。
- 修改代码后，优先执行构建和部署命令验证改动是否破坏现有行为，如果涉及ui改动，访问界面进行验证。

## 8. 其他约束
- 生成代码时，优先使用成熟的库和工具，引入新依赖前需评估稳定性和安全性，并与用户确认。
- 生成的代码必须包含必要的注释，特别是复杂逻辑和重要决策点。
