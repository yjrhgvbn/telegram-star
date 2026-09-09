# 首次公开发布

本文供仓库维护者使用。源码公开、演示站上线和真实服务部署分别准备；真实服务不作为匿名 Demo。

## 已具备的仓库材料

- README：定位、功能、快速体验与安装入口。
- 使用、开发、镜像部署、版本发布与 Demo 文档。
- MIT LICENSE、贡献说明、可手动运行的 CI 检查。
- 独立的虚构数据 Demo 和手动 Pages 发布工作流。
- 统一版本 tag 触发的 Docker Hub 多架构镜像、桌面安装包、可选 Android APK 和 Release 草稿工作流。

## 公开前检查

1. **审核将公开的历史。** 除当前文件外，检查所有分支、tag 和提交历史中的 `.env`、session、数据库、备份、私钥、真实通知地址。忽略规则不能删除已提交的历史。若发现凭据，先撤销或轮换，再处理历史。
2. **审核 GitHub 上的材料。** 检查 Actions 历史日志、Artifacts、Release 附件、Issue、PR 和截图；本地 Git 检查不覆盖这些内容。公开后 Actions 历史与日志也会可见，见 [GitHub 可见性说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)。
3. **确认许可证和第三方材料。** 仓库延续 README 的 MIT 声明并提供 LICENSE；确认有权公开代码、图片和演示素材，保留第三方许可声明。
4. **验证首次安装。** 需要时手动运行 CI；版本 tag 会触发发布工作流自身的构建与测试。完成后，按 Release 的 Docker 命令用空数据卷验证首次安装，并试装客户端。普通 build 不生成原生安装包，工作流配置也不代表已有下载产物。
5. **检查触发与保护规则。** 分支推送和 PR 不触发独立 CI；若分支保护已要求 CI，维护者需在对应提交手动运行，或调整必需检查列表。`main` 推送仍触发自用服务器的 SSH 源码部署，和 tag 发布镜像、安装包互相独立；发布 Demo 不需要 SSH / Telegram Secrets。

## 发布顺序

1. 审阅并提交上述文件，运行构建、测试、发布脚本测试、版本一致性与迁移检查。推送 `main` 前确认自己的服务器已备份，因为这会触发 SSH 源码部署。
2. 完成历史和 GitHub 日志检查后，在仓库 **Settings → General → Danger Zone → Change repository visibility** 改成 Public。该操作会公开代码与提交历史，应由维护者确认后执行。
3. 按 [Demo 发布步骤](demo.md#github-pages)启用 Pages，手动运行 **Publish Demo**。
4. 实际打开线上地址验证四个 Tab、窄屏导航、搜索和完成状态；将真实地址写入 README / About，加入用虚构数据录制的截图或 GIF。
5. 按[版本发布文档](version-releases.md)创建 Docker Hub Public 仓库，配置两个 Secrets 和 `DOCKERHUB_IMAGE=yjrhgvbn/telegram-star`，再同步版本、提交并推送 tag。发布工作流验证后推送镜像，并把直装安装包与部署附件汇总到 Release 草稿。Android 默认跳过，使用自己的 keystore 即可启用，无需应用商店账号。
6. 验证 Docker Hub 镜像可拉取、客户端能安装，再审阅并发布 Release 草稿。仅提供实际生成的附件；macOS 未公证可能需要在系统设置允许打开，Windows 可能提示未知发行者。
7. 维护者自己的服务器由 `main` 推送或手动 **Deploy To Server** 更新最新源码，在服务器本地构建镜像；无需等待公开版本发布。SSH 配置见[部署到自己的服务器](version-releases.md#部署到自己的服务器)。普通用户复制 Release 的 Docker 命令启动服务，需要客户端时下载安装包。

建议 About 描述：`Self-hosted Telegram message monitoring, filtering and forwarding with a web workspace.`

可用 Topics：`telegram`、`self-hosted`、`message-filter`、`apprise`、`react`、`tauri`。

## 当前边界

- 无应用身份认证或多用户隔离；仅 Telegram 授权不能保护管理 API，真实实例使用可信网络或认证反向代理。
- Demo 只有浏览器虚构数据，不支持真实 Telegram 扫描、补录或外部通知发送。
- 持久数据包括消息、API 凭据、会话与通知地址；由实例管理员保管并备份。
- 本文不代表仓库已改成 Public、站点已上线、远端日志已审核或 Docker / 原生安装包已发布。
