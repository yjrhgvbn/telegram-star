import { describe, expect, it, vi } from "vitest";
import { createAsyncTtlCache } from "./asyncTtlCache.js";

describe("asyncTtlCache", () => {
  it("reuses in-flight and completed values until ttl expires", async () => {
    let now = 1_000;
    let release: ((value: string) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const cache = createAsyncTtlCache<string>({
      ttlMs: 100,
      maxEntries: 2,
      now: () => now,
    });

    const first = cache.get("chat", loader);
    const second = cache.get("chat", loader);
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(1);
    release?.("snapshot");
    await expect(first).resolves.toBe("snapshot");
    await expect(second).resolves.toBe("snapshot");

    now = 1_050;
    await expect(cache.get("chat", loader)).resolves.toBe("snapshot");
    expect(loader).toHaveBeenCalledTimes(1);

    now = 1_101;
    const refreshed = cache.get("chat", async () => "fresh");
    await expect(refreshed).resolves.toBe("fresh");
  });

  it("evicts the least recently used entry and drops rejected values", async () => {
    const cache = createAsyncTtlCache<string>({ ttlMs: 100, maxEntries: 2 });

    await cache.get("a", async () => "a");
    await cache.get("b", async () => "b");
    await cache.get("a", async () => "unused");
    await cache.get("c", async () => "c");

    expect(cache.size()).toBe(2);
    await cache.get("b", async () => "b-refetched");
    expect(cache.size()).toBe(2);

    await expect(cache.get("broken", async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(cache.size()).toBe(1);
  });
});
