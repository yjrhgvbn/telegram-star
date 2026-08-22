import { getBrowserStorage } from "@telegram-star/shared/browser-storage";

export const MOBILE_SERVER_CONFIG_STORAGE_KEY = "telegram-star:mobile-server-url:v1";
export const MOBILE_LAST_CONNECTED_AT_STORAGE_KEY = "telegram-star:mobile-last-connected-at:v1";
export const MOBILE_CLIENT_ID_STORAGE_KEY = "telegram-star:mobile-client-id:v1";

export type MobileShellStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function normalizeServerUrl(value: string | null | undefined): string {
  let normalized = (value ?? "").trim();
  if (!normalized) return "";

  normalized = normalized.replace(/\/+$/, "");
  if (normalized.endsWith("/api")) {
    normalized = normalized.slice(0, -4).replace(/\/+$/, "");
  }

  return normalized;
}

export function isSupportedServerUrl(serverUrl: string): boolean {
  if (!serverUrl) return false;

  try {
    const url = new URL(serverUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getDefaultServerUrl(): string {
  return normalizeServerUrl(import.meta.env.VITE_DEFAULT_SERVER_URL);
}

export function readSavedServerUrl(
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): string | null {
  if (!storage) return null;

  try {
    const saved = storage.getItem(MOBILE_SERVER_CONFIG_STORAGE_KEY);
    return saved === null ? null : normalizeServerUrl(saved);
  } catch {
    // 移动端 WebView 可能因为系统策略或隐私模式读写失败；失败时回到连接页。
    return null;
  }
}

export function saveServerUrl(
  serverUrl: string,
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): void {
  if (!storage) return;

  try {
    storage.setItem(MOBILE_SERVER_CONFIG_STORAGE_KEY, normalizeServerUrl(serverUrl));
  } catch {
    // serverUrl 已进入当前 React 状态，持久化失败不阻断本次连接。
  }
}

export function readLastConnectedAt(
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(MOBILE_LAST_CONNECTED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastConnectedAt(
  value: string,
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): void {
  if (!storage) return;

  try {
    storage.setItem(MOBILE_LAST_CONNECTED_AT_STORAGE_KEY, value);
  } catch {
    // 最近连接时间只是提示信息，写入失败不影响业务页加载。
  }
}

export function clearMobileShellStorage(
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): void {
  if (!storage) return;

  try {
    storage.removeItem(MOBILE_SERVER_CONFIG_STORAGE_KEY);
    storage.removeItem(MOBILE_LAST_CONNECTED_AT_STORAGE_KEY);
  } catch {
    // 清理失败时保持当前 UI 状态，避免用户无法继续操作。
  }
}

export function getInitialServerUrl(
  storage: MobileShellStorage | undefined = getBrowserStorage("local"),
): string {
  return readSavedServerUrl(storage) ?? getDefaultServerUrl();
}
