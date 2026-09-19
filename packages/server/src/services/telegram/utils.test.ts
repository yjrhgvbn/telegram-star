import { describe, expect, it } from "vitest";
import { buildDialogEntityMap, buildTelegramLink, getChatId, getChatTitle, getPeerChatId, getScopedChatIds } from "./utils.js";

describe("Telegram source identities", () => {
  it("separates users from colliding channel IDs without changing stored channel/group keys", () => {
    const channel = { className: "Channel", id: "321", title: "News" };
    const user = { className: "User", id: "321", firstName: "Alice", lastName: "Z" };
    const bot = { className: "User", id: "654", firstName: "Helper", bot: true };
    const map = buildDialogEntityMap([{ entity: channel }, { entity: user }, { entity: bot }]);
    expect(getChatId(channel)).toBe("321");
    expect(getChatId({ className: "Chat", id: "123" })).toBe("123");
    expect(getChatId(user)).toBe("user:321");
    expect(getChatId(bot)).toBe("user:654");
    expect(getPeerChatId({ className: "PeerChannel", channelId: "321" })).toBe("321");
    expect(getPeerChatId({ className: "PeerUser", userId: "321" })).toBe("user:321");
    expect(map.get("321")).toBe(channel);
    expect(map.get("user:321")).toBe(user);
    expect(map.get("user:654")).toBe(bot);
    expect(map.size).toBe(3);
    expect(getChatTitle(user)).toBe("Alice Z");
  });

  it("unions OR-selected sources and creates private conversation links without fake message URLs", () => {
    expect(getScopedChatIds([
      { type: "chat", values: ["321"], groupId: "sources" },
      { type: "chat", values: ["user:321", "user:654"], groupId: "sources" },
    ])).toEqual(new Set(["321", "user:321", "user:654"]));
    expect(buildTelegramLink("user:321", { className: "User", username: "alice" }, 10)).toBe("https://t.me/alice");
    expect(buildTelegramLink("user:321", { className: "User", phone: "+123456789" }, 10)).toBe("https://t.me/+123456789");
    expect(buildTelegramLink("user:321", { className: "User" }, 10)).toBe("");
    expect(buildTelegramLink("321", { className: "Channel" }, 10)).toBe("https://t.me/c/321/10");
  });
});
