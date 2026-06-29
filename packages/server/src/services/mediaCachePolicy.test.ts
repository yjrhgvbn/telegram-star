import { describe, expect, it } from "vitest";
import {
  MediaLruCache,
  buildThumbCacheKey,
  guessThumbnailMimeType,
} from "./mediaCachePolicy.js";

function makeBuffer(size: number): Buffer {
  return Buffer.alloc(size, 1);
}

describe("mediaCachePolicy", () => {
  it("builds stable thumbnail cache keys", () => {
    expect(buildThumbCacheKey("-100123", 42, 1)).toBe("-100123:42:thumb:1");
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
