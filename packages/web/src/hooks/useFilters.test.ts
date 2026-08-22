// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { Filter } from "@/types";
import { moveFilterInManualOrder, useFilters } from "./useFilters";

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `filter-${id}`,
    systemKey: null,
    conditions: [{ type: "keyword", values: [`keyword-${id}`] }],
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
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    updatedAt: `2026-06-29T00:00:0${id}.000Z`,
    ...patch,
  };
}

describe("useFilters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads filters and joined chats through query cache", async () => {
    const allMessages = createFilter(9, {
      name: "全部消息",
      systemKey: "all_messages",
      conditions: [],
      enabled: false,
    });
    vi.spyOn(api.filters, "list").mockResolvedValue([allMessages, createFilter(1)]);
    vi.spyOn(api.chats, "list").mockResolvedValue([{ id: "chat-1", title: "Chat One" }]);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useFilters(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.chatsLoading).toBe(false));

    expect(result.current.filters).toEqual([createFilter(1)]);
    expect(result.current.messageGroups).toEqual([allMessages, createFilter(1)]);
    expect(result.current.chats).toEqual([{ id: "chat-1", title: "Chat One" }]);
    expect(queryClient.getQueryData(queryKeys.filters.all)).toEqual([allMessages, createFilter(1)]);
    expect(queryClient.getQueryData(queryKeys.chats.joined)).toEqual([{ id: "chat-1", title: "Chat One" }]);
  });

  it("updates cached filters after create, update, toggle, focus, and delete mutations", async () => {
    const baseFilter = createFilter(1);
    const createdFilter = createFilter(2, { name: "created" });
    const updatedFilter = createFilter(1, { name: "updated" });
    const disabledFilter = createFilter(2, { name: "created", enabled: false });
    const focusedFilter = createFilter(1, { name: "updated", isFocused: true });

    vi.spyOn(api.filters, "list").mockResolvedValue([baseFilter]);
    vi.spyOn(api.chats, "list").mockResolvedValue([]);
    vi.spyOn(api.filters, "create").mockResolvedValue(createdFilter);
    vi.spyOn(api.filters, "update").mockResolvedValue(updatedFilter);
    vi.spyOn(api.filters, "toggle").mockResolvedValue(disabledFilter);
    vi.spyOn(api.filters, "setFocused").mockResolvedValue(focusedFilter);
    vi.spyOn(api.filters, "delete").mockResolvedValue({ success: true });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useFilters(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.filters).toEqual([baseFilter]));

    await act(async () => {
      await result.current.createFilter({
        name: "created",
        conditions: [{ type: "keyword", values: ["created"] }],
      });
    });
    await waitFor(() => expect(result.current.filters).toEqual([createdFilter, baseFilter]));

    await act(async () => {
      await result.current.updateFilter(1, { name: "updated" });
    });
    await waitFor(() => expect(result.current.filters).toEqual([createdFilter, updatedFilter]));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.messages.stats });

    await act(async () => {
      await result.current.toggleFilter(2);
    });
    await waitFor(() => expect(result.current.filters).toEqual([disabledFilter, updatedFilter]));

    await act(async () => {
      await result.current.setFilterFocused(1, true);
    });
    await waitFor(() => expect(result.current.filters).toEqual([disabledFilter, focusedFilter]));
    expect(api.filters.setFocused).toHaveBeenCalledWith(1, { isFocused: true });

    await act(async () => {
      await result.current.deleteFilter(2);
    });
    await waitFor(() => expect(result.current.filters).toEqual([focusedFilter]));
  });

  it("invalidates filter and chat queries when refresh handlers run", async () => {
    vi.spyOn(api.filters, "list").mockResolvedValue([]);
    vi.spyOn(api.chats, "list").mockResolvedValue([]);

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useFilters(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.refresh();
      result.current.refreshChats();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.filters.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.chats.joined });
  });

  it("updates cached placement and manual order", async () => {
    const first = createFilter(1, { manualSortOrder: 0 });
    const second = createFilter(2, { manualSortOrder: 1 });
    const moved = createFilter(1, { manualGroupId: 3, manualSortOrder: 0 });
    vi.spyOn(api.filters, "list").mockResolvedValue([first, second]);
    vi.spyOn(api.chats, "list").mockResolvedValue([]);
    vi.spyOn(api.filters, "setPlacement").mockResolvedValue(moved);
    vi.spyOn(api.filters, "reorderManual").mockResolvedValue({ success: true });
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useFilters(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.filters).toEqual([first, second]));

    await act(async () => {
      await result.current.setFilterPlacement(1, 3);
    });
    await waitFor(() => expect(result.current.filters[0]).toEqual(moved));
    expect(api.filters.setPlacement).toHaveBeenCalledWith(1, { manualGroupId: 3 });

    await act(async () => {
      await result.current.reorderManualFilters({ manualGroupId: null, filterIds: [2, 1] });
    });
    expect(api.filters.reorderManual).toHaveBeenCalledWith({
      manualGroupId: null,
      filterIds: [2, 1],
    });
    await waitFor(() => {
      expect(result.current.filters.find((filter) => filter.id === 2)?.manualSortOrder).toBe(0);
      expect(result.current.filters.find((filter) => filter.id === 1)?.manualSortOrder).toBe(1);
    });
  });

  it("reindexes both sides of a cross-group move", () => {
    const filters = [
      createFilter(1, { manualGroupId: 1, manualSortOrder: 0 }),
      createFilter(2, { manualGroupId: 1, manualSortOrder: 1 }),
      createFilter(3, { manualGroupId: 2, manualSortOrder: 0 }),
      createFilter(4, { manualGroupId: 2, manualSortOrder: 1 }),
    ];

    const moved = moveFilterInManualOrder(
      filters,
      2,
      2,
      1,
    );

    expect(
      moved
        .filter((filter) => filter.manualGroupId === 1)
        .sort((left, right) => left.manualSortOrder - right.manualSortOrder)
        .map((filter) => filter.id),
    ).toEqual([1]);
    expect(
      moved
        .filter((filter) => filter.manualGroupId === 2)
        .sort((left, right) => left.manualSortOrder - right.manualSortOrder)
        .map((filter) => filter.id),
    ).toEqual([3, 2, 4]);
  });

});
