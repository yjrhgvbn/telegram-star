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
