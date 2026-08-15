# packages/web/CLAUDE.md

本文件仅约束 `packages/web` 范围内的 AI 开发行为。

## 1. 模块事实（请先理解再改）

- 技术栈：React 19 + Vite + TypeScript
- 构建：`tsc -b && vite build`
- 开发：`vite`
- API 访问入口：`src/shared/api/*`
- 兼容聚合入口：`src/api/client.ts`
- 类型优先来源：`@telegram-star/shared/contracts/*`

关键文件：

- 应用入口: [packages/web/src/main.tsx](packages/web/src/main.tsx)
- 根组件: [packages/web/src/App.tsx](packages/web/src/App.tsx)
- API 客户端: [packages/web/src/shared/api](packages/web/src/shared/api)
- 兼容聚合入口: [packages/web/src/api/client.ts](packages/web/src/api/client.ts)
- 类型定义: [packages/web/src/types/index.ts](packages/web/src/types/index.ts)

## 2. 绝对约束

- 不要擅自更改 API 返回字段语义；若后端字段变化，必须同步类型与渲染逻辑。
- 不要引入重型状态管理库（如 Redux、MobX）除非用户明确要求。
- 不要在组件内硬编码后端地址，统一走 `src/shared/api/*` 或兼容聚合入口 `src/api/client.ts`。
- 不要提交无关样式重排或大面积格式化。

## 3. API 联动规则

当后端路由或响应结构变化时，必须按顺序检查：

1. `packages/shared/src/contracts/*` 是否需要更新
2. `src/shared/api/*` 请求参数与返回类型
3. `src/api/client.ts` 兼容聚合入口是否需要同步
4. `src/types/index.ts` 旧类型定义是否仍被使用
5. 受影响 feature/component 的渲染字段与交互逻辑

若发现 breaking change，需在提交说明中明确标注。

## 4. UI 改动原则

- 优先最小改动，保持现有交互与视觉风格一致。
- 新增状态（loading/error/empty）时，保持文案简洁并与现有页面一致。
- 涉及列表性能时，优先优化渲染与请求频率，不要先做大改架构。
- `src/index.css` 仅用于全局设计 token、基础元素样式和跨页面共享规则；页面、feature 或组件专属样式应放在对应源码附近（如 `Component.css`），并由组件显式引入。

## 5. 提交前最小验证

至少执行：

```bash
pnpm --filter @telegram-star/web build
```

若涉及前后端联动，补充执行：

```bash
pnpm build
pnpm start
```

## 6. 与全局规则关系

- 本文件为 web 目录就近规则。
- 与全局规则冲突时，以本文件为准。
- 全局规则以仓库根目录 [AGENTS.md](../../AGENTS.md) 为准；本文件保留给旧 Agent 兼容。
