import { describe, expect, it } from "vitest";
import { createDialogEntityMapProvider } from "./dialogEntityCache.js";

describe("dialogEntityCache", () => {
  it("reuses the cached dialog map while ttl is valid", async () => {
    let now = 1_000;
    let fetchCount = 0;
    const provider = createDialogEntityMapProvider({
      now: () => now,
      ttlMs: 100,
      getClient: () => ({
        async getDialogs() {
          fetchCount += 1;
          return [{ id: `dialog-${fetchCount}` }];
        },
      }),
      isClientConnected: () => true,
      buildEntityMap: (dialogs) => new Map(dialogs.map((dialog) => [dialog.id, dialog])),
    });

    const first = await provider.getDialogEntityMap();
    now = 1_050;
    const second = await provider.getDialogEntityMap();

    expect(second).toBe(first);
    expect(fetchCount).toBe(1);
    expect(second.has("dialog-1")).toBe(true);
  });

  it("refreshes the dialog map after ttl expires", async () => {
    let now = 1_000;
    let fetchCount = 0;
    const provider = createDialogEntityMapProvider({
      now: () => now,
      ttlMs: 100,
      getClient: () => ({
        async getDialogs() {
          fetchCount += 1;
          return [{ id: `dialog-${fetchCount}` }];
        },
      }),
      isClientConnected: () => true,
      buildEntityMap: (dialogs) => new Map(dialogs.map((dialog) => [dialog.id, dialog])),
    });

    await provider.getDialogEntityMap();
    now = 1_101;
    const refreshed = await provider.getDialogEntityMap();

    expect(fetchCount).toBe(2);
    expect(refreshed.has("dialog-2")).toBe(true);
  });

  it("falls back to the cached map when the Telegram client is disconnected", async () => {
    let connected = true;
    const provider = createDialogEntityMapProvider({
      getClient: () => ({
        async getDialogs() {
          return [{ id: "cached-dialog" }];
        },
      }),
      isClientConnected: () => connected,
      buildEntityMap: (dialogs) => new Map(dialogs.map((dialog) => [dialog.id, dialog])),
    });

    const cached = await provider.getDialogEntityMap();
    connected = false;
    const fallback = await provider.getDialogEntityMap();

    expect(fallback).toBe(cached);
    expect(fallback.has("cached-dialog")).toBe(true);
  });
});
