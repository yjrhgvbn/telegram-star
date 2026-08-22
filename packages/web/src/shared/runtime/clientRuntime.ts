import type {
  ClientCapabilities,
  ClientDeviceRegisterInput,
  ClientOs,
  ClientPlatform,
  ClientRuntimeType,
} from "@telegram-star/shared/contracts/clients";
import { getBrowserStorage } from "@telegram-star/shared/browser-storage";

export const CLIENT_DEVICE_ID_STORAGE_KEY = "telegram-star:client-device-id:v1";

export interface ClientRuntime {
  type: ClientRuntimeType;
  platform: ClientPlatform;
  os?: ClientOs;
  appVersion?: string;
  capabilities: ClientCapabilities;
}

interface RuntimeDetectionOptions {
  userAgent?: string;
  platformText?: string;
  standalone?: boolean;
  notificationSupported?: boolean;
  tauriAvailable?: boolean;
}

type ClientDeviceStorage = Pick<Storage, "getItem" | "setItem">;

function getRandomClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // 极老浏览器或受限 WebView 可能没有 randomUUID，退化方案只用于区分本地设备记录。
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBrowserRuntimeOptions(): RuntimeDetectionOptions {
  if (typeof window === "undefined") return {};

  const navigatorLike = window.navigator;
  const displayStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;

  return {
    userAgent: navigatorLike.userAgent,
    platformText: navigatorLike.platform,
    // iOS Safari 使用 navigator.standalone 表达“添加到主屏幕”模式，需要和标准 display-mode 合并判断。
    standalone: displayStandalone || Boolean((navigatorLike as { standalone?: boolean }).standalone),
    notificationSupported: "Notification" in window,
    tauriAvailable: "__TAURI__" in window,
  };
}

function getAppVersion(): string {
  // Vitest 不会经过 Vite define 替换，测试环境使用稳定默认值即可。
  return typeof __APP_VERSION__ === "undefined" ? "1.0.0" : __APP_VERSION__;
}

export function detectClientOs(
  userAgent = "",
  platformText = "",
): ClientOs | undefined {
  const text = `${userAgent} ${platformText}`.toLowerCase();

  // UA 和 platform 都不可靠，但足够作为展示和后续能力分流的辅助信息；安全逻辑不能依赖它。
  if (/iphone|ipad|ipod/.test(text)) return "ios";
  if (text.includes("android")) return "android";
  if (/mac|darwin/.test(text)) return "macos";
  if (/win/.test(text)) return "windows";
  if (/linux|x11/.test(text)) return "linux";

  return undefined;
}

export function detectClientRuntime(
  options: RuntimeDetectionOptions = getBrowserRuntimeOptions(),
): ClientRuntime {
  const os = detectClientOs(options.userAgent, options.platformText);
  const platform: ClientPlatform = options.tauriAvailable ? "tauri" : "browser";
  // 原生壳优先于 PWA display-mode；Tauri mobile 在 iOS/Android 上归类为手机端。
  const type: ClientRuntimeType = platform === "tauri"
    ? os === "ios" || os === "android"
      ? "mobile"
      : "desktop"
    : options.standalone
      ? "pwa"
      : "web";

  const capabilities: ClientCapabilities = {
    nativeNotification: Boolean(options.notificationSupported),
    // 浏览器端不承诺安全存储；桌面/手机壳后续可接入系统 Keychain/Keystore。
    secureStorage: platform !== "browser",
    openExternal: true,
    scanQrCode: platform === "tauri" && type === "mobile",
    backgroundRefresh: type === "pwa" || platform !== "browser",
    tray: platform === "tauri" && type === "desktop",
    appUpdater: platform === "tauri" && type === "desktop",
  };

  return {
    type,
    platform,
    os,
    appVersion: getAppVersion(),
    capabilities,
  };
}

export function getClientDeviceId(
  storage: ClientDeviceStorage | undefined = getBrowserStorage("local"),
): string {
  if (!storage) return getRandomClientId();

  try {
    const saved = storage.getItem(CLIENT_DEVICE_ID_STORAGE_KEY);
    if (saved) return saved;

    // clientId 是体验标识，不是认证凭据；首次生成后持久化，便于设置页稳定显示同一设备。
    const generated = getRandomClientId();
    storage.setItem(CLIENT_DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // 隐私模式或 WebView 存储受限时仍然允许页面运行，只是设备 ID 无法持久化。
    return getRandomClientId();
  }
}

export function buildClientDeviceName(
  runtime: ClientRuntime,
  platformText = typeof navigator === "undefined" ? "" : navigator.platform,
): string {
  const osLabel = runtime.os ?? "browser";
  const modeLabel = runtime.type === "pwa" ? "PWA" : runtime.type;
  const deviceLabel = platformText.trim() || osLabel;

  // 设备名保持可读即可，用户后续如果需要可再扩展为可编辑字段。
  return `${deviceLabel} · ${modeLabel}`;
}

export function buildClientRegisterInput(
  clientId: string,
  runtime: ClientRuntime = detectClientRuntime(),
): ClientDeviceRegisterInput {
  return {
    clientId,
    name: buildClientDeviceName(runtime),
    type: runtime.type,
    platform: runtime.platform,
    os: runtime.os,
    appVersion: runtime.appVersion,
    capabilities: runtime.capabilities,
  };
}
