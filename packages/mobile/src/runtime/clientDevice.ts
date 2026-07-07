import {
  clientDeviceHeartbeatResponseSchema,
  clientDeviceSchema,
  type ClientCapabilities,
  type ClientDevice,
  type ClientOs,
} from "@telegram-star/shared/contracts/clients";
import {
  MOBILE_CLIENT_ID_STORAGE_KEY,
  normalizeServerUrl,
  type MobileShellStorage,
} from "./serverConfig";

export const MOBILE_HEARTBEAT_INTERVAL_MS = 60_000;

function getBrowserStorage(): MobileShellStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function getRandomClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getMobileOs(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): ClientOs | undefined {
  const text = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(text)) return "ios";
  if (text.includes("android")) return "android";
  return undefined;
}

export function getMobileClientId(
  storage: MobileShellStorage | undefined = getBrowserStorage(),
): string {
  if (!storage) return getRandomClientId();

  try {
    const saved = storage.getItem(MOBILE_CLIENT_ID_STORAGE_KEY);
    if (saved) return saved;

    // 移动端 clientId 只用于设备列表和排障，不是认证凭据。
    const generated = getRandomClientId();
    storage.setItem(MOBILE_CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return getRandomClientId();
  }
}

export function buildMobileCapabilities(): ClientCapabilities {
  return {
    nativeNotification: true,
    secureStorage: true,
    openExternal: true,
    scanQrCode: true,
    backgroundRefresh: true,
    tray: false,
    appUpdater: false,
  };
}

function getClientDeviceName(os: ClientOs | undefined): string {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  const label = platform.trim() || os || "mobile";
  return `${label} · mobile`;
}

function getMobileAppVersion(): string {
  return typeof __MOBILE_APP_VERSION__ === "undefined" ? "0.1.0" : __MOBILE_APP_VERSION__;
}

function getClientEndpoint(serverUrl: string, path: string): string {
  return `${normalizeServerUrl(serverUrl)}/api${path}`;
}

export async function registerMobileClient(
  serverUrl: string,
  clientId = getMobileClientId(),
): Promise<ClientDevice> {
  const os = getMobileOs();
  const response = await fetch(getClientEndpoint(serverUrl, "/clients/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      clientId,
      name: getClientDeviceName(os),
      type: "mobile",
      platform: "tauri",
      os,
      appVersion: getMobileAppVersion(),
      capabilities: buildMobileCapabilities(),
      // 第一版仅预留 pushToken 字段，实际 APNs/FCM 接入放到后续推送阶段。
      pushToken: undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`设备注册失败：HTTP ${response.status}`);
  }

  return clientDeviceSchema.parse(await response.json());
}

export async function heartbeatMobileClient(
  serverUrl: string,
  clientId = getMobileClientId(),
): Promise<void> {
  const response = await fetch(
    getClientEndpoint(serverUrl, `/clients/${encodeURIComponent(clientId)}/heartbeat`),
    {
      method: "PATCH",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw new Error(`设备心跳失败：HTTP ${response.status}`);
  }

  clientDeviceHeartbeatResponseSchema.parse(await response.json());
}
