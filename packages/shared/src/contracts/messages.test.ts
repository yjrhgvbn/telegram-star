import { describe, expect, it } from "vitest";
import {
  messageIdsInputSchema,
  messageListQuerySchema,
  messageListResponseSchema,
} from "./messages";

const message = {
  id: 1,
  telegramMessageId: 1001,
  chatId: "chat-1",
  chatTitle: "Signals",
  senderName: "Alice",
  senderId: "42",
  content: "Project update",
  messageDate: "2026-06-25T00:00:00.000Z",
  telegramLink: "https://t.me/c/1/1001",
  isRead: false,
  matchedFilterId: 1,
  matchedKeyword: "update",
  filterName: "Markets",
  createdAt: "2026-06-25T00:00:01.000Z",
  mediaType: null,
  mediaFileName: null,
  mediaFileSize: null,
  mediaMimeType: null,
  mediaDuration: null,
  mediaThumbBase64: null,
  mediaExtra: null,
};

describe("messages contract", () => {
  it("coerces list query values from HTTP query strings", () => {
    expect(
      messageListQuerySchema.parse({
        cursorId: "12",
        direction: "around",
        autoLocate: "true",
        limit: "40",
        isRead: "false",
        filterId: "3",
        search: " update ",
      }),
    ).toEqual({
      cursorId: 12,
      direction: "around",
      autoLocate: true,
      limit: 40,
      isRead: false,
      filterId: 3,
      search: "update",
    });
  });

  it("accepts a message list response with optional anchor", () => {
    expect(
      messageListResponseSchema.parse({
        data: [message],
        hasOlder: true,
        hasNewer: false,
        anchorId: 1,
      }),
    ).toEqual({
      data: [{ ...message, contentLinks: [] }],
      hasOlder: true,
      hasNewer: false,
      anchorId: 1,
    });
  });

  it("accepts structured Telegram text links", () => {
    const response = messageListResponseSchema.parse({
      data: [
        {
          ...message,
          contentLinks: [{ offset: 8, length: 2, url: "https://example.com/file" }],
        },
      ],
      hasOlder: false,
      hasNewer: false,
    });

    expect(response.data[0]?.contentLinks).toEqual([
      { offset: 8, length: 2, url: "https://example.com/file" },
    ]);
  });

  it("rejects empty batch ids", () => {
    expect(() => messageIdsInputSchema.parse({ ids: [] })).toThrow();
  });
});
