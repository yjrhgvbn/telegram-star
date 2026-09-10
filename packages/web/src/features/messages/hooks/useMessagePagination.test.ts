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
    senderUserId: null,
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

  it("restores an around-window once and ignores the saved position on refresh", async () => {
    const list = vi.spyOn(api.messages, "list").mockResolvedValue({
      data: [createMessage(7), createMessage(8)], hasOlder: true, hasNewer: true,
    });
    const { result, rerender } = renderHook(({ anchor }) => useMessagePagination({
      filterId: 8, autoLocateEnabled: true, restoreAnchorId: anchor,
    }), { initialProps: { anchor: 7 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledWith({ limit: 20, filterId: 8, cursorId: 7, direction: "around" });
    expect(result.current.restoredAnchorId).toBe(7);
    rerender({ anchor: 8 });
    expect(list).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenLastCalledWith({ limit: 20, filterId: 8, autoLocate: true });
    expect(result.current.restoredAnchorId).toBeNull();
  });

  it("falls back to the configured initial window when a saved message was deleted", async () => {
    const list = vi.spyOn(api.messages, "list")
      .mockRejectedValueOnce(new Error("Cursor message not found: 7"))
      .mockResolvedValueOnce({ data: [createMessage(8)], hasOlder: false, hasNewer: false, anchorId: 8 });
    const { result } = renderHook(() => useMessagePagination({ filterId: 8, autoLocateEnabled: true, restoreAnchorId: 7 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.anchorId).toBe(8);
    expect(result.current.restoredAnchorId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("never appends a previous group's pending page after switching groups", async () => {
    let resolveOldPage!: (value: Awaited<ReturnType<typeof api.messages.list>>) => void;
    vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({ data: [createMessage(3)], hasOlder: true, hasNewer: false })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOldPage = resolve; }))
      .mockResolvedValueOnce({ data: [createMessage(9)], hasOlder: false, hasNewer: false });
    const { result, rerender } = renderHook(({ filterId }) => useMessagePagination({ filterId }), {
      initialProps: { filterId: 8 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.loadOlder(); });
    rerender({ filterId: 9 });
    await waitFor(() => expect(result.current.messages[0]?.id).toBe(9));
    await act(async () => resolveOldPage({ data: [createMessage(1)], hasOlder: false, hasNewer: false }));
    expect(result.current.messages.map((message) => message.id)).toEqual([9]);
  });

  it("defers SSE paging until the initial window provides its cursor", async () => {
    let resolveInitial!: (value: Awaited<ReturnType<typeof api.messages.list>>) => void;
    const list = vi.spyOn(api.messages, "list")
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce({ data: [createMessage(4)], hasOlder: true, hasNewer: false });
    const { result } = renderHook(() => useMessagePagination({ filterId: 8 }));
    act(() => { result.current.loadNewer({ announceWhenAwayFromBottom: true }); });
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => resolveInitial({ data: [createMessage(3)], hasOlder: false, hasNewer: false }));
    await waitFor(() => expect(result.current.messages.map((message) => message.id)).toEqual([3, 4]));
    expect(list).toHaveBeenLastCalledWith({ limit: 20, filterId: 8, cursorId: 3, direction: "after" });
  });

  it("keeps locally completed rows until refresh and exposes retryable errors", async () => {
    const list = vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({ data: [createMessage(3)], hasOlder: false, hasNewer: false })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: [], hasOlder: false, hasNewer: false });
    const { result } = renderHook(() => useMessagePagination({ filterId: 8, isRead: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setMessageReadState(3, true));
    expect(result.current.messages[0]?.isRead).toBe(true);
    expect(list).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe("offline"));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("does not request while the mobile group list is shown", async () => {
    const list = vi.spyOn(api.messages, "list").mockResolvedValue({ data: [], hasOlder: false, hasNewer: false });
    const { result, rerender } = renderHook(({ enabled }) => useMessagePagination({ enabled }), {
      initialProps: { enabled: false },
    });
    act(() => { result.current.loadNewer({ announceWhenAwayFromBottom: true }); });
    expect(list).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("removes only the requested rule locally without reloading messages", async () => {
    const shared = { ...createMessage(3), filterMatches: [
      { filterId: 8, filterName: "A", matchedKeyword: null },
      { filterId: 9, filterName: "B", matchedKeyword: "b" },
    ] };
    const list = vi.spyOn(api.messages, "list").mockResolvedValue({
      data: [createMessage(2), shared], hasOlder: true, hasNewer: true,
    });
    const { result } = renderHook(() => useMessagePagination({ filterId: 8 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.removeFromRuleLocal(8, [3]));
    expect(result.current.messages.map((message) => message.id)).toEqual([2]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("preserves other rules in all messages and discards a pending stale page", async () => {
    let finishPage!: (value: Awaited<ReturnType<typeof api.messages.list>>) => void;
    const shared = { ...createMessage(3), filterMatches: [
      { filterId: 8, filterName: "A", matchedKeyword: null },
      { filterId: 9, filterName: "B", matchedKeyword: "b" },
    ] };
    const list = vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({ data: [createMessage(2), shared], hasOlder: true, hasNewer: false })
      .mockImplementationOnce(() => new Promise((resolve) => { finishPage = resolve; }));
    const { result } = renderHook(() => useMessagePagination());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.loadOlder(); });
    act(() => result.current.removeFromRuleLocal(8, [2, 3]));
    expect(result.current.messages).toEqual([{
      ...shared, matchedFilterId: 9, filterName: "B", matchedKeyword: "b", filterMatches: [shared.filterMatches[1]],
    }]);
    await act(async () => finishPage({ data: [createMessage(1), createMessage(2), shared], hasOlder: false, hasNewer: false }));
    expect(result.current.messages.map((message) => message.id)).toEqual([3]);
    expect(result.current.messages[0].filterMatches).toEqual([shared.filterMatches[1]]);
    expect(result.current.loadingOlder).toBe(false);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("leaves an emptied window until the user refreshes", async () => {
    const list = vi.spyOn(api.messages, "list")
      .mockResolvedValueOnce({ data: [createMessage(3)], hasOlder: true, hasNewer: true })
      .mockResolvedValueOnce({ data: [createMessage(4)], hasOlder: false, hasNewer: false });
    const { result } = renderHook(() => useMessagePagination({ filterId: 8 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.removeFromRuleLocal(8, [3]));
    expect(result.current.messages).toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.messages.map((message) => message.id)).toEqual([4]));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
