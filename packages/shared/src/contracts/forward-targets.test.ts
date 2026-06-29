import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORWARD_BODY_TEMPLATE,
  DEFAULT_FORWARD_TITLE_TEMPLATE,
  forwardTargetCreateInputSchema,
  forwardTargetListSchema,
  forwardTargetTestInputSchema,
  renderForwardTemplate,
} from "./forward-targets";

describe("forward targets contract", () => {
  it("accepts a persisted forward target response", () => {
    const targets = forwardTargetListSchema.parse([
      {
        id: 1,
        name: "Feishu on-call",
        appriseUrl: "feishu://token",
        enabled: true,
        filterIds: [1, 2],
        titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
        bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(targets[0]?.filterIds).toEqual([1, 2]);
  });

  it("rejects empty target names and apprise urls", () => {
    expect(() =>
      forwardTargetCreateInputSchema.parse({
        name: " ",
        appriseUrl: "feishu://token",
        enabled: true,
        filterIds: [],
      }),
    ).toThrow();

    expect(() =>
      forwardTargetCreateInputSchema.parse({
        name: "Feishu",
        appriseUrl: " ",
        enabled: true,
        filterIds: [],
      }),
    ).toThrow();
  });

  it("fills default templates for backward-compatible create payloads", () => {
    expect(
      forwardTargetCreateInputSchema.parse({
        name: "Feishu",
        appriseUrl: "feishu://token",
        enabled: true,
        filterIds: [],
      }),
    ).toEqual({
      name: "Feishu",
      appriseUrl: "feishu://token",
      enabled: true,
      filterIds: [],
      titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    });
  });

  it("validates test notification input", () => {
    expect(forwardTargetTestInputSchema.parse({ appriseUrl: "discord://id/token" })).toEqual({
      appriseUrl: "discord://id/token",
      titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
      bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
    });

    expect(
      forwardTargetTestInputSchema.parse({
        appriseUrl: "discord://id/token",
        titleTemplate: "{{content}}",
        bodyTemplate: "{{chatTitle}}",
      }),
    ).toEqual({
      appriseUrl: "discord://id/token",
      titleTemplate: "{{content}}",
      bodyTemplate: "{{chatTitle}}",
    });

    expect(() => forwardTargetTestInputSchema.parse({ appriseUrl: "" })).toThrow();
  });

  it("renders only known template variables", () => {
    expect(
      renderForwardTemplate("{{filterName}} {{unknown}} {{matchedKeyword}}", {
        filterName: "规则",
        matchedKeyword: null,
        chatTitle: "频道",
        senderName: "Alice",
        senderId: 42,
        content: "正文",
        messageDate: "2026-06-29",
        telegramLink: "https://t.me/c/1/2",
      }),
    ).toBe("规则 {{unknown}} ");
  });
});
