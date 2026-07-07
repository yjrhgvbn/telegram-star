import {
  isSupportedServerUrl,
  normalizeServerUrl,
} from "./serverConfig";

export interface MobileQrConfig {
  serverUrl: string;
}

function parseJsonQrConfig(value: string): MobileQrConfig | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("serverUrl" in parsed)) return null;

    const serverUrl = normalizeServerUrl((parsed as { serverUrl?: unknown }).serverUrl as string);
    return isSupportedServerUrl(serverUrl) ? { serverUrl } : null;
  } catch {
    return null;
  }
}

function parseDeepLinkQrConfig(value: string): MobileQrConfig | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "telegram-star:" || url.hostname !== "configure") return null;

    const serverUrl = normalizeServerUrl(url.searchParams.get("serverUrl"));
    return isSupportedServerUrl(serverUrl) ? { serverUrl } : null;
  } catch {
    return null;
  }
}

export function parseMobileQrConfig(value: string): MobileQrConfig | null {
  const text = value.trim();
  if (!text) return null;

  const directUrl = normalizeServerUrl(text);
  if (isSupportedServerUrl(directUrl)) {
    return { serverUrl: directUrl };
  }

  return parseDeepLinkQrConfig(text) ?? parseJsonQrConfig(text);
}

export function buildMobileConfigPayload(serverUrl: string): string {
  const normalized = normalizeServerUrl(serverUrl);
  return JSON.stringify({ serverUrl: normalized });
}
