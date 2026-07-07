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
    // 移动端重载只刷新远程业务入口，保存的后端根地址保持不变。
    url.searchParams.set("mobileReload", String(reloadKey));
  }

  return url.toString();
}
