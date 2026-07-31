interface AsyncTtlCacheEntry<T> {
  promise: Promise<T>;
  expiresAt: number | null;
}

interface AsyncTtlCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

export interface AsyncTtlCache<T> {
  get: (key: string, loader: () => Promise<T>) => Promise<T>;
  clear: () => void;
  size: () => number;
}

/**
 * 有界异步 TTL 缓存。进行中的 Promise 也会被复用，从而避免多个自动预览
 * 同时向 Telegram 拉取同一会话；失败结果不会留在缓存中。
 */
export function createAsyncTtlCache<T>(options: AsyncTtlCacheOptions): AsyncTtlCache<T> {
  const ttlMs = Math.max(0, options.ttlMs);
  const maxEntries = Math.max(1, Math.floor(options.maxEntries));
  const now = options.now ?? Date.now;
  const entries = new Map<string, AsyncTtlCacheEntry<T>>();

  const touch = (key: string, entry: AsyncTtlCacheEntry<T>) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const trim = () => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  };

  return {
    get(key, loader) {
      const existing = entries.get(key);
      if (
        existing &&
        (existing.expiresAt === null || existing.expiresAt > now())
      ) {
        touch(key, existing);
        return existing.promise;
      }

      if (existing) entries.delete(key);

      const entry: AsyncTtlCacheEntry<T> = {
        promise: Promise.resolve().then(loader),
        expiresAt: null,
      };
      entries.set(key, entry);
      trim();

      void entry.promise.then(
        () => {
          if (entries.get(key) === entry) {
            entry.expiresAt = now() + ttlMs;
          }
        },
        () => {
          if (entries.get(key) === entry) entries.delete(key);
        },
      );

      return entry.promise;
    },

    clear() {
      entries.clear();
    },

    size() {
      return entries.size;
    },
  };
}
