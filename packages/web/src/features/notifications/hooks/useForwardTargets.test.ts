// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { ForwardTarget } from "@/types";
import { NEW_FORWARD_TARGET_ID, type ForwardTargetDraft } from "../types";
import { useForwardTargets } from "./useForwardTargets";

function createTarget(id: number, patch: Partial<ForwardTarget> = {}): ForwardTarget {
  return {
    id,
    name: `target-${id}`,
    appriseUrl: `test://${id}`,
    enabled: true,
    filterIds: [id],
    createdAt: `2026-06-29T00:00:0${id}.000Z`,
    updatedAt: `2026-06-29T00:00:0${id}.000Z`,
    ...patch,
  };
}

describe("useForwardTargets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads targets and derives selection and counters", async () => {
    const targets = [
      createTarget(1, { filterIds: [1, 2] }),
      createTarget(2, { enabled: false, filterIds: [2] }),
    ];
    vi.spyOn(api.forwardTargets, "list").mockResolvedValue(targets);

    const { result } = renderHook(() => useForwardTargets(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.selectedTargetId).toBe("1"));

    expect(result.current.targets).toEqual(targets);
    expect(result.current.enabledTargets).toBe(1);
    expect(result.current.subscribedRules).toBe(2);
    expect(result.current.selectedTarget).toEqual(targets[0]);
  });

  it("keeps only one draft target while adding repeatedly", async () => {
    vi.spyOn(api.forwardTargets, "list").mockResolvedValue([]);

    const { result } = renderHook(() => useForwardTargets(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addTarget();
      result.current.addTarget();
    });

    expect(result.current.visibleTargets).toHaveLength(1);
    expect(result.current.selectedTargetId).toBe(NEW_FORWARD_TARGET_ID);
    expect(result.current.selectedTarget?.id).toBe(0);
  });

  it("updates target cache after create, update, and delete mutations", async () => {
    const target = createTarget(1);
    const created = createTarget(2, { name: "created" });
    const updated = createTarget(1, { name: "updated" });

    vi.spyOn(api.forwardTargets, "list").mockResolvedValue([target]);
    vi.spyOn(api.forwardTargets, "create").mockResolvedValue(created);
    vi.spyOn(api.forwardTargets, "update").mockResolvedValue(updated);
    vi.spyOn(api.forwardTargets, "delete").mockResolvedValue({ success: true });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useForwardTargets(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.targets).toEqual([target]));

    const draft: ForwardTargetDraft = {
      id: 0,
      name: "created",
      appriseUrl: "test://created",
      enabled: true,
      filterIds: [2],
    };

    await act(async () => {
      await result.current.saveTarget(draft, {
        name: draft.name,
        appriseUrl: draft.appriseUrl,
        enabled: draft.enabled,
        filterIds: draft.filterIds,
      });
    });
    expect(queryClient.getQueryData(queryKeys.forwardTargets.all)).toEqual([created, target]);

    await act(async () => {
      await result.current.saveTarget(target, {
        name: "updated",
        appriseUrl: target.appriseUrl,
        enabled: target.enabled,
        filterIds: target.filterIds,
      });
    });
    expect(queryClient.getQueryData(queryKeys.forwardTargets.all)).toEqual([created, updated]);

    await act(async () => {
      await result.current.deleteTarget(created);
    });
    expect(queryClient.getQueryData(queryKeys.forwardTargets.all)).toEqual([updated]);
  });
});
