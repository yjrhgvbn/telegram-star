# Telegram Star

**筛选 Telegram 消息，集中阅读，按需转发。**

Telegram Star 是一个自托管工具，使用你的 Telegram 账号，监听已加入的群组和频道。

[在线 Demo](https://yjrhgvbn.github.io/telegram-star/) · [下载安装](https://github.com/yjrhgvbn/telegram-star/releases) · [使用教程](docs/user-guide.md) · [部署指南](docs/user-deployment.md)

![Telegram Star 消息工作区，全部为虚构演示数据](docs/images/demo-messages.png)

## 能做什么

- **筛选消息**：按来源、关键词、正则或脚本创建规则，预览匹配结果、补录历史消息。
- **集中处理**：按规则浏览、搜索和批量标记完成，查看原文与附件。
- **转发通知**：将命中的消息通过 Apprise 发到通知平台，自定义标题和正文。
- **多端使用**：浏览器、桌面和 Android 连接同一服务端，共享消息与配置。

在线 Demo 使用虚构数据，无需登录；体验范围见 [Demo 说明](docs/demo.md)。

## 安装

先部署一个服务端，再通过浏览器或客户端使用。已有服务端时，直接安装客户端并填写服务端地址。

### 服务端：Docker

安装 Docker，并确保网络能访问 Telegram，执行一条命令：

```bash
docker run -d --name telegram-star --restart unless-stopped --init \
  -p 3000:3000 -v telegram-star-data:/app/data \
  --log-driver local \
  docker.io/yjrhgvbn/telegram-star:0.0.1
```

打开 [http://localhost:3000](http://localhost:3000)；远程部署时使用服务器地址。Docker 自动拉取镜像，Telegram 凭证在页面填写，无需下载配置文件。版本以[发布页](https://github.com/yjrhgvbn/telegram-star/releases)为准，首个版本发布后即可使用。

当前为单用户应用，未内置访问认证，请放在可信网络或有认证的反向代理后。数据会保存在数据卷中，升级和备份见[部署指南](docs/user-deployment.md)。

### 桌面与 Android

从同一下载页选择对应安装包：

| 系统 | 安装包 |
| --- | --- |
| macOS | DMG，按 Apple Silicon / Intel 选择 |
| Windows | EXE |
| Linux | DEB / AppImage |
| Android | APK，arm64 |

安装后填写服务端地址；Android 使用 HTTPS 地址。系统安装提示及连接方法见[客户端说明](docs/user-guide.md#6-连接其他客户端)。各端安装包以下载页实际附件为准，暂无附件时需等待发布。

## 开始使用

1. **登录 Telegram**：从 [my.telegram.org/apps](https://my.telegram.org/apps) 获取 API ID / API Hash，在页面填写后，用手机号和验证码登录；启用两步验证的账号还需输入密码。
2. **创建规则**：在「规则」选一个群组或频道，添加关键词，例如 `发布, 更新`，确认匹配样本后保存。
3. **查看消息**：新命中的内容进入「消息」；想收录旧内容，在规则中执行「补录历史消息」。
4. **处理或转发**：读完标记「完成」；需要通知时，在「转发」添加 Apprise 地址并关联规则。

条件组合、转发模板和常见问题见[使用教程](docs/user-guide.md)。

## 开发与贡献

[开发文档](docs/user-development.md) · [版本发布](docs/version-releases.md) · [参与贡献](CONTRIBUTING.md)

[MIT License](LICENSE)。本项目与 Telegram 官方无隶属关系。
