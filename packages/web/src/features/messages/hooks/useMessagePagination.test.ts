// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import type { Message } from "@/types";
import { useMessagePagination } from "./useMessagePagination";

function createMessage(id: number): Message {
  return {
    id,
    telegramMessageId: id,
    chatId: "chat",
    chatTitle: "Chat",
    senderName: "Sender",
    senderId: "sender",
    content: `message-${id}`,
    contentLinks: [],
    messageDate: `2026-06-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    telegramLink: "",
    isRead: false,
    matchedFilterId: 8,
    matchedKeyword: null,
    filterName: "Filter",
    createdAt: `2026-06-${String(id).padStart(2, "0")}T00:00:00.000Z`,
    mediaType: null,
    mediaFileName: null,
    mediaFileSize: null,
    mediaMimeType: null,
    mediaDuration: null,
    mediaThumbBase64: null,
    mediaExtra: null,
  };
}

describe("useMessagePagination", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("merges a newer page even when prefetch starts before the exact bottom", async () => {
    const listSpy = vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({
        data: [createMessage(1), createMessage(2)],
        hasOlder: true,
        hasNewer: true,
        anchorId: 1,
      })
      .mockResolvedValueOnce({
        data: [createMessage(3), createMessage(4)],
        hasOlder: true,
        hasNewer: false,
      });

    const { result } = renderHook(() => useMessagePagination({ filterId: 8 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setAtBottom(false);
      result.current.loadNewer();
    });

    await waitFor(() => {
      expect(result.current.messages.map((message) => message.id)).toEqual([1, 2, 3, 4]);
    });
    expect(result.current.hasNewer).toBe(false);
    expect(result.current.hasPendingNew).toBe(false);
    expect(listSpy).toHaveBeenLastCalledWith({
      filterId: 8,
      limit: 20,
      cursorId: 2,
      direction: "after",
    });
  });

  it("appends SSE results and only shows the pending hint away from the bottom", async () => {
    vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({
        data: [createMessage(1)],
        hasOlder: false,
        hasNewer: true,
      })
      .mockResolvedValueOnce({
        data: [createMessage(2)],
        hasOlder: true,
        hasNewer: false,
      });

    const { result } = renderHook(() => useMessagePagination());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setAtBottom(false);
      result.current.loadNewer({ announceWhenAwayFromBottom: true });
    });

    await waitFor(() => expect(result.current.hasPendingNew).toBe(true));
    expect(result.current.messages.map((message) => message.id)).toEqual([1, 2]);

    act(() => result.current.setAtBottom(true));
    expect(result.current.hasPendingNew).toBe(false);
  });
});
