// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import type { AuthStatus } from "@/types";
import { useAuthStatus } from "./useAuthStatus";

function createAuthStatus(patch: Partial<AuthStatus> = {}): AuthStatus {
  return {
    connected: false,
    authorized: false,
    waitingForCode: false,
    waitingForPassword: false,
    telegramConfigured: true,
    telegramConfigSource: "database",
    databaseConfigured: true,
    apiId: 12345,
    apiHashMasked: "ab***cd",
    ...patch,
  };
}

describe("useAuthStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads auth status from the auth query", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(createAuthStatus({ authorized: true, connected: true }));

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(result.current.authStatus.authorized).toBe(true);
    expect(result.current.authStatus.connected).toBe(true);
  });

  it("marks login success optimistically and invalidates auth status", async () => {
    vi.spyOn(api.auth, "status")
      .mockResolvedValueOnce(createAuthStatus())
      .mockResolvedValue(createAuthStatus({ authorized: true, connected: true }));

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.authLoading).toBe(false));

    act(() => {
      result.current.handleLoginSuccess();
    });

    await waitFor(() => expect(result.current.authStatus.authorized).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.auth.status });
  });

  it("resets auth status after logout", async () => {
    vi.spyOn(api.auth, "status").mockResolvedValue(createAuthStatus({ authorized: true, connected: true }));
    const logoutSpy = vi.spyOn(api.auth, "logout").mockResolvedValue({ status: "ok" });

    const { result } = renderHook(() => useAuthStatus(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.authStatus.authorized).toBe(true));

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(logoutSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.authStatus).toMatchObject({
        connected: false,
        authorized: false,
        waitingForCode: false,
        waitingForPassword: false,
      }),
    );
  });
});
