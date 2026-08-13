import { describe, expect, it } from "vitest";
import { buildForwardNotification, getSafeProcessError } from "./notifier.js";

const payload = {
  filterId: 1,
  filterName: "规则",
  matchedKeyword: "关键词",
  chatTitle: "频道",
  senderName: "Alice",
  senderId: "user-1",
  content: "这是一条命中消息",
  messageDate: "2026-06-29T12:00:00.000Z",
  telegramLink: "https://t.me/c/1/2",
};

describe("notifier templates", () => {
  it("renders custom target templates with message variables", () => {
    const notification = buildForwardNotification(payload, {
      titleTemplate: "{{filterName}} / {{chatTitle}}",
      bodyTemplate: "{{senderName}}({{senderId}}): {{content}}\n{{telegramLink}}",
    });

    expect(notification.title).toBe("规则 / 频道");
    expect(notification.body).toContain("Alice(user-1): 这是一条命中消息");
    expect(notification.body).toContain("https://t.me/c/1/2");
  });

  it("falls back to the default format when templates are empty", () => {
    const notification = buildForwardNotification(payload, {
      titleTemplate: " ",
      bodyTemplate: "",
    });

    expect(notification.title).toContain("命中规则: 规则");
    expect(notification.body).toContain("【群组】: 频道");
    expect(notification.body).toContain("链接: https://t.me/c/1/2");
  });

  it("keeps child-process command arguments out of log metadata", () => {
    const error = Object.assign(
      new Error("Command failed: apprise -t secret test://token"),
      {
        code: 1,
        cmd: "apprise -t secret test://token",
        stderr: "test://token",
      },
    );

    expect(getSafeProcessError(error)).toEqual({
      name: "Error",
      code: 1,
      signal: undefined,
      killed: undefined,
    });
    expect(JSON.stringify(getSafeProcessError(error))).not.toContain("secret");
    expect(JSON.stringify(getSafeProcessError(error))).not.toContain("token");
  });
});
