// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { FilterGroup } from "@/types";
import { useFilterGroups } from "./useFilterGroups";

function createGroup(id: number, patch: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id,
    name: `group-${id}`,
    sortOrder: id - 1,
    filterCount: 0,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    ...patch,
  };
}

describe("useFilterGroups", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps CRUD and order mutations in query cache", async () => {
    const initialLayout = {
      ungroupedPosition: 2,
    };
    const first = createGroup(1);
    const second = createGroup(2);
    const created = createGroup(3, { name: "本季在追", sortOrder: 2 });
    const renamed = createGroup(3, { name: "长期更新", sortOrder: 2 });
    vi.spyOn(api.filterGroups, "list").mockResolvedValue([first, second]);
    vi.spyOn(api.filterGroups, "layout").mockResolvedValue(initialLayout);
    vi.spyOn(api.filterGroups, "create").mockResolvedValue(created);
    vi.spyOn(api.filterGroups, "update").mockResolvedValue(renamed);
    vi.spyOn(api.filterGroups, "reorder").mockResolvedValue({ success: true });
    vi.spyOn(api.filterGroups, "delete").mockResolvedValue({ success: true });
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useFilterGroups(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.groups).toEqual([first, second]));

    await act(async () => {
      await result.current.createGroup("本季在追");
    });
    await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual([1, 2, 3]));
    await act(async () => {
      await result.current.renameGroup(3, "长期更新");
    });
    await waitFor(() => expect(result.current.groups[2]?.name).toBe("长期更新"));
    await act(async () => {
      await result.current.reorderGroups({ ids: [3, 1, 2], ungroupedPosition: 1 });
    });
    await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual([3, 1, 2]));
    expect(result.current.ungroupedPosition).toBe(1);

    await act(async () => {
      await result.current.deleteGroup(3);
    });
    await waitFor(() => expect(result.current.groups.map((group) => group.id)).toEqual([1, 2]));
  });
});
