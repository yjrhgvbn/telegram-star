import { describe, expect, it } from "vitest";
import { buildForwardTargetTestNotification, toApiForwardTarget } from "./forward-targets.service.js";

describe("forward-targets.service", () => {
  it("maps database rows to API forward targets", () => {
    const target = toApiForwardTarget({
      id: 12,
      name: "Telegram Alerts",
      appriseUrl: "mailto://user:pass@example.com",
      enabled: true,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T01:00:00.000Z",
      filters: [{ id: 2 }, { id: 5 }],
    });

    expect(target).toEqual({
      id: 12,
      name: "Telegram Alerts",
      appriseUrl: "mailto://user:pass@example.com",
      enabled: true,
      filterIds: [2, 5],
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T01:00:00.000Z",
    });
  });

  it("builds the standard forward-target test notification", () => {
    const notification = buildForwardTargetTestNotification();

    expect(notification.title).toBe("[Telegram] 测试消息");
    expect(notification.body).toContain("Telegram Star");
    expect(notification.body).toContain("转发通道配置成功");
  });
});
