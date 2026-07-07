import {
  isSupportedServerUrl,
  normalizeServerUrl,
} from "./serverConfig";

export function buildRemoteAppUrl(serverUrl: string, reloadKey?: number): string {
  const normalized = normalizeServerUrl(serverUrl);
  if (!isSupportedServerUrl(normalized)) return "";

  const url = new URL(normalized);
  url.pathname = "/";

  if (reloadKey) {
    // iframe 重新加载时带一个轻量参数，只刷新业务入口，不改变用户保存的后端根地址。
    url.searchParams.set("desktopReload", String(reloadKey));
  }

  return url.toString();
}
