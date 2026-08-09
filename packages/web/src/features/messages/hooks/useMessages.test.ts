// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { UseMessageEventsOptions } from "./useMessageEvents";

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
});
