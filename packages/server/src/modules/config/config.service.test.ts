import { describe, expect, it } from "vitest";
import {
  applyConfigUpdateSideEffects,
  shouldResetTelegramClientAfterConfigChange,
} from "./config.service.js";

describe("config.service", () => {
  it("only resets the Telegram client when Telegram config changed and the client is disconnected", () => {
    expect(
      shouldResetTelegramClientAfterConfigChange({ telegram: false, media: false }, null),
    ).toBe(false);
    expect(
      shouldResetTelegramClientAfterConfigChange({ telegram: true, media: false }, {
        connected: true,
      }),
    ).toBe(false);
    expect(
      shouldResetTelegramClientAfterConfigChange({ telegram: true, media: false }, {
        connected: false,
      }),
    ).toBe(true);
    expect(
      shouldResetTelegramClientAfterConfigChange({ telegram: true, media: false }, null),
    ).toBe(true);
  });

  it("applies runtime side effects for config changes", () => {
    const effects = {
      getTelegramClient: () => ({ connected: false }),
      resetTelegramClientCalls: 0,
      clearMediaCacheCalls: 0,
      resetTelegramClient() {
        this.resetTelegramClientCalls += 1;
      },
      clearMediaCache() {
        this.clearMediaCacheCalls += 1;
      },
    };

    applyConfigUpdateSideEffects({ telegram: true, media: true }, effects);

    expect(effects.resetTelegramClientCalls).toBe(1);
    expect(effects.clearMediaCacheCalls).toBe(1);
  });

  it("keeps a connected Telegram client alive after config save", () => {
    const effects = {
      getTelegramClient: () => ({ connected: true }),
      resetTelegramClientCalls: 0,
      clearMediaCacheCalls: 0,
      resetTelegramClient() {
        this.resetTelegramClientCalls += 1;
      },
      clearMediaCache() {
        this.clearMediaCacheCalls += 1;
      },
    };

    applyConfigUpdateSideEffects({ telegram: true, media: false }, effects);

    expect(effects.resetTelegramClientCalls).toBe(0);
    expect(effects.clearMediaCacheCalls).toBe(0);
  });
});
