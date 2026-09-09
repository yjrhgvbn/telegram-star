# 参与贡献

欢迎反馈问题、改进文档和提交范围清晰的 PR。

## 报告问题

在仓库 Issues 说明：你想完成的操作、复现步骤、预期与实际结果、操作系统 / 浏览器、运行方式（Docker 或本地）、代码版本。UI 问题可附用 Demo 复现的截图。

请先删除日志和截图中的手机号、API Hash、session、私有消息、Apprise 地址和设备信息。不要上传 `.env`、数据库或数据备份。

## 提交修改

1. 按[开发文档](docs/user-development.md)准备 Node.js 24、pnpm 11.9.0 和依赖。
2. 在独立分支实现一个明确改动，遵守 [AGENTS.md](AGENTS.md) 及目录级约束。
3. 修改功能或命令时同步相关使用文档；数据库变更提交 schema 和 migration，不用 `db:push` 代替部署。
4. 完成[构建与验证](docs/user-development.md#构建与验证)，使用本地开发数据或临时数据库；修改 Demo 时执行 `pnpm build:demo` 并实际浏览。
5. PR 说明问题、最终行为、验证结果；UI 改动附虚构数据截图。

引入依赖或改变 API 兼容性前，先在 Issue 或 PR 中说明必要性与替代方案。分支推送和 PR 不触发独立 CI，需要时可在 Actions 手动运行。**推送 `main` 会通过 SSH 更新维护者自己的服务器，并在服务器构建源码。** 推送版本 tag 才触发公开产物的验证、Docker Hub 镜像和安装包发布，见[版本发布文档](docs/version-releases.md)；两条流程互相独立。

通常的功能 PR 不需要单独调整版本号，由维护者发布时统一同步。本地镜像验证见[源码构建](docs/user-development.md#从源码构建镜像)，生产发布见[版本发布文档](docs/version-releases.md)。
