export const DESKTOP_SERVER_CONFIG_STORAGE_KEY = "telegram-star:desktop-server-url:v1";
export const DESKTOP_LAST_CONNECTED_AT_STORAGE_KEY = "telegram-star:desktop-last-connected-at:v1";

export type DesktopShellStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): DesktopShellStorage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

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
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): string | null {
  if (!storage) return null;

  try {
    const saved = storage.getItem(DESKTOP_SERVER_CONFIG_STORAGE_KEY);
    return saved === null ? null : normalizeServerUrl(saved);
  } catch {
    // 桌面 WebView 的本地存储可能被系统策略限制，读取失败时回退到默认地址或连接页。
    return null;
  }
}

export function saveServerUrl(
  serverUrl: string,
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    // 只保存服务器根地址，不保存 /api，避免后续拼接 health 和业务地址时出现 /api/api。
    storage.setItem(DESKTOP_SERVER_CONFIG_STORAGE_KEY, normalizeServerUrl(serverUrl));
  } catch {
    // 保存失败不阻塞本次连接，用户仍可在当前会话内进入远程业务页。
  }
}

export function clearSavedServerUrl(
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.removeItem(DESKTOP_SERVER_CONFIG_STORAGE_KEY);
  } catch {
    // 清理失败时保持当前页面状态，避免重置操作导致本地壳白屏。
  }
}

export function readLastConnectedAt(
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(DESKTOP_LAST_CONNECTED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastConnectedAt(
  value: string,
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(DESKTOP_LAST_CONNECTED_AT_STORAGE_KEY, value);
  } catch {
    // 最近成功连接时间只是提示信息，写入失败不影响连接流程。
  }
}

export function clearDesktopShellStorage(
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): void {
  clearSavedServerUrl(storage);

  try {
    storage?.removeItem(DESKTOP_LAST_CONNECTED_AT_STORAGE_KEY);
  } catch {
    // 本地壳清理入口尽量宽容，避免因为存储异常让用户无法返回连接页。
  }
}

export function getInitialServerUrl(
  storage: DesktopShellStorage | undefined = getBrowserStorage(),
): string {
  return readSavedServerUrl(storage) ?? getDefaultServerUrl();
}
