// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { HistoricalFilterPreviewMessage, HistoricalFilterPreviewSample } from "@/types";
import { PreviewPanel } from "./PreviewPanel";

function createPreviewMessage(overrides: Partial<HistoricalFilterPreviewMessage> = {}): HistoricalFilterPreviewMessage {
  return {
    id: 1,
    chatId: "chat-1",
    chatTitle: "测试会话",
    senderName: "测试用户",
    senderId: "user-1",
    senderUserId: null,
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

function createExcludedSample(id: number, keyword: string): HistoricalFilterPreviewSample {
  return {
    ...createPreviewMessage({
      id,
      content: `红包${keyword}，感谢参与`,
      matchedKeyword: null,
      matchEvidence: [{
        conditionIndex: 1,
        groupId: "exclude-group",
        type: "keyword",
        effect: "exclude",
        passed: false,
        groupPassed: false,
        matchedValues: [keyword],
        matchedTexts: [keyword],
      }],
    }),
    matched: false,
  };
}

function props(overrides: Partial<ComponentProps<typeof PreviewPanel>> = {}): ComponentProps<typeof PreviewPanel> {
  return {
    previewEnabled: true,
    previewLoading: false,
    previewStale: false,
    previewError: "",
    previewMessages: [],
    previewSummary: { scannedChats: 1, total: 0 },
    previewLimit: "200",
    onPreviewLimitChange: vi.fn(),
    ...overrides,
  };
}

describe("PreviewPanel", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("labels sender evidence and locates its condition without highlighting an ID as message content", async () => {
    const user = userEvent.setup();
    const onLocateCondition = vi.fn();
    const { container } = render(<PreviewPanel {...props({ onLocateCondition, previewMessages: [createPreviewMessage({
      content: "123456789 发布了更新", senderUserId: "123456789", matchedKeyword: null,
      matchEvidence: [{ conditionIndex: 0, groupId: "sender-group", type: "sender", effect: "require", passed: true, groupPassed: true, matchedValues: ["123456789"], matchedTexts: [] }],
    })] })} />);
    await user.click(screen.getByRole("button", { name: "发送者用户 ID · 123456789" }));
    expect(onLocateCondition).toHaveBeenCalledWith("sender-group");
    expect(container.querySelector("mark")).toBeNull();
  });

  it("lets the user expand the preview scan range", async () => {
    const user = userEvent.setup();
    const onPreviewLimitChange = vi.fn();
    render(<PreviewPanel {...props({ onPreviewLimitChange })} />);
    await user.click(screen.getByRole("combobox", { name: "预览扫描范围" }));
    await user.click(await screen.findByRole("option", { name: "每会话最近 1,000 条" }));
    expect(onPreviewLimitChange).toHaveBeenCalledWith("1000");
  });

  it("highlights every keyword and actual regex match from server evidence", () => {
    const { container } = render(<PreviewPanel {...props({
      previewMessages: [createPreviewMessage({
        matchEvidence: [
          { conditionIndex: 0, type: "keyword", effect: "require", passed: true, matchedValues: ["红包"], matchedTexts: ["红包"] },
          { conditionIndex: 1, type: "regex", effect: "require", passed: true, matchedValues: ["v\\d+\\.\\d+"], matchedTexts: ["V12.4", "v13.5"] },
        ],
      })],
      previewSummary: { scannedChats: 1, total: 1 },
    })} />);

    expect(Array.from(container.querySelectorAll("mark"), (element) => element.textContent)).toEqual(["红包", "V12.4", "红包", "v13.5"]);
    expect(screen.getByText("关键词 · 红包")).toBeTruthy();
    expect(screen.getByText("正则 · v\\d+\\.\\d+")).toBeTruthy();
  });

  it("preserves Telegram line breaks and maps normalized evidence across whitespace", () => {
    const { container } = render(<PreviewPanel {...props({
      previewMessages: [createPreviewMessage({ content: "**红包**\n  V12.4\n又一个红包", matchedKeyword: "红包 V12.4" })],
    })} />);
    expect(container.querySelector(".rule-preview-content")?.textContent).toBe("红包\n  V12.4\n又一个红包");
    expect(container.querySelector("mark")?.textContent).toBe("红包\n  V12.4");
  });

  it("keeps highlighting every occurrence for responses from an older server", () => {
    const { container } = render(<PreviewPanel {...props({
      previewMessages: [createPreviewMessage({ content: "红包，又一个红包" })],
    })} />);
    expect(Array.from(container.querySelectorAll("mark"), (element) => element.textContent)).toEqual(["红包", "红包"]);
  });

  it("keeps the original Telegram link reachable", () => {
    render(<PreviewPanel {...props({ previewMessages: [createPreviewMessage({ telegramLink: "https://t.me/example/123" })] })} />);
    expect(screen.getByRole("link", { name: "打开 Telegram 原消息" }).getAttribute("href")).toBe("https://t.me/example/123");
  });

  it("shows all rejected samples in their own tab even when nothing matches", async () => {
    const user = userEvent.setup();
    const { container } = render(<PreviewPanel {...props({
      previewSamples: [createExcludedSample(2, "已结束"), createExcludedSample(3, "重复发布")],
    })} />);

    expect(screen.getByText("当前范围内没有匹配样本")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "排除样本 2" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(Array.from(container.querySelectorAll("mark"), (element) => element.textContent)).toEqual(["已结束", "重复发布"]);
    expect(screen.getByText("排除关键词 · 已结束")).toBeTruthy();
    expect(screen.getByText("排除关键词 · 重复发布")).toBeTruthy();
  });

  it("explains missing required conditions without treating a failed OR sibling as the rejection", async () => {
    const user = userEvent.setup();
    const sample: HistoricalFilterPreviewSample = {
      ...createPreviewMessage({ matchedKeyword: null, matchEvidence: [
        { conditionIndex: 0, groupId: "passed-group", type: "regex", effect: "require", passed: false, groupPassed: true, matchedValues: [], matchedTexts: [] },
        { conditionIndex: 1, groupId: "failed-group", type: "keyword", effect: "require", passed: false, groupPassed: false, matchedValues: [], matchedTexts: [] },
      ] }),
      matched: false,
    };
    render(<PreviewPanel {...props({ previewSamples: [sample] })} />);
    await user.click(screen.getByRole("tab", { name: "排除样本 1" }));
    expect(screen.getByText("未满足关键词")).toBeTruthy();
    expect(screen.queryByText("未满足正则")).toBeNull();
  });

  it("locates evidence groups only while results describe the current conditions", async () => {
    const user = userEvent.setup();
    const onLocateCondition = vi.fn();
    const initialProps = props({ onLocateCondition, previewSamples: [createExcludedSample(2, "已结束")] });
    const { rerender } = render(<PreviewPanel {...initialProps} />);
    await user.click(screen.getByRole("tab", { name: "排除样本 1" }));
    await user.click(screen.getByRole("button", { name: "排除关键词 · 已结束" }));
    expect(onLocateCondition).toHaveBeenCalledWith("exclude-group");

    rerender(<PreviewPanel {...initialProps} previewStale />);
    expect(screen.queryByRole("button", { name: "排除关键词 · 已结束" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("显示上次结果");
  });

  it("keeps previous samples visible and discloses an update failure", () => {
    render(<PreviewPanel {...props({ previewError: "Telegram 连接不可用", previewMessages: [createPreviewMessage()] })} />);
    expect(screen.getByRole("article")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("更新失败，显示上次结果。Telegram 连接不可用");
  });

  it("progressively reveals samples on scroll or the accessible load-more button", async () => {
    const user = userEvent.setup();
    render(<PreviewPanel {...props({ previewMessages: Array.from({ length: 45 }, (_, index) => createPreviewMessage({ id: index + 1 })) })} />);
    expect(screen.getAllByRole("article")).toHaveLength(20);
    fireEvent.scroll(screen.getByRole("tabpanel"));
    expect(screen.getAllByRole("article")).toHaveLength(40);
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    expect(screen.getAllByRole("article")).toHaveLength(45);
    expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
  });

  it("lets long original messages expand without discarding their content", async () => {
    const user = userEvent.setup();
    const content = Array.from({ length: 8 }, (_, index) => `第 ${index + 1} 行消息`).join("\n");
    const { container } = render(<PreviewPanel {...props({ previewMessages: [createPreviewMessage({ content })] })} />);
    expect(container.querySelector(".rule-preview-content")?.getAttribute("data-collapsed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "展开原文" }));
    expect(container.querySelector(".rule-preview-content")?.getAttribute("data-collapsed")).toBeNull();
    expect(container.querySelector(".rule-preview-content")?.textContent).toBe(content);
  });
});
