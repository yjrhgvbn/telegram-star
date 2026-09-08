// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { Filter } from "@/types";
import type { UseMessageEventsOptions } from "./useMessageEvents";
import { saveServerUrl } from "@/shared/runtime/serverConfig";

const hookMocks = vi.hoisted(() => ({
  useMessageEvents: vi.fn(),
  useMessagePagination: vi.fn(),
}));

vi.mock("./useMessageEvents", () => ({
  useMessageEvents: hookMocks.useMessageEvents,
}));

vi.mock("./useMessagePagination", () => ({
  useMessagePagination: hookMocks.useMessagePagination,
}));

import { useMessages } from "./useMessages";

describe("useMessages filter activity refresh", () => {
  const loadNewer = vi.fn();
  const markAsReadLocal = vi.fn();
  const removeFromRuleLocal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    hookMocks.useMessagePagination.mockReturnValue({
      messages: [],
      hasOlder: false,
      hasNewer: false,
      loading: false,
      loadingOlder: false,
      loadingNewer: false,
      anchorId: null,
      hasPendingNew: false,
      loadOlder: vi.fn(),
      loadNewer,
      flushPending: vi.fn(),
      setAtBottom: vi.fn(),
      markAsReadLocal,
      setMessageReadState: vi.fn(),
      refresh: vi.fn(),
      removeFromRuleLocal,
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

  it("invalidates group activity after new-message events only", () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useMessages(), {
      wrapper: createQueryWrapper(queryClient),
    });

    const eventHandlers = hookMocks.useMessageEvents.mock.calls[0]?.[0] as UseMessageEventsOptions;

    act(() => eventHandlers.onNewMessage());
    expect(loadNewer).toHaveBeenCalledWith({ announceWhenAwayFromBottom: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.filters.all });

    act(() => eventHandlers.onReadMessages([3, 5]));
    expect(markAsReadLocal).toHaveBeenCalledWith([3, 5]);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it("updates the group follow-up cache after opening Telegram", async () => {
    const queryClient = createTestQueryClient();
    const filter: Filter = {
      id: 3,
      name: "追番",
      conditions: [{ type: "keyword", values: ["更新"] }],
      enabled: true,
      autoLocateUnreadNearRead: true,
      forwardTargetIds: [],
      latestMessageAt: null,
      isFocused: false,
      lastEngagedAt: null,
      lastEngagementType: null,
      lastEngagedMessageId: null,
      manualGroupId: null,
      manualSortOrder: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    queryClient.setQueryData(queryKeys.filters.all, [filter]);
    vi.spyOn(api.messages, "recordEngagement").mockResolvedValue({
      recorded: true,
      filterId: 3,
      lastEngagedAt: "2026-08-22T06:00:00.000Z",
      lastEngagementType: "opened_telegram",
      lastEngagedMessageId: 7,
    });

    const { result } = renderHook(() => useMessages(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => result.current.recordTelegramOpen(7));

    await waitFor(() => {
      expect(queryClient.getQueryData<Filter[]>(queryKeys.filters.all)?.[0]).toMatchObject({
        lastEngagedAt: "2026-08-22T06:00:00.000Z",
        lastEngagementType: "opened_telegram",
        lastEngagedMessageId: 7,
      });
    });
    expect(api.messages.recordEngagement).toHaveBeenCalledWith(7, {
      type: "opened_telegram",
    });
  });

  it("applies only confirmed removal IDs locally without querying the messages again", async () => {
    vi.spyOn(api.messages, "remove").mockResolvedValue({ success: true, count: 1, removedIds: [3] });
    const list = vi.spyOn(api.messages, "list");
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMessages({ filterId: 8 }), { wrapper: createQueryWrapper(queryClient) });
    await act(async () => { await result.current.removeMessages({ filterId: 8, ids: [3, 7] }); });
    expect(removeFromRuleLocal).toHaveBeenCalledWith(8, [3]);
    expect(list).not.toHaveBeenCalled();
    expect(loadNewer).not.toHaveBeenCalled();
    expect(hookMocks.useMessagePagination.mock.results[0].value.refresh).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messages.stats });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.filters.all });
  });

  it("leaves the current list unchanged when removal fails", async () => {
    vi.spyOn(api.messages, "remove").mockRejectedValue(new Error("offline"));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMessages({ filterId: 8 }), { wrapper: createQueryWrapper(queryClient) });
    await act(async () => {
      await expect(result.current.removeMessages({ filterId: 8, ids: [3] })).rejects.toThrow("offline");
    });
    expect(removeFromRuleLocal).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not apply a pending removal after leaving and returning to its rule", async () => {
    let finish!: (value: { success: true; count: number; removedIds: number[] }) => void;
    vi.spyOn(api.messages, "remove").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderHook(({ filterId }) => useMessages({ filterId }), {
      initialProps: { filterId: 8 }, wrapper: createQueryWrapper(queryClient),
    });
    let pending!: ReturnType<typeof result.current.removeMessages>;
    act(() => { pending = result.current.removeMessages({ filterId: 8, ids: [3] }); });
    rerender({ filterId: 9 });
    rerender({ filterId: 8 });
    await act(async () => { finish({ success: true, count: 1, removedIds: [3] }); await pending; });
    expect(removeFromRuleLocal).not.toHaveBeenCalled();
  });

  it("does not apply an old server's removal to the new server", async () => {
    let resolve!: (value: { success: true; count: number; removedIds: number[] }) => void;
    vi.spyOn(api.messages, "remove").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useMessages(), { wrapper: createQueryWrapper(queryClient) });
    let pending!: ReturnType<typeof result.current.removeMessages>;
    act(() => { pending = result.current.removeMessages({ filterId: 8, ids: [3], blockBackfill: false }); });
    saveServerUrl("https://another.example");
    await act(async () => { resolve({ success: true, count: 1, removedIds: [3] }); await pending; });
    expect(removeFromRuleLocal).not.toHaveBeenCalled();
  });

  it("does not apply an old server's completed toggle to the new server", async () => {
    let resolve!: (value: { id: number; isRead: boolean }) => void;
    vi.spyOn(api.messages, "toggleRead").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useMessages(), { wrapper: createQueryWrapper(queryClient) });
    let pending!: Promise<void>;
    act(() => { pending = result.current.toggleRead(7); });
    saveServerUrl("https://another.example");
    await act(async () => { resolve({ id: 7, isRead: true }); await pending; });
    expect(hookMocks.useMessagePagination.mock.results[0].value.setMessageReadState).not.toHaveBeenCalled();
  });
});
