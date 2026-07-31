export interface MediaCacheValue {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Telegram previews should always be small. Keeping this limit below GramJS' full-document
 * download range prevents a malformed or missing thumbnail from consuming the host memory.
 */
export const MAX_DOWNLOADABLE_THUMBNAIL_BYTES = 2 * 1024 * 1024;

interface ThumbnailCandidate {
  value: unknown;
  sizeBytes: number;
}

interface MediaCacheEntry extends MediaCacheValue {
  accessedAt: number;
}

export interface MediaLruCacheOptions {
  maxSizeBytes: number;
  ttlMs: number;
  maxEntries: number;
  maxSingleEntryBytes?: number;
  now?: () => number;
}

export function buildThumbCacheKey(
  chatId: string,
  messageId: number,
  thumbIndex: number,
): string {
  return `${chatId}:${messageId}:thumb:${thumbIndex}`;
}

/**
 * Returns real GramJS thumbnail objects in preferred-to-lowest-quality order.
 *
 * Passing a numeric thumbnail index to GramJS is unsafe for documents: when the index does
 * not exist, GramJS falls back to the original document and downloads it into memory. We
 * therefore resolve and size-check the thumbnail ourselves, then pass the concrete object.
 */
export function selectDownloadableThumbnails(
  media: any,
  preferredIndex: number,
  maxSizeBytes = MAX_DOWNLOADABLE_THUMBNAIL_BYTES,
): unknown[] {
  const sizes = getThumbnailSizes(media);
  if (!sizes) return [];

  const candidates = sizes
    .map(toThumbnailCandidate)
    .filter((candidate): candidate is ThumbnailCandidate => {
      return candidate !== null && candidate.sizeBytes <= maxSizeBytes;
    })
    .sort((left, right) => left.sizeBytes - right.sizeBytes);

  if (candidates.length === 0) return [];

  const safePreferredIndex = Number.isInteger(preferredIndex)
    ? Math.min(Math.max(preferredIndex, 0), candidates.length - 1)
    : 0;

  return candidates
    .slice(0, safePreferredIndex + 1)
    .reverse()
    .map((candidate) => candidate.value);
}

function getThumbnailSizes(media: any): unknown[] | null {
  if (media?.className === "MessageMediaPhoto") {
    return Array.isArray(media.photo?.sizes) ? media.photo.sizes : null;
  }

  if (media?.className === "MessageMediaDocument") {
    return Array.isArray(media.document?.thumbs) ? media.document.thumbs : null;
  }

  return null;
}

function toThumbnailCandidate(value: any): ThumbnailCandidate | null {
  switch (value?.className) {
    case "PhotoStrippedSize":
    case "PhotoCachedSize": {
      const sizeBytes = getByteLength(value.bytes);
      return sizeBytes > 0 ? { value, sizeBytes } : null;
    }

    case "PhotoSize": {
      const sizeBytes = Number(value.size);
      return Number.isFinite(sizeBytes) && sizeBytes > 0 ? { value, sizeBytes } : null;
    }

    default:
      // PhotoSizeEmpty/PhotoPathSize have no payload. PhotoSizeProgressive is deliberately
      // excluded because GramJS does not accept that concrete object in downloadMedia().
      return null;
  }
}

function getByteLength(value: unknown): number {
  if (Buffer.isBuffer(value)) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  return 0;
}

/**
 * 内存缩略图缓存策略。
 *
 * Telegram 缩略图只用于页面预览，缓存不写磁盘；过期和容量淘汰都在访问/写入时完成。
 * Map 的插入顺序即 LRU 顺序，命中时会重新插入到末尾。
 */
export class MediaLruCache {
  private readonly entries = new Map<string, MediaCacheEntry>();
  private readonly maxSingleEntryBytes: number;
  private currentSizeBytes = 0;

  constructor(private readonly options: MediaLruCacheOptions) {
    this.maxSingleEntryBytes = options.maxSingleEntryBytes ?? options.maxSizeBytes / 4;
  }

  get(key: string): MediaCacheValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    const now = this.now();
    if (now - entry.accessedAt > this.options.ttlMs) {
      this.delete(key, entry);
      return undefined;
    }

    const freshEntry = { ...entry, accessedAt: now };
    this.entries.delete(key);
    this.entries.set(key, freshEntry);
    return { buffer: freshEntry.buffer, mimeType: freshEntry.mimeType };
  }

  set(key: string, value: MediaCacheValue): void {
    if (value.buffer.byteLength > this.maxSingleEntryBytes) return;

    const existing = this.entries.get(key);
    if (existing) {
      this.delete(key, existing);
    }

    this.pruneExpired();
    this.pruneForCapacity(value.buffer.byteLength);

    const entry = { ...value, accessedAt: this.now() };
    this.entries.set(key, entry);
    this.currentSizeBytes += value.buffer.byteLength;
  }

  clear(): void {
    this.entries.clear();
    this.currentSizeBytes = 0;
  }

  stats(): {
    entries: number;
    sizeBytes: number;
    maxSizeBytes: number;
  } {
    return {
      entries: this.entries.size,
      sizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.options.maxSizeBytes,
    };
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.accessedAt > this.options.ttlMs) {
        this.delete(key, entry);
      }
    }
  }

  private pruneForCapacity(incomingBytes: number): void {
    while (
      (this.currentSizeBytes + incomingBytes > this.options.maxSizeBytes ||
        this.entries.size >= this.options.maxEntries) &&
      this.entries.size > 0
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      const oldestEntry = this.entries.get(oldestKey);
      if (!oldestEntry) break;
      this.delete(oldestKey, oldestEntry);
    }
  }

  private delete(key: string, entry: MediaCacheEntry): void {
    this.currentSizeBytes -= entry.buffer.byteLength;
    this.entries.delete(key);
  }
}

export function guessThumbnailMimeType(media: any): string {
  const className = media?.className;
  if (className === "MessageMediaPhoto") return "image/jpeg";

  const doc = media?.document;
  if (doc?.mimeType) {
    // GramJS 对视频缩略图下载返回 JPEG，即使原始 document 是 video/*
    if (doc.mimeType.startsWith("video/")) return "image/jpeg";
    if (doc.mimeType === "application/x-tgsticker") return "image/webp";
    if (doc.mimeType.startsWith("image/")) return doc.mimeType;
  }
  return "image/jpeg";
}
