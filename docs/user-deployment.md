# 部署文档

本页介绍真实实例的镜像安装与维护；只想用虚构数据体验功能，请看 [Demo](demo.md)。

## Docker 部署

安装 Docker 后直接运行，无需下载配置文件、安装 Compose 或克隆源码。镜像包含 Web、服务端与通知转发组件，支持 `linux/amd64` 和 `linux/arm64`；服务器需能访问 Telegram。

```bash
docker run -d --name telegram-star --restart unless-stopped --init \
  -p 3000:3000 -v telegram-star-data:/app/data \
  --log-driver local \
  docker.io/yjrhgvbn/telegram-star:0.0.1
```

打开 `http://localhost:3000`，远程服务器使用 `http://<server-ip>:3000`。在浏览器填写 Telegram API ID / Hash 并登录，然后配置监听规则与转发通道。

容器启动时自动应用数据库迁移，失败不会继续启动应用。用以下命令检查容器和启动日志，再确认页面能打开：

```bash
docker ps --filter name=telegram-star
docker logs --tail=200 telegram-star
```

公开 Docker Hub 镜像可匿名拉取。若出现 `denied` 或 `manifest unknown`，检查镜像仓库是否为 Public、该版本是否已经发布；示例版本要在首次发布完成后才可用，见[版本发布](version-releases.md)。

## 配置与持久化

`-v telegram-star-data:/app/data` 把数据库、Telegram 会话和配置保存到命名卷 `telegram-star-data`。删除或重建容器不会删除这个命名卷，后续始终挂载同一卷。普通升级不要使用 `docker rm -v` 或 `docker volume rm`。

通常在网页配置即可。需要覆盖容器环境变量时，在启动命令的镜像名称前添加 `-e 变量名=值`：

| 容器环境变量 | 用途 |
| --- | --- |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | 可选；数据库没有 Telegram 凭证时兜底 |
| `LOG_LEVEL` / `GRAMJS_LOG_LEVEL` | 应用 / Telegram 库日志，默认 `info` / `warn` |
| `CORS_ORIGIN` | 默认 `*`；限制跨源访问时使用一个来源字符串 |

镜像默认监听 `0.0.0.0:3000`，数据库和会话路径都在 `/app/data`，无需手动设置。修改 `-p 3000:3000` 左侧端口即可调整宿主机访问端口；更改启动参数或环境变量时按下节重建容器，并保留数据卷。

数据库还包含 API 凭证、规则和 Apprise 地址。数据卷、会话文件及备份均按敏感配置保管。

## 升级与验证

