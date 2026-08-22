import type {
  Message,
  ReadSyncLogsResponse,
} from "@telegram-star/shared/contracts/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { messageRoutes } from "./messages.routes.js";
import * as messageEventStream from "./messageEventStream.js";
import * as messagesService from "./messages.service.js";

vi.mock("./messageEventStream.js", () => ({
  openMessageEventStream: vi.fn((_request, reply) => reply.send({ ok: true })),
}));

vi.mock("./messages.service.js", () => {
  class CursorMessageNotFoundError extends Error {
    constructor(cursorId: number) {
      super(`Cursor message not found: ${cursorId}`);
      this.name = "CursorMessageNotFoundError";
    }
  }

  class MessageNotFoundError extends Error {
    constructor(messageId: number) {
      super(`Message not found: ${messageId}`);
      this.name = "MessageNotFoundError";
    }
  }

  return {
    CursorMessageNotFoundError,
    MessageNotFoundError,
    forceSyncMessageRead: vi.fn(),
    getMessageStats: vi.fn(),
    listMessageReadSyncLogs: vi.fn(),
    listMessages: vi.fn(),
    markMessagesAsRead: vi.fn(),
    recordMessageEngagement: vi.fn(),
    toggleMessageRead: vi.fn(),
  };
});

function createMessage(id: number, patch: Partial<Message> = {}): Message {
  return {
    id,
    telegramMessageId: 1000 + id,
    chatId: "chat-1",
    chatTitle: "Chat",
    senderName: "Sender",
    senderId: "sender-1",
    content: `message-${id}`,
    contentLinks: [],
    messageDate: `2026-06-29T00:00:0${id}.000Z`,
    telegramLink: `https://t.me/c/1/${1000 + id}`,
    isRead: false,
    matchedFilterId: null,
    matchedKeyword: null,
    filterName: null,
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
    ...patch,
  };
}

