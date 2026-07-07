export const SERVER_CONFIG_STORAGE_KEY = "telegram-star:server-url:v1";

export type ServerConfigStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): ServerConfigStorage | undefined {
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

export function getDefaultServerUrl(): string {
  return normalizeServerUrl(import.meta.env.VITE_DEFAULT_SERVER_URL);
}

export function readSavedServerUrl(
  storage: ServerConfigStorage | undefined = getBrowserStorage(),
): string | null {
  if (!storage) return null;

  try {
    const saved = storage.getItem(SERVER_CONFIG_STORAGE_KEY);
    return saved === null ? null : normalizeServerUrl(saved);
  } catch {
    // 隐私模式或桌面 WebView 权限受限时 localStorage 可能不可用，读取失败时回退到默认地址。
    return null;
  }
}

export function saveServerUrl(
  serverUrl: string,
  storage: ServerConfigStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    // 客户端只保存服务器根地址，不保存 /api；空字符串表示显式使用同源 Web 模式。
    storage.setItem(SERVER_CONFIG_STORAGE_KEY, normalizeServerUrl(serverUrl));
  } catch {
    // 配置保存失败不应阻断页面运行，后续 M3 UI 再提示用户具体错误。
  }
}

export function clearSavedServerUrl(
  storage: ServerConfigStorage | undefined = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.removeItem(SERVER_CONFIG_STORAGE_KEY);
  } catch {
    // 清理失败时保持当前运行态，避免因为配置存储异常影响主流程。
  }
}

export function getRuntimeServerUrl(
  storage: ServerConfigStorage | undefined = getBrowserStorage(),
): string {
  const saved = readSavedServerUrl(storage);
  return saved ?? getDefaultServerUrl();
}
