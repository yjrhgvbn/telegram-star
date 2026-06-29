import { describe, expect, it } from "vitest";
import { extractReactionMessageRef, hasUserReactionSignal } from "./readReactionSignal.js";

describe("readReactionSignal", () => {
  it("detects user-owned reaction signals from chosen flags", () => {
    expect(hasUserReactionSignal({ reactions: { results: [{ chosen: true }] } })).toBe(true);
    expect(hasUserReactionSignal({ reactions: { results: [{ chosenOrder: 0 }] } })).toBe(true);
    expect(hasUserReactionSignal({ reactions: { results: [{ chosenOrder: 2 }] } })).toBe(true);
  });

  it("ignores ambiguous reaction signals", () => {
    expect(hasUserReactionSignal({ reactions: { results: [{ chosen: false }] } })).toBe(false);
    expect(hasUserReactionSignal({ reactions: { results: [{ chosenOrder: -1 }] } })).toBe(false);
    expect(hasUserReactionSignal({ reactions: { results: [{ chosenOrder: 1.5 }] } })).toBe(false);
    expect(hasUserReactionSignal({ reactions: { results: [{ chosenOrder: null }] } })).toBe(false);
    expect(hasUserReactionSignal({ reactions: { results: undefined } })).toBe(false);
  });

  it("extracts channel and group message refs from reaction updates", () => {
    expect(
      extractReactionMessageRef({
        className: "UpdateMessageReactions",
        msgId: 42,
        peer: { className: "PeerChannel", channelId: { toString: () => "1001" } },
      }),
    ).toEqual({ chatId: "1001", telegramMessageId: 42 });

    expect(
      extractReactionMessageRef({
        className: "UpdateMessageReactions",
        msgId: 43,
        peer: { className: "PeerChat", chatId: { toString: () => "2002" } },
      }),
    ).toEqual({ chatId: "2002", telegramMessageId: 43 });
  });

  it("ignores unsupported or incomplete reaction updates", () => {
    expect(extractReactionMessageRef({ className: "UpdateNewMessage" })).toBeNull();
    expect(
      extractReactionMessageRef({
        className: "UpdateMessageReactions",
        msgId: 44,
        peer: { className: "PeerUser", userId: { toString: () => "3003" } },
      }),
    ).toBeNull();
    expect(
      extractReactionMessageRef({
        className: "UpdateMessageReactions",
        msgId: 0,
        peer: { className: "PeerChannel", channelId: { toString: () => "1001" } },
      }),
    ).toBeNull();
  });
});
