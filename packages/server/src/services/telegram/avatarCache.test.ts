import type { TelegramClient } from "telegram";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVATAR_CACHE_LIMITS, createSourceAvatarProvider } from "./avatarCache.js";

vi.mock("./client.js", () => ({
  getClient: () => null,
  isClientConnected: () => false,
}));

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
}

function createClient(ids = ["10", "20"]) {
  const entities = ids.map((id) => ({ className: "Channel", id, photo: { photoId: `${id}-photo` } }));
  const getDialogs = vi.fn().mockResolvedValue(entities.map((entity) => ({ entity })));
  const downloadProfilePhoto = vi.fn().mockResolvedValue(jpeg);
  return {
    client: { getDialogs, downloadProfilePhoto } as unknown as TelegramClient,
    entities,
    getDialogs,
    downloadProfilePhoto,
  };
}

describe("source avatar cache", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("merges requests for the same source and shares cached small photos", async () => {
    const telegram = createClient();
    const gate = deferred<Buffer>();
    telegram.downloadProfilePhoto.mockReturnValue(gate.promise);
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
    });

    const first = provider.getSourceAvatar("10");
    const second = provider.getSourceAvatar("10");
    await vi.waitFor(() => expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(1));
    gate.resolve(jpeg);

    expect(await first).toEqual({ buffer: jpeg, mimeType: "image/jpeg" });
    expect(await second).toEqual(await provider.getSourceAvatar("10"));
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(1);
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledWith(telegram.entities[0], { isBig: false });
  });

  it("refreshes continuously used photos after an absolute TTL", async () => {
    let now = 0;
    const telegram = createClient();
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
      now: () => now,
    });

    await provider.getSourceAvatar("10");
    now = AVATAR_CACHE_LIMITS.ttlMs - 1;
    await provider.getSourceAvatar("10");
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(1);
    now += 1;
    await provider.getSourceAvatar("10");
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(2);
    expect(telegram.getDialogs).toHaveBeenCalledTimes(2);
  });

  it("caches empty photos and transient failures briefly, then retries", async () => {
    let now = 0;
    const telegram = createClient();
    telegram.downloadProfilePhoto.mockResolvedValueOnce(Buffer.alloc(0)).mockRejectedValueOnce(
      new Error("private Telegram detail"),
    );
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
      now: () => now,
    });

    expect(await provider.getSourceAvatar("10")).toBeNull();
    expect(await provider.getSourceAvatar("10")).toBeNull();
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(1);
    now += AVATAR_CACHE_LIMITS.failureTtlMs;
    expect(await provider.getSourceAvatar("10")).toBeNull();
    expect(await provider.getSourceAvatar("10")).toBeNull();
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(2);
    now += AVATAR_CACHE_LIMITS.failureTtlMs;
    expect(await provider.getSourceAvatar("10")).toEqual({ buffer: jpeg, mimeType: "image/jpeg" });
  });

  it.each([
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    Buffer.alloc(AVATAR_CACHE_LIMITS.maxSingleEntryBytes + 1, 0xff),
    "/tmp/avatar.jpg",
    undefined,
  ])("rejects invalid or oversized image payloads %#", async (payload) => {
    const telegram = createClient();
    telegram.downloadProfilePhoto.mockResolvedValue(payload);
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
    });
    expect(await provider.getSourceAvatar("10")).toBeNull();
  });

  it("does not look up arbitrary peers or personal senders outside known source dialogs", async () => {
    const telegram = createClient();
    telegram.getDialogs.mockResolvedValue([
      { entity: { className: "User", id: "30" } },
      { entity: { className: "Chat", id: "40" } },
    ]);
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
    });
    expect(await provider.getSourceAvatar("unknown")).toBeNull();
    expect(await provider.getSourceAvatar("30")).toBeNull();
    expect(telegram.downloadProfilePhoto).not.toHaveBeenCalled();
    expect(await provider.getSourceAvatar("40")).toMatchObject({ mimeType: "image/jpeg" });
  });

  it("drops in-flight old-account responses and resolves entities again for the new account", async () => {
    const oldAccount = createClient();
    const newAccount = createClient();
    const oldPhoto = deferred<Buffer>();
    oldAccount.downloadProfilePhoto.mockReturnValue(oldPhoto.promise);
    const newPhoto = Buffer.from([0xff, 0xd8, 0xff, 0xe1]);
    newAccount.downloadProfilePhoto.mockResolvedValue(newPhoto);
    let currentClient = oldAccount.client;
    const provider = createSourceAvatarProvider({
      getClient: () => currentClient,
      isClientConnected: () => true,
    });

    const oldRequest = provider.getSourceAvatar("10");
    await vi.waitFor(() => expect(oldAccount.downloadProfilePhoto).toHaveBeenCalledTimes(1));
    currentClient = newAccount.client;
    expect(await provider.getSourceAvatar("10")).toEqual({ buffer: newPhoto, mimeType: "image/jpeg" });
    oldPhoto.resolve(jpeg);
    expect(await oldRequest).toBeNull();
    expect(await provider.getSourceAvatar("10")).toEqual({ buffer: newPhoto, mimeType: "image/jpeg" });
    expect(newAccount.getDialogs).toHaveBeenCalledTimes(1);
    expect(newAccount.downloadProfilePhoto).toHaveBeenCalledTimes(1);
  });

  it("does not start a download if the account changes while dialogs are loading", async () => {
    const oldAccount = createClient();
    const gate = deferred<any[]>();
    oldAccount.getDialogs.mockReturnValue(gate.promise);
    let currentClient: TelegramClient | null = oldAccount.client;
    const provider = createSourceAvatarProvider({
      getClient: () => currentClient,
      isClientConnected: () => true,
    });
    const request = provider.getSourceAvatar("10");
    await vi.waitFor(() => expect(oldAccount.getDialogs).toHaveBeenCalledTimes(1));
    currentClient = null;
    gate.resolve(oldAccount.entities.map((entity) => ({ entity })));
    expect(await request).toBeNull();
    expect(oldAccount.downloadProfilePhoto).not.toHaveBeenCalled();
  });

  it("limits unique in-flight work and keeps timed-out downloads in the shared budget", async () => {
    vi.useFakeTimers();
    const ids = Array.from({ length: AVATAR_CACHE_LIMITS.maxPendingRequests + 1 }, (_, i) => `${i}`);
    const telegram = createClient(ids);
    const gate = deferred<Buffer>();
    telegram.downloadProfilePhoto.mockReturnValue(gate.promise);
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
    });
    const requests = ids.map((id) => provider.getSourceAvatar(id));
    await vi.advanceTimersByTimeAsync(0);
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(AVATAR_CACHE_LIMITS.maxConcurrency);
    expect(telegram.getDialogs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AVATAR_CACHE_LIMITS.requestTimeoutMs);
    expect(await Promise.all(requests)).toEqual(ids.map(() => null));
    await provider.getSourceAvatar("another-source");
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(AVATAR_CACHE_LIMITS.maxConcurrency);

    gate.resolve(jpeg);
    await vi.advanceTimersByTimeAsync(0);
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(AVATAR_CACHE_LIMITS.maxPendingRequests);
  });

  it("evicts old source results when the entry limit is reached", async () => {
    const ids = Array.from({ length: AVATAR_CACHE_LIMITS.maxEntries + 1 }, (_, i) => `${i}`);
    const telegram = createClient(ids);
    const provider = createSourceAvatarProvider({
      getClient: () => telegram.client,
      isClientConnected: () => true,
    });
    for (const id of ids) await provider.getSourceAvatar(id);
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(ids.length);
    await provider.getSourceAvatar("0");
    expect(telegram.downloadProfilePhoto).toHaveBeenCalledTimes(ids.length + 1);
  });
});
