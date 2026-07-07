import { getRuntimeServerUrl, normalizeServerUrl } from "@/shared/runtime/serverConfig";

function toApiPath(path: string): string {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getApiBaseUrl(serverUrl = getRuntimeServerUrl()): string {
  const rootUrl = normalizeServerUrl(serverUrl);
  // 同源模式使用相对 /api；远程模式使用服务端根地址拼出绝对 API 地址。
  return rootUrl ? `${rootUrl}/api` : "/api";
}

export function getApiUrl(path = "", serverUrl = getRuntimeServerUrl()): string {
  return `${getApiBaseUrl(serverUrl)}${toApiPath(path)}`;
}

export function getMessageEventsUrl(serverUrl = getRuntimeServerUrl()): string {
  return getApiUrl("/messages/events", serverUrl);
}

export function getMediaThumbUrl(
  chatId: number | string,
  telegramMessageId: number | string,
  serverUrl = getRuntimeServerUrl(),
): string {
  return getApiUrl(`/media/${chatId}/${telegramMessageId}/thumb`, serverUrl);
}
