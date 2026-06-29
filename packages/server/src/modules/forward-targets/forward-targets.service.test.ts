import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  FORWARD_TEMPLATE_SAMPLE_PAYLOAD,
} from "@telegram-star/shared/contracts/forward-targets";
import { buildForwardTargetTestNotification, toApiForwardTarget } from "./forward-targets.service.js";

describe("forward-targets.service", () => {
  it("maps database rows to API forward targets", () => {
    const target = toApiForwardTarget({
      id: 12,
      name: "Telegram Alerts",
      appriseUrl: "mailto://user:pass@example.com",
      enabled: true,
      titleTemplate: null,
      bodyTemplate: null,
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
      titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T01:00:00.000Z",
    });
  });

  it("builds the forward-target test notification from templates", () => {
    const notification = buildForwardTargetTestNotification({
      appriseUrl: "mailto://user:pass@example.com",
      titleTemplate: "{{content}}",
      bodyTemplate: "{{chatTitle}} · {{senderName}} · {{matchedKeyword}}",
    });

    expect(notification.title).toBe(FORWARD_TEMPLATE_SAMPLE_PAYLOAD.content);
    expect(notification.body).toBe("追踪频道 · 消息发布者 · 测试标题");
  });
});
