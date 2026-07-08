import { describe, expect, it } from "vitest";
import {
  getPreferredNativeExternalUrl,
  getTelegramAppUrl,
} from "./telegram-links";

describe("Telegram link helpers", () => {
  it("converts public message links to Telegram app URLs", () => {
    expect(getTelegramAppUrl("https://t.me/telegram/42")).toBe(
      "tg://resolve?domain=telegram&post=42",
    );
    expect(getTelegramAppUrl("https://t.me/s/telegram/42")).toBe(
      "tg://resolve?domain=telegram&post=42",
    );
  });

  it("converts private channel message links to Telegram app URLs", () => {
    expect(getTelegramAppUrl("https://t.me/c/123456789/42")).toBe(
      "tg://privatepost?channel=123456789&post=42",
    );
  });

  it("converts common Telegram links and keeps existing app URLs", () => {
    expect(getTelegramAppUrl("https://t.me/telegram")).toBe("tg://resolve?domain=telegram");
    expect(getTelegramAppUrl("https://t.me/+invite-token")).toBe(
      "tg://join?invite=invite-token",
    );
    expect(getTelegramAppUrl("tg://resolve?domain=telegram")).toBe(
      "tg://resolve?domain=telegram",
    );
  });

  it("keeps non-Telegram links unchanged for native external opening", () => {
    expect(getTelegramAppUrl("https://example.com/telegram/42")).toBeNull();
    expect(getPreferredNativeExternalUrl("https://example.com/telegram/42")).toBe(
      "https://example.com/telegram/42",
    );
  });
});
