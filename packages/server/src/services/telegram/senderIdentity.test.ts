import bigInt from "big-integer";
import { Api } from "telegram";
import { describe, expect, it, vi } from "vitest";
import { getSenderUserId } from "./senderIdentity.js";

describe("Telegram sender user identity", () => {
  it("reads a user peer without resolving its entity or losing integer precision", () => {
    const getSender = vi.fn(() => { throw new Error("must not query Telegram"); });
    const message = {
      fromId: new Api.PeerUser({ userId: bigInt("9007199254740993") }),
      getSender,
    };
    expect(getSenderUserId(message)).toBe("9007199254740993");
    expect(getSender).not.toHaveBeenCalled();
  });

  it.each([
    { fromId: { className: "PeerChannel", userId: "123" }, sender: { className: "User", id: "123" } },
    { fromId: { className: "PeerChat", userId: "123" }, sender: { className: "User", id: "123" } },
    { fromId: { className: "Unknown", userId: "123" }, sender: { className: "User", id: "123" } },
    { post: true, sender: { className: "User", id: "123" }, postAuthor: "123" },
    { fromId: undefined, senderId: "123", postAuthor: "123", fwdFrom: { fromId: { className: "PeerUser", userId: "123" } } },
  ])("does not reinterpret non-user or unknown identities as users: %j", (message) => {
    expect(getSenderUserId(message)).toBeNull();
  });

  it("matches the forwarding user rather than the forwarded author", () => {
    const message = {
      fromId: { className: "PeerUser", userId: "123" },
      fwdFrom: { fromId: { className: "PeerUser", userId: "456" } },
    };
    expect(getSenderUserId(message)).toBe("123");
  });

  it("accepts cached users including bots, and only infers incoming private peers", () => {
    const bot = { sender: { className: "User", id: "456", bot: true } };
    expect(getSenderUserId(bot)).toBe("456");
    expect(getSenderUserId({ sender: { className: "Channel", id: "456" } })).toBeNull();
    const peerId = new Api.PeerUser({ userId: bigInt("123") });
    expect(getSenderUserId({ peerId, out: false })).toBe("123");
    expect(getSenderUserId({ peerId, out: true })).toBeNull();
    expect(getSenderUserId({ peerId })).toBeNull();
    expect(getSenderUserId(new Api.Message({ id: 1, peerId, date: 1, message: "incoming" }))).toBe("123");
  });

  it.each(["", "0", "-123", "1.2", "@alice", "9223372036854775808", 9_007_199_254_740_992])(
    "rejects malformed, overflowing, or imprecise user IDs: %s",
    (userId) => expect(getSenderUserId({ fromId: { className: "PeerUser", userId } })).toBeNull(),
  );
});
