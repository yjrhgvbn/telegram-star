import type { TelegramClient } from "telegram";
import { MediaLruCache, type MediaCacheValue } from "../mediaCachePolicy.js";
import { AsyncSlotLimiter, PendingRequestRegistry, withTimeout } from "../mediaRuntimePolicy.js";
import { getClient, isClientConnected } from "./client.js";
import { createDialogEntityMapProvider } from "./dialogEntityCache.js";

export const AVATAR_CACHE_LIMITS = {
  maxEntries: 256,
  maxSizeBytes: 8 * 1024 * 1024,
  maxSingleEntryBytes: 1024 * 1024,
  ttlMs: 10 * 60 * 1000,
  failureTtlMs: 30 * 1000,
  maxConcurrency: 2,
  maxPendingRequests: 16,
  requestTimeoutMs: 5 * 1000,
} as const;

type AvatarClient = Pick<TelegramClient, "getDialogs" | "downloadProfilePhoto">;

interface AvatarProviderDependencies {
  getClient?: () => AvatarClient | null;
  isClientConnected?: () => boolean;
  now?: () => number;
}

interface AvatarSession {
  client: AvatarClient;
  generation: number;
  entities: ReturnType<typeof createDialogEntityMapProvider>;
  pendingEntities: Promise<Map<string, any>> | null;
}

interface CachedResult {
  expiresAt: number;
  unavailable: boolean;
}

/** Only raster image signatures are accepted; Telegram errors must never become image bodies. */
function avatarMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function createSourceAvatarProvider(dependencies: AvatarProviderDependencies = {}) {
  const getTelegramClient = dependencies.getClient ?? getClient;
  const isConnected = dependencies.isClientConnected ?? isClientConnected;
  const now = dependencies.now ?? Date.now;
  const cache = new MediaLruCache({ ...AVATAR_CACHE_LIMITS, now });
  const results = new Map<string, CachedResult>();
  const pending = new PendingRequestRegistry<MediaCacheValue | null>(
    AVATAR_CACHE_LIMITS.maxPendingRequests,
  );
  const slots = new AsyncSlotLimiter(AVATAR_CACHE_LIMITS.maxConcurrency);
  let session: AvatarSession | null = null;
  let generation = 0;

  function isCurrent(requestSession: AvatarSession): boolean {
    return session === requestSession && getTelegramClient() === requestSession.client && isConnected();
  }

  function getSession(client: AvatarClient): AvatarSession {
    if (session?.client === client) return session;
    cache.clear();
    results.clear();
    session = {
      client,
      generation: ++generation,
      // The general dialog cache can outlive a login. Bind this cache to the captured client,
      // so an old account's access hashes can never be used for the next account's avatars.
      entities: createDialogEntityMapProvider({
        getClient: () => client,
        isClientConnected: () => getTelegramClient() === client && isConnected(),
        now,
      }),
      pendingEntities: null,
    };
    return session;
  }

  function remember(key: string, value: MediaCacheValue | null): void {
    if (value) cache.set(key, value);
    results.delete(key);
    results.set(key, {
      expiresAt: now() + (value ? AVATAR_CACHE_LIMITS.ttlMs : AVATAR_CACHE_LIMITS.failureTtlMs),
      unavailable: value === null,
    });
    while (results.size > AVATAR_CACHE_LIMITS.maxEntries) {
      const oldestKey = results.keys().next().value;
      if (oldestKey === undefined) break;
      results.delete(oldestKey);
    }
  }

  function cachedResult(key: string): MediaCacheValue | null | undefined {
    const result = results.get(key);
    if (!result) return undefined;
    // MediaLruCache expires after inactivity. This additional bounded metadata gives avatars
    // an absolute refresh deadline even when a popular source is continuously displayed.
    if (now() >= result.expiresAt) {
      results.delete(key);
      return undefined;
    }
    const value = result.unavailable ? null : cache.get(key);
    results.delete(key);
    if (value !== undefined) results.set(key, result);
    return value;
  }

  async function getEntities(requestSession: AvatarSession): Promise<Map<string, any>> {
    if (!requestSession.pendingEntities) {
      requestSession.pendingEntities = requestSession.entities.getDialogEntityMap().finally(() => {
        requestSession.pendingEntities = null;
      });
    }
    return requestSession.pendingEntities;
  }

  async function download(requestSession: AvatarSession, key: string, chatId: string) {
    if (!isCurrent(requestSession)) return null;
    try {
      const entities = await getEntities(requestSession);
      if (!isCurrent(requestSession)) return null;
      const entity = entities.get(chatId);
      if (!entity) {
        remember(key, null);
        return null;
      }

      const buffer = await requestSession.client.downloadProfilePhoto(entity, { isBig: false });
      if (!isCurrent(requestSession)) return null;
      const mimeType = Buffer.isBuffer(buffer) && buffer.length > 0 &&
        buffer.length <= AVATAR_CACHE_LIMITS.maxSingleEntryBytes ? avatarMimeType(buffer) : null;
      const value = Buffer.isBuffer(buffer) && mimeType ? { buffer, mimeType } : null;
      remember(key, value);
      return value;
    } catch {
      if (isCurrent(requestSession)) remember(key, null);
      return null;
    }
  }

  return {
    async getSourceAvatar(chatId: string): Promise<MediaCacheValue | null> {
      const client = getTelegramClient();
      if (!client || !isConnected()) {
        session = null;
        cache.clear();
        results.clear();
        return null;
      }
      const requestSession = getSession(client);
      const key = `${requestSession.generation}:${chatId}`;
      const cached = cachedResult(key);
      if (cached !== undefined) return cached;

      try {
        // Keep timed-out and old-account tasks tracked until GramJS actually settles. Clearing
        // pending/slots on login would permit an unbounded number of uncancelled downloads.
        const value = await withTimeout(
          pending.getOrCreate(key, () => slots.run(() => download(requestSession, key, chatId))),
          AVATAR_CACHE_LIMITS.requestTimeoutMs,
        );
        return isCurrent(requestSession) ? value : null;
      } catch {
        if (isCurrent(requestSession)) remember(key, null);
        return null;
      }
    },
  };
}

export const getSourceAvatar = createSourceAvatarProvider().getSourceAvatar;
