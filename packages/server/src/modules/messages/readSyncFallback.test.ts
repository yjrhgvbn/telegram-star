import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERACTION_SYNC_INTERVAL_MS,
  resetInteractionSyncThrottleForTests,
  runInteractionSync,
  shouldRunInteractionSync,
  type ReadSyncFallbackMessage,
} from "./readSyncFallback.js";

const messages: ReadSyncFallbackMessage[] = [
  { id: 1, chatId: "chat-1", telegramMessageId: 100, isRead: false },
];

const log = {
  debug: vi.fn(),
  info: vi.fn(),
};

describe("readSyncFallback", () => {
  beforeEach(() => {
    resetInteractionSyncThrottleForTests();
    vi.clearAllMocks();
  });

  it("allows sync after the interval has elapsed", () => {
    expect(shouldRunInteractionSync(INTERACTION_SYNC_INTERVAL_MS, 0)).toBe(true);
    expect(shouldRunInteractionSync(INTERACTION_SYNC_INTERVAL_MS - 1, 0)).toBe(false);
  });

  it("runs sync once and skips the next call inside the interval", async () => {
    const syncRead = vi.fn(async () => new Set([1]));
    const first = await runInteractionSync(messages, log, {
      nowMs: INTERACTION_SYNC_INTERVAL_MS,
      syncRead,
    });

    expect(first).toEqual(new Set([1]));
    expect(syncRead).toHaveBeenCalledOnce();

    const syncReadAgain = vi.fn(async () => new Set([1]));
    const second = await runInteractionSync(messages, log, {
      nowMs: INTERACTION_SYNC_INTERVAL_MS + 1,
      syncRead: syncReadAgain,
    });

    expect(second.size).toBe(0);
    expect(syncReadAgain).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalled();
  });
});