describe("message routes", () => {
  beforeEach(() => {
    vi.mocked(messageEventStream.openMessageEventStream).mockClear();
    vi.mocked(messagesService.forceSyncMessageRead).mockReset();
    vi.mocked(messagesService.getMessageStats).mockReset();
    vi.mocked(messagesService.listMessageReadSyncLogs).mockReset();
    vi.mocked(messagesService.listMessages).mockReset();
    vi.mocked(messagesService.markMessagesAsRead).mockReset();
    vi.mocked(messagesService.recordMessageEngagement).mockReset();
    vi.mocked(messagesService.toggleMessageRead).mockReset();
  });

  it("parses message list query params and returns message list response", async () => {
    const responseBody = {
      data: [createMessage(1)],
      hasOlder: true,
      hasNewer: false,
      anchorId: 1,
    };
    vi.mocked(messagesService.listMessages).mockResolvedValue(responseBody);
    const app = await createRouteTestApp(messageRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/messages?limit=5&isRead=false&filterId=2&search=night&autoLocate=true",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(responseBody);
    expect(messagesService.listMessages).toHaveBeenCalledWith(
      {
        limit: 5,
        isRead: false,
        filterId: 2,
        search: "night",
        autoLocate: true,
      },
      expect.any(Object),
    );
  });

  it("returns 400 for invalid message list query", async () => {
    const app = await createRouteTestApp(messageRoutes);

    const response = await app.inject({ method: "GET", url: "/api/messages?limit=101" });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(messagesService.listMessages).not.toHaveBeenCalled();
  });

  it("maps cursor and message not-found errors to 404", async () => {
    vi.mocked(messagesService.listMessages).mockRejectedValue(
      new messagesService.CursorMessageNotFoundError(99),
    );
    vi.mocked(messagesService.toggleMessageRead).mockRejectedValue(
      new messagesService.MessageNotFoundError(88),
    );
    const app = await createRouteTestApp(messageRoutes);

    const cursorResponse = await app.inject({
      method: "GET",
      url: "/api/messages?cursorId=99",
    });
    const readResponse = await app.inject({ method: "PATCH", url: "/api/messages/88/read" });
    await app.close();

    expect(cursorResponse.statusCode).toBe(404);
    expect(parseJson(cursorResponse.payload)).toEqual({ error: "Cursor message not found" });
    expect(readResponse.statusCode).toBe(404);
    expect(parseJson(readResponse.payload)).toEqual({ error: "Message not found" });
  });

  it("validates read mutations and forwards ids to services", async () => {
    vi.mocked(messagesService.toggleMessageRead).mockResolvedValue({ id: 7, isRead: true });
    vi.mocked(messagesService.markMessagesAsRead).mockResolvedValue({ success: true, count: 2 });
    vi.mocked(messagesService.forceSyncMessageRead).mockResolvedValue({ markedIds: [1, 2] });
    const app = await createRouteTestApp(messageRoutes);

    const toggleResponse = await app.inject({ method: "PATCH", url: "/api/messages/7/read" });
    const batchResponse = await app.inject({
      method: "PATCH",
      url: "/api/messages/batch-read",
      payload: { ids: [1, 2] },
    });
    const forceSyncResponse = await app.inject({
      method: "POST",
      url: "/api/messages/force-sync-read",
      payload: { ids: [1, 2] },
    });
    const invalidBatchResponse = await app.inject({
      method: "PATCH",
      url: "/api/messages/batch-read",
      payload: { ids: [] },
    });
    await app.close();

    expect(toggleResponse.statusCode).toBe(200);
    expect(parseJson(toggleResponse.payload)).toEqual({ id: 7, isRead: true });
    expect(batchResponse.statusCode).toBe(200);
    expect(forceSyncResponse.statusCode).toBe(200);
    expect(invalidBatchResponse.statusCode).toBe(400);
    expect(messagesService.toggleMessageRead).toHaveBeenCalledWith(7, expect.any(Object));
    expect(messagesService.markMessagesAsRead).toHaveBeenCalledWith([1, 2], expect.any(Object));
    expect(messagesService.forceSyncMessageRead).toHaveBeenCalledWith([1, 2]);
  });

  it("records Telegram opens for the message group", async () => {
    const engagement = {
      recorded: true,
      filterId: 3,
      lastEngagedAt: "2026-08-22T06:00:00.000Z",
      lastEngagementType: "opened_telegram" as const,
      lastEngagedMessageId: 7,
    };
    vi.mocked(messagesService.recordMessageEngagement).mockResolvedValue(engagement);
    const app = await createRouteTestApp(messageRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/messages/7/engagement",
      payload: { type: "opened_telegram" },
    });
    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/messages/7/engagement",
      payload: { type: "viewed_group" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(engagement);
    expect(invalidResponse.statusCode).toBe(400);
    expect(messagesService.recordMessageEngagement).toHaveBeenCalledOnce();
    expect(messagesService.recordMessageEngagement).toHaveBeenCalledWith(7, {
      type: "opened_telegram",
    });
  });

  it("returns stats, read sync logs, and opens event stream route", async () => {
    const logs: ReadSyncLogsResponse = {
      data: [
        {
          id: 1,
          level: "info",
          source: "manual",
          action: "read",
          message: "ok",
          chatId: null,
          telegramMessageId: null,
          rowId: 1,
          details: null,
          createdAt: "2026-06-29T00:00:00.000Z",
        },
      ],
    };
    vi.mocked(messagesService.getMessageStats).mockResolvedValue({ total: 10, unread: 2, today: 1 });
    vi.mocked(messagesService.listMessageReadSyncLogs).mockResolvedValue(logs);
    const app = await createRouteTestApp(messageRoutes);

    const statsResponse = await app.inject({ method: "GET", url: "/api/messages/stats" });
    const logsResponse = await app.inject({ method: "GET", url: "/api/messages/read-sync-logs?limit=5" });
    const eventsResponse = await app.inject({ method: "GET", url: "/api/messages/events" });
    await app.close();

    expect(statsResponse.statusCode).toBe(200);
    expect(parseJson(statsResponse.payload)).toEqual({ total: 10, unread: 2, today: 1 });
    expect(logsResponse.statusCode).toBe(200);
    expect(parseJson(logsResponse.payload)).toEqual(logs);
    expect(messagesService.listMessageReadSyncLogs).toHaveBeenCalledWith(5);
    expect(eventsResponse.statusCode).toBe(200);
    expect(parseJson(eventsResponse.payload)).toEqual({ ok: true });
    expect(messageEventStream.openMessageEventStream).toHaveBeenCalledOnce();
  });
});
