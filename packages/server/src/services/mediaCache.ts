/**
 * 媒体缩略图内存缓存。
 * 使用简单的 Map + 淘汰策略实现 LRU 缓存，避免引入额外依赖。
 * 所有数据纯内存存储，不写入磁盘。
 */
import { getClient, isClientConnected } from "./telegram/client.js";
import { buildDialogEntityMap } from "./telegram/utils.js";

// --- LRU Cache ---

interface CacheEntry {
  buffer: Buffer;
  mimeType: string;
  accessedAt: number;
}

const MAX_CACHE_SIZE = 80 * 1024 * 1024; // 80MB
const MAX_TTL_MS = 30 * 60 * 1000; // 30 分钟
const MAX_ENTRIES = 2000;

const cache = new Map<string, CacheEntry>();
let currentCacheSize = 0;

function cacheKey(chatId: string, messageId: number): string {
  return `${chatId}:${messageId}`;
}

/** 从缓存中获取条目，更新访问时间 */
function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;

  // TTL 检查
  if (Date.now() - entry.accessedAt > MAX_TTL_MS) {
    currentCacheSize -= entry.buffer.byteLength;
    cache.delete(key);
    return undefined;
  }

  entry.accessedAt = Date.now();
  return entry;
}

/** 写入缓存，必要时淘汰旧条目 */
function cachePut(key: string, buffer: Buffer, mimeType: string): void {
  // 单个文件太大则不缓存
  if (buffer.byteLength > MAX_CACHE_SIZE / 4) return;

  // 淘汰：先删除已过期条目
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.accessedAt > MAX_TTL_MS) {
      currentCacheSize -= v.buffer.byteLength;
      cache.delete(k);
    }
  }

  // 淘汰：删除最旧的条目直到有空间
  while (
    (currentCacheSize + buffer.byteLength > MAX_CACHE_SIZE ||
      cache.size >= MAX_ENTRIES) &&
    cache.size > 0
  ) {
    const oldestKey = cache.keys().next().value!;
    const oldestEntry = cache.get(oldestKey)!;
    currentCacheSize -= oldestEntry.buffer.byteLength;
    cache.delete(oldestKey);
  }

  cache.set(key, { buffer, mimeType, accessedAt: now });
  currentCacheSize += buffer.byteLength;
}

// --- 请求去重 ---

const pendingRequests = new Map<string, Promise<{ buffer: Buffer; mimeType: string } | null>>();

// --- 并发控制 ---

let activeConcurrency = 0;
const MAX_CONCURRENCY = 2;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeConcurrency < MAX_CONCURRENCY) {
    activeConcurrency++;
    return;
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeConcurrency++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeConcurrency--;
  const next = waitQueue.shift();
  if (next) next();
}

// --- Dialog entity 缓存 ---

let dialogEntityMap: Map<string, any> | null = null;
let dialogEntityMapUpdatedAt = 0;
const DIALOG_MAP_TTL_MS = 5 * 60 * 1000; // 5 分钟

async function getDialogEntityMap(): Promise<Map<string, any>> {
  const now = Date.now();
  if (dialogEntityMap && now - dialogEntityMapUpdatedAt < DIALOG_MAP_TTL_MS) {
    return dialogEntityMap;
  }

  const client = getClient();
  if (!client || !isClientConnected()) {
    return dialogEntityMap ?? new Map();
  }

  const dialogs = await client.getDialogs({ limit: 500 });
  dialogEntityMap = buildDialogEntityMap(dialogs as any[]);
  dialogEntityMapUpdatedAt = now;
  return dialogEntityMap;
}

// --- 公开 API ---

/**
 * 获取指定消息的缩略图 Buffer。
 * 优先从 LRU 缓存返回，缓存未命中时通过 GramJS 实时下载最小缩略图（thumb: 0）。
 * 所有数据纯内存操作，不写入磁盘。
 */
export async function getThumbBuffer(
  chatId: string,
  messageId: number,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const key = cacheKey(chatId, messageId);

  // 1. 缓存命中
  const cached = cacheGet(key);
  if (cached) return { buffer: cached.buffer, mimeType: cached.mimeType };

  // 2. 请求去重
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  // 3. 发起下载
  const promise = downloadThumb(chatId, messageId, key);
  pendingRequests.set(key, promise);
  const result = await promise;
  pendingRequests.delete(key);
  return result;
}

async function downloadThumb(
  chatId: string,
  messageId: number,
  key: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const client = getClient();
  if (!client || !isClientConnected()) return null;

  await acquireSlot();
  try {
    const entityMap = await getDialogEntityMap();
    const entity = entityMap.get(chatId);
    if (!entity) return null;

    const msgs = await client.getMessages(entity, { ids: [messageId] });
    const msg = msgs?.[0];
    if (!msg || !msg.media) return null;

    // 下载中等尺寸缩略图（thumb: 1），返回 Buffer，不写磁盘
    const buffer = await client.downloadMedia(msg, { thumb: 1 });
    if (!buffer || typeof buffer === "string") return null;

    const mimeType = guessMimeType(msg.media);
    cachePut(key, buffer, mimeType);
    return { buffer, mimeType };
  } catch (err: any) {
    // FLOOD_WAIT 等错误不应导致崩溃
    console.warn("[MediaCache] Failed to download thumb:", err?.message || err);
    return null;
  } finally {
    releaseSlot();
  }
}

function guessMimeType(media: any): string {
  const className = media?.className;
  if (className === "MessageMediaPhoto") return "image/jpeg";

  const doc = media?.document;
  if (doc?.mimeType) {
    // 缩略图总是 JPEG
    if (doc.mimeType.startsWith("video/")) return "image/jpeg";
    if (doc.mimeType === "application/x-tgsticker") return "image/webp";
    if (doc.mimeType.startsWith("image/")) return doc.mimeType;
  }
  return "image/jpeg";
}

/** 获取缓存统计信息（用于调试） */
export function getCacheStats(): {
  entries: number;
  sizeBytes: number;
  maxSizeBytes: number;
} {
  return {
    entries: cache.size,
    sizeBytes: currentCacheSize,
    maxSizeBytes: MAX_CACHE_SIZE,
  };
}
