import { describe, expect, it } from "vitest";
import type { BrowserStorage } from "@telegram-star/shared/browser-storage";
import {
  consumeTelegramJumpMessageId,
  rememberTelegramJumpMessageId,
} from "./messageNavigation";

function createMemoryStorage(): BrowserStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("message navigation storage", () => {
  it("stores and consumes a Telegram jump target once", () => {
    const storage = createMemoryStorage();

    rememberTelegramJumpMessageId(42, storage);

    expect(consumeTelegramJumpMessageId(storage)).toBe(42);
    expect(consumeTelegramJumpMessageId(storage)).toBeNull();
  });

  it("does not interrupt external navigation when session storage is unavailable", () => {
    expect(() => rememberTelegramJumpMessageId(42, undefined)).not.toThrow();
    expect(consumeTelegramJumpMessageId(undefined)).toBeNull();
  });
});
