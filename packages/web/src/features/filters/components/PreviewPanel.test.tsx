// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoricalFilterPreviewMessage } from "@/types";
import { PreviewPanel } from "./PreviewPanel";

function createPreviewMessage(
  overrides: Partial<HistoricalFilterPreviewMessage> = {},
): HistoricalFilterPreviewMessage {
  return {
    id: 1,
    chatId: "chat-1",
    chatTitle: "测试会话",
    senderName: "测试用户",
    senderId: "user-1",
    content: "红包 V12.4，又一个红包，版本 v13.5",
    contentLinks: [],
    messageDate: "2026-08-24T00:00:00.000Z",
    telegramLink: "",
    inDatabase: false,
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
    matchedKeyword: "红包",
    ...overrides,
  };
}

describe("PreviewPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lets the user expand the preview scan range", async () => {
    const user = userEvent.setup();
    const onPreviewLimitChange = vi.fn();

    render(
      <PreviewPanel
        previewEnabled
        previewLoading={false}
        previewStale={false}
        previewError=""
        previewMessages={[]}
        previewSummary={{ scannedChats: 1, total: 0 }}
        previewLimit="200"
        onPreviewLimitChange={onPreviewLimitChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "预览扫描范围" }));
    await user.click(await screen.findByRole("option", { name: "最近 1,000 条 / 会话" }));

    expect(onPreviewLimitChange).toHaveBeenCalledWith("1000");
  });

  it("highlights every keyword and actual regex match from server evidence", () => {
    const { container } = render(
      <PreviewPanel
        previewEnabled
        previewLoading={false}
        previewStale={false}
        previewError=""
        previewMessages={[
          createPreviewMessage({
            matchEvidence: [
              {
                conditionIndex: 0,
                type: "keyword",
                effect: "require",
                passed: true,
                matchedValues: ["红包"],
                matchedTexts: ["红包"],
              },
              {
                conditionIndex: 1,
                type: "regex",
                effect: "require",
                passed: true,
                matchedValues: ["v\\d+\\.\\d+"],
                matchedTexts: ["V12.4", "v13.5"],
              },
            ],
          }),
        ]}
        previewSummary={{ scannedChats: 1, total: 1 }}
        previewLimit="200"
        onPreviewLimitChange={vi.fn()}
      />,
    );

    expect(
      Array.from(container.querySelectorAll("mark"), (element) => element.textContent),
    ).toEqual(["红包", "V12.4", "红包", "v13.5"]);
    expect(screen.getByText("高亮 4 处 · 3 个命中项")).toBeTruthy();
  });

  it("keeps highlighting every occurrence for responses from an older server", () => {
    const { container } = render(
      <PreviewPanel
        previewEnabled
        previewLoading={false}
        previewStale={false}
        previewError=""
        previewMessages={[createPreviewMessage({ content: "红包，又一个红包" })]}
        previewSummary={{ scannedChats: 1, total: 1 }}
        previewLimit="200"
        onPreviewLimitChange={vi.fn()}
      />,
    );

    expect(
      Array.from(container.querySelectorAll("mark"), (element) => element.textContent),
    ).toEqual(["红包", "红包"]);
  });

  it("shows one rejected sample and highlights the exclusion reason", () => {
    const excludedSample = {
      ...createPreviewMessage({
        id: 2,
        content: "红包活动已结束，感谢参与",
        matchedKeyword: null,
        matchEvidence: [
          {
            conditionIndex: 0,
            type: "keyword" as const,
            effect: "require" as const,
            passed: true,
            matchedValues: ["红包"],
            matchedTexts: ["红包"],
          },
          {
            conditionIndex: 1,
            type: "keyword" as const,
            effect: "exclude" as const,
            passed: false,
            matchedValues: ["已结束"],
            matchedTexts: ["已结束"],
          },
        ],
      }),
      matched: false,
    };
    const { container } = render(
      <PreviewPanel
        previewEnabled
        previewLoading={false}
        previewStale={false}
        previewError=""
        previewMessages={[createPreviewMessage()]}
        previewSamples={[excludedSample]}
        previewSummary={{ scannedChats: 1, total: 1 }}
        previewLimit="200"
        onPreviewLimitChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/已排除/)).not.toBeNull();
    expect(
      Array.from(container.querySelectorAll("mark"), (element) => element.textContent),
    ).toContain("已结束");
    expect(screen.getByText("命中 1 处排除项")).not.toBeNull();
  });
});
