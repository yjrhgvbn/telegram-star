import { describe, expect, it } from "vitest";
import { formatMessageRow, type MessageRow } from "./messageFormatter.js";

function createMessageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 1,
    telegramMessageId: 100,
    chatId: "chat-1",
    chatTitle: "Chat",
    senderName: "Sender",
    senderId: "sender-1",
    content: "hello",
    messageDate: "2026-06-26T00:00:00.000Z",
    telegramLink: "https://t.me/c/1/100",
    isRead: false,
    matchedFilterId: 2,
    matchedKeyword: "hello",
    createdAt: "2026-06-26T00:00:01.000Z",
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
    matchedFilter: { name: "Filter" },
    ...overrides,
  };
}

describe("formatMessageRow", () => {
  it("adds filterName from the related filter", () => {
    const formatted = formatMessageRow(createMessageRow(), new Set());

    expect(formatted.filterName).toBe("Filter");
    expect(formatted.matchedFilterId).toBe(2);
  });

  it("overrides isRead when fallback sync marked the row as read", () => {
    const formatted = formatMessageRow(createMessageRow({ isRead: false }), new Set([1]));

    expect(formatted.isRead).toBe(true);
  });

  it("normalizes optional media and relation fields to null", () => {
    const formatted = formatMessageRow(createMessageRow({ matchedFilter: null }), new Set());

    expect(formatted.filterName).toBeNull();
    expect(formatted.mediaType).toBeNull();
  });
});
