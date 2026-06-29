// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { useStats } from "./useMessages";

describe("useStats", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads message stats through TanStack Query", async () => {
    vi.spyOn(api.messages, "stats").mockResolvedValue({ total: 10, unread: 3, today: 2 });

    const { result } = renderHook(() => useStats(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.stats).toEqual({ total: 0, unread: 0, today: 0 });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats).toEqual({ total: 10, unread: 3, today: 2 });
  });

  it("invalidates stats query on refresh", async () => {
    vi.spyOn(api.messages, "stats").mockResolvedValue({ total: 10, unread: 3, today: 2 });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStats(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.refresh();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.messages.stats });
  });
});
