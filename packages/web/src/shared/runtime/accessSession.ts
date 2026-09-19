import { appAccessSessionSchema, type AppAccessSession } from "@telegram-star/shared/contracts/config";
import { getBrowserStorage } from "@telegram-star/shared/browser-storage";
import { getRuntimeServerUrl, normalizeServerUrl } from "./serverConfig";

export const ACCESS_REQUIRED_EVENT = "telegram-star:access-required";
export const ACCESS_ASSETS_EVENT = "telegram-star:access-assets";
const memory = new Map<string, AppAccessSession>();
const keyFor = (server: string) => `telegram-star:access:v1:${normalizeServerUrl(server) || "same-origin"}`;

export function getAccessSession(server = getRuntimeServerUrl()): AppAccessSession | null {
  const key = keyFor(server);
  let value = memory.get(key);
  if (!value) {
    try {
      const raw = getBrowserStorage("session")?.getItem(key);
      const parsed = appAccessSessionSchema.safeParse(raw ? JSON.parse(raw) : null);
      if (parsed.success) value = parsed.data;
    } catch { /* Storage can be unavailable in native/private browsing contexts. */ }
  }
  return value && value.expiresAt > Date.now() ? value : null;
}

export function saveAccessSession(session: AppAccessSession, server = getRuntimeServerUrl()): void {
  const key = keyFor(server);
  memory.set(key, session);
  try { getBrowserStorage("session")?.setItem(key, JSON.stringify(session)); } catch { /* memory fallback */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACCESS_ASSETS_EVENT));
}

export function clearAccessSession(server = getRuntimeServerUrl()): void {
  const key = keyFor(server);
  memory.delete(key);
  try { getBrowserStorage("session")?.removeItem(key); } catch { /* memory fallback */ }
}

export function withAssetAccess(url: string, server = getRuntimeServerUrl()): string {
  const session = getAccessSession(server);
  if (!session || session.assetExpiresAt <= Date.now()) return url;
  return `${url}${url.includes("?") ? "&" : "?"}asset_token=${encodeURIComponent(session.assetToken)}`;
}
