# Telegram Star 发布检查清单

本文档用于每次发版前确认 Web、后端、桌面壳和手机壳的基本健康状态。

## 1. 通用验证

```bash
pnpm test
pnpm build
pnpm db:deploy
```

验收：

- 单元测试全部通过。
- shared、web、desktop 前端壳、mobile 前端壳、server 构建通过。
- Prisma migration 无异常，部署链路仍使用 `pnpm db:deploy`。

## 2. Docker 验证

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 telegram-star
```

验收：

- 容器状态为 running。
- 日志中无 migration 或启动错误。
- `http://localhost:3000` 可访问 Web UI。

## 3. Web / PWA 验证

- 打开 Web UI。
- 测试 Telegram 登录状态、消息列表、过滤器、通知转发设置。
- 刷新页面后仍可访问。
- 已安装 PWA 时确认更新提示或刷新后生效。

## 4. Tauri Desktop Smoke Test

```bash
pnpm build:desktop
cargo check --manifest-path packages/desktop/src-tauri/Cargo.toml
pnpm tauri:dev
```

验收：

- 未配置地址时显示连接页。
- 错误地址显示离线页。
- 正确地址通过 `/api/health` 后加载远程业务页。
- 托盘菜单可打开主窗口、切换服务器、检查更新。
- 系统通知测试按钮可触发权限请求或通知。

## 5. Tauri Mobile Smoke Test

```bash
pnpm build:mobile
cargo check --manifest-path packages/mobile/src-tauri/Cargo.toml
pnpm tauri:android:dev
pnpm tauri:ios:dev
```

验收：

- 手机壳开发页可输入服务器地址并连接后端。
- 二维码内容导入可自动填入地址并测试连接。
- 支持 `BarcodeDetector` 的 WebView 可打开相机扫码。
- 后端设置页设备列表能看到 `mobile / tauri` 设备。
- Push token 字段预留，不要求真实推送到达。

## 6. 发布后观察

- 检查后端日志。
- 检查设备列表 `lastSeenAt` 是否更新。
- 检查 Web/PWA/Tauri 远程业务页是否加载最新静态资源。
- 如果有 migration，确认历史消息、过滤器和通知转发配置仍存在。

## 7. 回滚提醒

- 回滚代码前先确认本次 migration 是否向后兼容。
- SQLite 数据卷不要删除。
- 桌面壳和手机壳如果只改了远程业务页，一般不需要重新发布原生包。
