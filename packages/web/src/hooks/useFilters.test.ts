// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { Filter } from "@/types";
import { useFilters } from "./useFilters";

function createFilter(id: number, patch: Partial<Filter> = {}): Filter {
  return {
    id,
    name: `filter-${id}`,
    conditions: [{ type: "keyword", values: [`keyword-${id}`] }],
    enabled: true,
    autoLocateUnreadNearRead: true,
    forwardTargetIds: [],
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
    vi.spyOn(api.filters, "list").mockResolvedValue([createFilter(1)]);
    vi.spyOn(api.chats, "list").mockResolvedValue([{ id: "chat-1", title: "Chat One" }]);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useFilters(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.chatsLoading).toBe(false));

    expect(result.current.filters).toEqual([createFilter(1)]);
    expect(result.current.chats).toEqual([{ id: "chat-1", title: "Chat One" }]);
    expect(queryClient.getQueryData(queryKeys.filters.all)).toEqual([createFilter(1)]);
    expect(queryClient.getQueryData(queryKeys.chats.joined)).toEqual([{ id: "chat-1", title: "Chat One" }]);
  });

  it("updates cached filters after create, update, toggle, and delete mutations", async () => {
    const baseFilter = createFilter(1);
    const createdFilter = createFilter(2, { name: "created" });
    const updatedFilter = createFilter(1, { name: "updated" });
    const disabledFilter = createFilter(2, { name: "created", enabled: false });

    vi.spyOn(api.filters, "list").mockResolvedValue([baseFilter]);
    vi.spyOn(api.chats, "list").mockResolvedValue([]);
    vi.spyOn(api.filters, "create").mockResolvedValue(createdFilter);
    vi.spyOn(api.filters, "update").mockResolvedValue(updatedFilter);
    vi.spyOn(api.filters, "toggle").mockResolvedValue(disabledFilter);
    vi.spyOn(api.filters, "delete").mockResolvedValue({ success: true });

    const queryClient = createTestQueryClient();
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

    await act(async () => {
      await result.current.toggleFilter(2);
    });
    await waitFor(() => expect(result.current.filters).toEqual([disabledFilter, updatedFilter]));

    await act(async () => {
      await result.current.deleteFilter(2);
    });
    await waitFor(() => expect(result.current.filters).toEqual([updatedFilter]));
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
});
