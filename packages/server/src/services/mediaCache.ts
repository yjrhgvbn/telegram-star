/**
 * 媒体缩略图内存缓存。
 * 缓存策略、请求去重和并发限制均拆到独立 policy，避免 Telegram 下载流程混入底层控制流。
 * 所有数据纯内存存储，不写入磁盘。
 */
import { getClient, isClientConnected } from "./telegram/client.js";
import { getDialogEntityMap } from "./telegram/dialogEntityCache.js";
import { appConfig } from "../config.js";
import { appLogger } from "../shared/logging.js";
import {
  MAX_DOWNLOADABLE_THUMBNAIL_BYTES,
  MediaLruCache,
  buildThumbCacheKey,
  guessThumbnailMimeType,
  selectDownloadableThumbnails,
} from "./mediaCachePolicy.js";
import { AsyncSlotLimiter, PendingRequestRegistry, withTimeout } from "./mediaRuntimePolicy.js";

const MAX_CACHE_SIZE = 80 * 1024 * 1024; // 80MB
const MAX_TTL_MS = 30 * 60 * 1000; // 30 分钟
const MAX_ENTRIES = 2000;
const DOWNLOAD_THUMB_TIMEOUT_MS = 5000;
const MAX_PENDING_DOWNLOADS = 8;

const cache = new MediaLruCache({
  maxSizeBytes: MAX_CACHE_SIZE,
  ttlMs: MAX_TTL_MS,
  maxEntries: MAX_ENTRIES,
});

const MAX_CONCURRENCY = 2;
const pendingRequests = new PendingRequestRegistry<{ buffer: Buffer; mimeType: string } | null>(
  MAX_PENDING_DOWNLOADS,
);
const downloadLimiter = new AsyncSlotLimiter(MAX_CONCURRENCY);

// --- 公开 API ---

/**
 * 获取指定消息的缩略图 Buffer。
 * 优先从 LRU 缓存返回，缓存未命中时通过 GramJS 实时下载已配置质量的缩略图。
 * 所有数据纯内存操作，不写入磁盘。
 */
export async function getThumbBuffer(
  chatId: string,
  messageId: number,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const thumbIndex = appConfig.media.thumbIndex;
  const key = buildThumbCacheKey(chatId, messageId, thumbIndex);

  // 1. 缓存命中
  const cached = cache.get(key);
  if (cached) return { buffer: cached.buffer, mimeType: cached.mimeType };

  // 2. 请求去重并发起下载。超时只结束当前 HTTP 等待；底层任务仍保留在 registry
  // 中并占用并发槽，直到真正结束，避免超时后重复启动不可取消的 GramJS 下载。
  const download = pendingRequests.getOrCreate(key, () =>
    downloadThumb(chatId, messageId, thumbIndex, key),
  );

  try {
    return await withTimeout(download, DOWNLOAD_THUMB_TIMEOUT_MS);
  } catch (err: any) {
    const reason = err?.message || String(err);
    if (reason !== "download_thumb_timeout") {
      appLogger.warn(
        { event: "media.thumbnail.request_rejected", chatId, messageId, reason },
        "Thumbnail request rejected",
      );
    }
    return null;
  }
}

async function downloadThumb(
  chatId: string,
  messageId: number,
  thumbIndex: number,
  key: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const client = getClient();
  if (!client || !isClientConnected()) return null;

  return downloadLimiter.run(async () => {
    try {
      const entityMap = await getDialogEntityMap();
      const entity = entityMap.get(chatId);
      if (!entity) return null;

      const msgs = await client.getMessages(entity, { ids: [messageId] });
      const msg = msgs?.[0];
      if (!msg || !msg.media) return null;

      const buffer = await downloadWithFallbackThumb(client, msg, thumbIndex);
      if (!buffer || typeof buffer === "string") return null;

      const mimeType = guessThumbnailMimeType(msg.media);
      cache.set(key, { buffer, mimeType });
      return { buffer, mimeType };
    } catch (err: any) {
      // FLOOD_WAIT 等 Telegram 错误不应导致服务崩溃。
      appLogger.warn(
        {
          event: "media.thumbnail.download_failed",
          chatId,
          messageId,
          reason: err?.message || String(err),
        },
        "Failed to download thumbnail",
      );
      return null;
    }
  });
}

async function downloadWithFallbackThumb(
  client: any,
  msg: any,
  thumbIndex: number,
): Promise<Buffer | string | undefined> {
  const thumbnails = selectDownloadableThumbnails(msg.media, thumbIndex);

  // An empty list is expected for documents without thumbnails. Never pass an invalid numeric
  // index to GramJS: for documents it silently falls back to downloading the original file.
  for (const thumbnail of thumbnails) {
    try {
      const buffer = await client.downloadMedia(msg, { thumb: thumbnail });
      if (
        buffer &&
        typeof buffer !== "string" &&
        buffer.byteLength > MAX_DOWNLOADABLE_THUMBNAIL_BYTES
      ) {
        appLogger.warn(
          {
            event: "media.thumbnail.oversized",
            sizeBytes: buffer.byteLength,
            maxSizeBytes: MAX_DOWNLOADABLE_THUMBNAIL_BYTES,
          },
          "Rejected oversized thumbnail",
        );
        continue;
      }
      if (buffer) return buffer;
    } catch (err: any) {
      appLogger.warn(
        {
          event: "media.thumbnail.variant_unavailable",
          reason: err?.message || String(err),
        },
        "Thumbnail variant unavailable; trying lower quality",
      );
    }
  }
  return undefined;
}

export function clearMediaCache(): void {
  cache.clear();
  // Do not clear in-flight downloads: GramJS cannot cancel them. Keeping their keys registered
  // prevents a config change or retry from starting duplicate background transfers.
}

/** 获取缓存统计信息（用于调试） */
export function getCacheStats(): {
  entries: number;
  sizeBytes: number;
  maxSizeBytes: number;
  pendingDownloads: number;
  activeDownloads: number;
  queuedDownloads: number;
} {
  return {
    ...cache.stats(),
    pendingDownloads: pendingRequests.size,
    activeDownloads: downloadLimiter.active,
    queuedDownloads: downloadLimiter.queued,
  };
}
