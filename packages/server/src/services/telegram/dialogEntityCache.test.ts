import { describe, expect, it, vi } from "vitest";
import { createDialogEntityMapProvider } from "./dialogEntityCache.js";

describe("dialogEntityCache", () => {
  it("reuses the cached dialog map while ttl is valid", async () => {
    let now = 1_000;
    let fetchCount = 0;
    const client = {
      async getDialogs() {
        fetchCount += 1;
        return [{ id: `dialog-${fetchCount}` }];
      },
    };
    const provider = createDialogEntityMapProvider({
      now: () => now,
      ttlMs: 100,
      getClient: () => client,
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
    const client = {
      async getDialogs() {
        fetchCount += 1;
        return [{ id: `dialog-${fetchCount}` }];
      },
    };
    const provider = createDialogEntityMapProvider({
      now: () => now,
      ttlMs: 100,
      getClient: () => client,
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
    const client = { async getDialogs() { return [{ id: "cached-dialog" }]; } };
    const provider = createDialogEntityMapProvider({
      getClient: () => client,
      isClientConnected: () => connected,
      buildEntityMap: (dialogs) => new Map(dialogs.map((dialog) => [dialog.id, dialog])),
    });

    const cached = await provider.getDialogEntityMap();
    connected = false;
    const fallback = await provider.getDialogEntityMap();

    expect(fallback).toBe(cached);
    expect(fallback.has("cached-dialog")).toBe(true);
  });

  it("discards old-account entities on logout and refreshes for a new account before TTL", async () => {
    const a = { getDialogs: vi.fn().mockResolvedValue([{ id: "same-peer", accessHash: "account-a" }]) };
    const b = { getDialogs: vi.fn().mockResolvedValue([{ id: "same-peer", accessHash: "account-b" }]) };
    let client: typeof a | null = a;
    const provider = createDialogEntityMapProvider({
      getClient: () => client,
      isClientConnected: () => client !== null,
      buildEntityMap: (dialogs) => new Map(dialogs.map(dialog => [dialog.id, dialog])),
    });
    expect((await provider.getDialogEntityMap()).get("same-peer").accessHash).toBe("account-a");
    client = null;
    expect((await provider.getDialogEntityMap()).size).toBe(0);
    client = b;
    expect((await provider.getDialogEntityMap()).get("same-peer").accessHash).toBe("account-b");
    expect(b.getDialogs).toHaveBeenCalledOnce();
  });

  it("does not repopulate or return old entities when account changes during an in-flight fetch", async () => {
    let finish!: (dialogs: any[]) => void;
    const a = { getDialogs: vi.fn(() => new Promise<any[]>(resolve => { finish = resolve; })) };
    const b = { getDialogs: vi.fn().mockResolvedValue([{ id: "peer", accessHash: "b" }]) };
    let client: { getDialogs: () => Promise<any[]> } = a;
    const provider = createDialogEntityMapProvider({
      getClient: () => client,
      isClientConnected: () => true,
      buildEntityMap: (dialogs) => new Map(dialogs.map(dialog => [dialog.id, dialog])),
    });
    const oldRequest = provider.getDialogEntityMap();
    client = b;
    const newMap = await provider.getDialogEntityMap();
    finish([{ id: "peer", accessHash: "a" }]);
    expect((await oldRequest).size).toBe(0);
    expect((await provider.getDialogEntityMap()).get("peer").accessHash).toBe("b");
    expect(await provider.getDialogEntityMap()).toBe(newMap);
    expect(b.getDialogs).toHaveBeenCalledOnce();
  });

  it("does not let an explicitly cleared fetch overwrite the next fetch for the same client", async () => {
    let finish!: (dialogs: any[]) => void;
    const client = { getDialogs: vi.fn()
      .mockImplementationOnce(() => new Promise<any[]>(resolve => { finish = resolve; }))
      .mockResolvedValue([{ id: "new" }]) };
    const provider = createDialogEntityMapProvider({
      getClient: () => client,
      isClientConnected: () => true,
      buildEntityMap: (dialogs) => new Map(dialogs.map(dialog => [dialog.id, dialog])),
    });
    const oldRequest = provider.getDialogEntityMap();
    provider.clear();
    expect((await provider.getDialogEntityMap()).has("new")).toBe(true);
    finish([{ id: "old" }]);
    expect((await oldRequest).size).toBe(0);
    expect((await provider.getDialogEntityMap()).has("new")).toBe(true);
  });
});
