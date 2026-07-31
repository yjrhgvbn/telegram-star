import { describe, expect, it } from "vitest";
import {
  MAX_DOWNLOADABLE_THUMBNAIL_BYTES,
  MediaLruCache,
  buildThumbCacheKey,
  guessThumbnailMimeType,
  selectDownloadableThumbnails,
} from "./mediaCachePolicy.js";

function makeBuffer(size: number): Buffer {
  return Buffer.alloc(size, 1);
}

describe("mediaCachePolicy", () => {
  it("builds stable thumbnail cache keys", () => {
    expect(buildThumbCacheKey("-100123", 42, 1)).toBe("-100123:42:thumb:1");
  });

  it("does not fall back to an original document when thumbnails are missing", () => {
    const media = {
      className: "MessageMediaDocument",
      document: {
        size: 800 * 1024 * 1024,
        thumbs: [],
      },
    };

    expect(selectDownloadableThumbnails(media, 1)).toEqual([]);
  });

  it("selects concrete thumbnails from preferred to lower quality", () => {
    const low = { className: "PhotoStrippedSize", bytes: Buffer.alloc(100) };
    const medium = { className: "PhotoSize", size: 20_000 };
    const high = { className: "PhotoSize", size: 80_000 };
    const media = {
      className: "MessageMediaDocument",
      document: { thumbs: [high, low, medium] },
    };

    expect(selectDownloadableThumbnails(media, 1)).toEqual([medium, low]);
    expect(selectDownloadableThumbnails(media, 2)).toEqual([high, medium, low]);
  });

  it("rejects unsupported and oversized thumbnail candidates", () => {
    const safe = { className: "PhotoSize", size: 64_000 };
    const oversized = {
      className: "PhotoSize",
      size: MAX_DOWNLOADABLE_THUMBNAIL_BYTES + 1,
    };
    const progressive = { className: "PhotoSizeProgressive", sizes: [64_000] };
    const media = {
      className: "MessageMediaPhoto",
      photo: { sizes: [safe, oversized, progressive] },
    };

    expect(selectDownloadableThumbnails(media, 2)).toEqual([safe]);
  });

  it("expires entries by ttl", () => {
    let now = 1_000;
    const cache = new MediaLruCache({
      maxSizeBytes: 100,
      ttlMs: 50,
      maxEntries: 10,
      now: () => now,
    });

    cache.set("a", { buffer: makeBuffer(10), mimeType: "image/jpeg" });
    now = 1_040;
    expect(cache.get("a")?.mimeType).toBe("image/jpeg");

    now = 1_091;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats().entries).toBe(0);
  });

  it("evicts least recently used entries when entry limit is reached", () => {
    let now = 1_000;
    const cache = new MediaLruCache({
      maxSizeBytes: 100,
      ttlMs: 1_000,
      maxEntries: 2,
      now: () => now,
    });

    cache.set("a", { buffer: makeBuffer(10), mimeType: "image/jpeg" });
    cache.set("b", { buffer: makeBuffer(10), mimeType: "image/png" });

    now = 1_010;
    expect(cache.get("a")?.mimeType).toBe("image/jpeg");
    cache.set("c", { buffer: makeBuffer(10), mimeType: "image/webp" });

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.mimeType).toBe("image/jpeg");
    expect(cache.get("c")?.mimeType).toBe("image/webp");
  });

  it("skips entries larger than the single-entry limit", () => {
    const cache = new MediaLruCache({
      maxSizeBytes: 100,
      ttlMs: 1_000,
      maxEntries: 10,
      maxSingleEntryBytes: 20,
    });

    cache.set("large", { buffer: makeBuffer(21), mimeType: "image/jpeg" });

    expect(cache.get("large")).toBeUndefined();
    expect(cache.stats().sizeBytes).toBe(0);
  });

  it("guesses thumbnail mime types from Telegram media", () => {
    expect(guessThumbnailMimeType({ className: "MessageMediaPhoto" })).toBe("image/jpeg");
    expect(guessThumbnailMimeType({ document: { mimeType: "video/mp4" } })).toBe("image/jpeg");
    expect(guessThumbnailMimeType({ document: { mimeType: "application/x-tgsticker" } })).toBe(
      "image/webp",
    );
    expect(guessThumbnailMimeType({ document: { mimeType: "image/png" } })).toBe("image/png");
    expect(guessThumbnailMimeType({ document: { mimeType: "application/pdf" } })).toBe(
      "image/jpeg",
    );
  });
});