先按下节备份，再选择 [GitHub Releases](https://github.com/yjrhgvbn/telegram-star/releases) 中已发布的版本。以下以 `0.0.2` 为例，先拉取成功，再替换容器，继续使用原数据卷：

```bash
docker pull docker.io/yjrhgvbn/telegram-star:0.0.2 && \
docker stop telegram-star && \
docker rm telegram-star && \
docker run -d --name telegram-star --restart unless-stopped --init \
  -p 3000:3000 -v telegram-star-data:/app/data \
  --log-driver local \
  docker.io/yjrhgvbn/telegram-star:0.0.2
docker logs --tail=200 telegram-star
```

如果原容器自定义过端口或 `-e` 参数，重建时一并保留。镜像固定版本，不使用 `latest`；需要锁定精确镜像时，可使用 Release 的 `image-digest.txt` 中的摘要地址替换镜像名称。

更新后确认页面和 `/api/health` 可访问，Telegram 状态、消息、规则与转发配置仍可读取。Web/PWA 刷新后加载新版本；客户端壳有更新时，从 Release 下载安装包升级。当前不提供自动更新服务。

## 数据备份与恢复

停止服务后复制完整数据目录，避免复制正在写入的 SQLite 文件：

```bash
mkdir -p backups
backup_dir="backups/$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
docker stop telegram-star
docker cp telegram-star:/app/data/. "$backup_dir/"
docker start telegram-star
```

备份至少包含数据库和登录后生成的 `session.txt`；复制完整目录也会保留可能存在的 SQLite WAL / SHM 文件。确认复制成功，把备份保存在数据卷之外。服务端缩略图是内存缓存，无需备份。

恢复时停止容器并保留当前数据备份，将备份完整还原到一个空数据卷，再用与该备份兼容的镜像挂载它启动。不要混入旧数据库或 WAL / SHM 文件；启动后检查迁移日志和业务配置。

回退镜像前需确认数据库迁移向后兼容；部署不会自动反向迁移。不兼容时恢复升级前的数据库备份，备份之后新增的数据不会随之保留。

## 日志

上面的命令使用 Docker `local` 日志驱动，按驱动默认设置轮转。删除旧容器时，其日志不会随数据卷保留；需要长期保存时另行收集。

```bash
docker logs -f telegram-star
docker inspect --format '{{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}' telegram-star
```

排查单条消息可搜索日志中的 `rowId` 或 `messageKey`（`chatId:telegramMessageId`）；监听延迟与回补日志包含 `lagMs` 和 `telegram.catch_up`。

实时消息诊断日志在默认 `LOG_LEVEL=info` 下可见，只记录 ID、时间和处理结果，不记录消息正文或规则内容：

| 事件 | 排查用途 |
| --- | --- |
| `telegram.update.received` | 新消息或编辑更新到达应用 Raw 回调的时间、`updateType`、`messageType`、`pts/ptsCount`；回调先于业务处理执行，但不等同于网络包到达时间；`MessageService` 会被消息业务回调跳过 |
| `telegram.update.gap` | Telegram 发出的 `UpdateChannelTooLong` / `UpdatesTooLong` 告警；仅记录，不额外触发扫描 |
| `telegram.message.processed` | 实时处理结果 `created` / `duplicate` / `unmatched` / `no-active-filters` / `missing-chat`，以及 `filterLoadMs`、`chatResolveMs`、`ingestionMs`、`processingMs` |
| `telegram.message.matched` | 匹配成功、开始查询发送者前的消息键与规则 ID；之后没有完成日志时可继续定位处理是否停滞 |
| `telegram.message.saved` | 入库完成；新增 `filterMatchMs`、`senderResolveMs`、`persistMs`、`notificationQueueMs` 和 `ingestionDurationMs` 分段耗时 |
| `telegram.message.handle_failed` / `telegram.message.ingestion_failed` | 失败阶段 `stage`、耗时和消息键 |

`saved` 中原有 `receivedAt` 仍指发送者查询完成后的时间，`lagMs` 仍优先按编辑时间计算；判断实时到达延迟应查看 `update.received`。`notificationQueueMs` 包含目标查询、模板渲染及任务启动，不等待发送完成；实际发送耗时查看同一消息键的 `notification.apprise.sent/failed`。实时处理结果日志不包含周期扫描中的每条未匹配消息；自动回补仍按原有 10 分钟周期执行。

## Docker Compose 部署

已使用 Compose 的实例继续在原部署目录按原方式维护，保留项目名、`.env` 和数据卷。Compose 卷名通常带项目名前缀；直接改用上面的 `docker run` 可能挂载一个新空卷，不能直接切换。

偏好 Compose 时，也可下载同一 Release 的 `docker-compose.yml` 和 `telegram-star.env.example`，首次复制后启动：

```bash
cp telegram-star.env.example .env
docker compose pull
docker compose up -d --no-build --wait --wait-timeout 180
```

升级时只修改 `.env` 中 `TELEGRAM_STAR_IMAGE` 的版本再运行 pull / up，不覆盖已有配置，也不使用 `docker compose down -v`。已有源码构建部署继续使用原构建覆盖文件。

## 访问与缓存

当前应用没有应用层账号或密码保护，Telegram 登录也不是访问控制。后端只应暴露在可信网络，或置于有认证的反向代理之后；CORS 不提供身份验证。上面的 `-p 3000:3000` 映射所有网卡；只供本机或本机反向代理访问时，改为 `-p 127.0.0.1:3000:3000`。

Web/PWA 同源访问不需要额外 CORS。Tauri 本地壳会跨源调用健康检查和设备接口；限制 `CORS_ORIGIN` 时需验证 WebView 来源。当前接受 `*` 或一个来源字符串，不支持逗号分隔白名单；使用 Docker 时通过 `-e CORS_ORIGIN=...` 配置，Compose 用户修改其环境配置。

远程客户端使用 HTTPS 后端根地址。Android 正式 APK 默认禁止明文 HTTP；Web / 桌面内网 HTTP 仅用于可信网络。使用认证代理时，需验证浏览器、PWA 和原生壳都能完成认证并访问 API。

服务端缓存策略如下，反向代理应保留：

| 资源 | Cache-Control |
| --- | --- |
| HTML / 其他静态入口 | `no-cache` |
| `/assets/*` | `public, max-age=31536000, immutable` |
| API 默认 | `no-store` |
| 媒体缩略图等例外 | 由接口显式设置私有缓存策略 |
