// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { getRuntimeServerUrl, SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { queryKeys } from "@/shared/query/queryKeys";
import { createQueryWrapper, createTestQueryClient } from "@/test/queryTestUtils";
import { useServerConnectionSettings } from "./useServerConnectionSettings";

const healthResponse: HealthStatus = {
  appName: "Telegram Star",
  serverVersion: "1.0.0",
  apiVersion: "2026-07-01",
  minClientVersion: "0.1.0",
  recommendedClientVersion: "0.1.0",
  features: ["sse", "media"],
  telegram: {
    configured: true,
    authorized: true,
    connected: true,
  },
};

function mockJsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((resolveResponse) => {
    resolve = resolveResponse;
  });
  return { promise, resolve };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolveValue) => { resolve = resolveValue; });
  return { promise, resolve };
}

describe("useServerConnectionSettings", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("checks same-origin health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(healthResponse));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await result.current.testConnection();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.health?.appName).toBe("Telegram Star");
    expect(result.current.notice).toBeNull();
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBeNull();
  });

  it("normalizes and saves remote server roots", () => {
    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    act(() => {
      result.current.setServerUrlInput("https://example.com/api/");
    });
    act(() => {
      result.current.saveConnection();
    });

    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://example.com");
    expect(result.current.currentLabel).toBe("https://example.com");
    expect(result.current.dirty).toBe(false);
    expect(result.current.connectionMode).toBe("custom");
  });

  it("clears the server url back to same-origin mode", () => {
    window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, "https://example.com");

    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    act(() => {
      result.current.clearConnection();
    });

    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("");
    expect(result.current.currentLabel).toBe("同源 /api");
    expect(result.current.connectionMode).toBe("same");
  });

  it("shows connection failures for bad server urls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    act(() => {
      result.current.setServerUrlInput("https://bad.example.com");
    });
    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.connectionState).toBe("failed");
    expect(result.current.connectionError).toContain("无法连接到后端 https://bad.example.com");
  });

  it.each(["", "   ", "example.com", "ftp://example.com", "https://example.com?key=value"])(
    "does not test or save invalid custom addresses: %j",
    async (address) => {
      window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, "https://saved.example.com");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() => useServerConnectionSettings(), {
        wrapper: createQueryWrapper(),
      });

      act(() => result.current.setServerUrlInput(address));
      await act(async () => {
        expect(await result.current.testConnection()).toBeNull();
      });
      act(() => expect(result.current.saveConnection()).toBe(false));

      expect(result.current.connectionMode).toBe("custom");
      expect(result.current.inputError).toBeTruthy();
      expect(result.current.notice).toBeNull();
      expect(result.current.dirty).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://saved.example.com");
    },
  );

  it("tracks a blank custom mode as dirty and resets it to the saved mode", () => {
    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    act(() => result.current.setConnectionMode("custom"));
    expect(result.current.serverUrlInput).toBe("");
    expect(result.current.dirty).toBe(true);
    act(() => expect(result.current.saveConnection()).toBe(false));
    act(() => result.current.resetConnectionDraft());

    expect(result.current.connectionMode).toBe("same");
    expect(result.current.dirty).toBe(false);
    expect(result.current.inputError).toBeNull();
    expect(result.current.notice).toBeNull();
  });

  it("switches modes as a draft and uses same-origin only after an explicit save", () => {
    window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, "https://saved.example.com");
    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });

    act(() => result.current.setConnectionMode("same"));
    expect(result.current.serverUrlInput).toBe("https://saved.example.com");
    expect(result.current.dirty).toBe(true);
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("https://saved.example.com");

    act(() => result.current.resetConnectionDraft());
    expect(result.current.connectionMode).toBe("custom");
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setConnectionMode("same"));
    act(() => expect(result.current.saveConnection()).toBe(true));
    expect(window.localStorage.getItem(SERVER_CONFIG_STORAGE_KEY)).toBe("");
    expect(result.current.connectionMode).toBe("same");
    expect(result.current.dirty).toBe(false);
  });

  it("ignores an older test response after a newer address finishes testing", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(),
    });
    let firstTest!: ReturnType<typeof result.current.testConnection>;
    let secondTest!: ReturnType<typeof result.current.testConnection>;

    act(() => result.current.setServerUrlInput("https://first.example.com"));
    act(() => { firstTest = result.current.testConnection(); });
    act(() => result.current.setServerUrlInput("https://second.example.com"));
    expect(result.current.checking).toBe(false);
    act(() => { secondTest = result.current.testConnection(); });

    await act(async () => {
      second.resolve(mockJsonResponse({ ...healthResponse, serverVersion: "2.0.0" }));
      await secondTest;
    });
    await act(async () => {
      first.resolve(mockJsonResponse(healthResponse));
      expect(await firstTest).toBeNull();
    });

    expect(result.current.health?.serverVersion).toBe("2.0.0");
    expect(result.current.connectionState).toBe("connected");
    expect(result.current.notice).toBeNull();
  });

  it.each(["save", "reset", "mode", "edit-back"] as const)(
    "invalidates in-flight checks on %s without reviving stale feedback",
    async (action) => {
      const response = deferredResponse();
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));
      const { result } = renderHook(() => useServerConnectionSettings(), {
        wrapper: createQueryWrapper(),
      });
      let test!: ReturnType<typeof result.current.testConnection>;
      act(() => result.current.setServerUrlInput("https://example.com"));
      act(() => { test = result.current.testConnection(); });
      act(() => {
        if (action === "save") result.current.saveConnection();
        if (action === "reset") result.current.resetConnectionDraft();
        if (action === "mode") result.current.setConnectionMode("same");
        if (action === "edit-back") {
          result.current.setServerUrlInput("https://other.example.com");
          result.current.setServerUrlInput("https://example.com");
        }
      });
      const noticeBeforeResponse = result.current.notice;

      await act(async () => {
        response.resolve(mockJsonResponse(healthResponse));
        expect(await test).toBeNull();
      });

      expect(result.current.connectionState).toBe("unknown");
      expect(result.current.health).toBeNull();
      expect(result.current.connectionError).toBeNull();
      expect(result.current.notice).toBe(noticeBeforeResponse);
    },
  );

  it.each(["save", "clear"] as const)(
    "%s drops previous auth and device data and ignores late responses while reading the new server",
    async (action) => {
      const previousUrl = "https://previous.example.com";
      const nextUrl = action === "save" ? "https://next.example.com" : "";
      window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, previousUrl);
      const queryClient = createTestQueryClient();
      const previousAuth = { authorized: true, server: previousUrl };
      const nextAuth = { authorized: false, server: nextUrl };
      const previousDevices = [{ id: "old-device", server: previousUrl }];
      const nextDevices = [{ id: "new-device", server: nextUrl }];
      const oldAuthResponse = deferred<typeof previousAuth>();
      const newAuthResponse = deferred<typeof nextAuth>();
      const oldDevicesResponse = deferred<typeof previousDevices>();
      const newDevicesResponse = deferred<typeof nextDevices>();
      const requestedAuthServers: string[] = [];
      const requestedDeviceServers: string[] = [];
      queryClient.setQueryData(queryKeys.auth.status, previousAuth);
      queryClient.setQueryData(queryKeys.clients.all, previousDevices);

      const { result } = renderHook(() => {
        const connection = useServerConnectionSettings();
        useQuery({
          queryKey: queryKeys.auth.status,
          staleTime: 0,
          queryFn: () => {
            const server = getRuntimeServerUrl();
            requestedAuthServers.push(server);
            return server === previousUrl ? oldAuthResponse.promise : newAuthResponse.promise;
          },
        });
        useQuery({
          queryKey: queryKeys.clients.all,
          staleTime: 0,
          queryFn: () => {
            const server = getRuntimeServerUrl();
            requestedDeviceServers.push(server);
            return server === previousUrl ? oldDevicesResponse.promise : newDevicesResponse.promise;
          },
        });
        return connection;
      }, { wrapper: createQueryWrapper(queryClient) });

      act(() => result.current.setServerUrlInput(nextUrl));
      act(() => {
        if (action === "save") expect(result.current.saveConnection()).toBe(true);
        else result.current.clearConnection();
        // The save API is synchronous: old records must already be unavailable here.
        expect(queryClient.getQueryData(queryKeys.auth.status)).toBeUndefined();
        expect(queryClient.getQueryData(queryKeys.clients.all)).toBeUndefined();
      });
      expect(requestedAuthServers).toEqual([previousUrl, nextUrl]);
      expect(requestedDeviceServers).toEqual([previousUrl, nextUrl]);

      await act(async () => {
        oldAuthResponse.resolve(previousAuth);
        oldDevicesResponse.resolve(previousDevices);
        await Promise.all([oldAuthResponse.promise, oldDevicesResponse.promise]);
      });
      expect(queryClient.getQueryData(queryKeys.auth.status)).toBeUndefined();
      expect(queryClient.getQueryData(queryKeys.clients.all)).toBeUndefined();

      await act(async () => {
        newAuthResponse.resolve(nextAuth);
        newDevicesResponse.resolve(nextDevices);
      });
      await waitFor(() => {
        expect(queryClient.getQueryData(queryKeys.auth.status)).toEqual(nextAuth);
        expect(queryClient.getQueryData(queryKeys.clients.all)).toEqual(nextDevices);
      });
    },
  );

  it("does not refetch the previous server's scoped config key with the newly saved address", async () => {
    const previousUrl = "https://previous.example.com";
    window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, previousUrl);
    const queryClient = createTestQueryClient();
    const configKey = [...queryKeys.config.status, previousUrl];
    const nextUrl = "https://next.example.com";
    const configQuery = vi.fn(async (server: string) => ({ server }));
    queryClient.setQueryData(configKey, { server: previousUrl });
    const { result } = renderHook(() => {
      const connection = useServerConnectionSettings();
      useQuery({
        queryKey: [...queryKeys.config.status, getRuntimeServerUrl()],
        queryFn: () => configQuery(getRuntimeServerUrl()),
      });
      return connection;
    }, { wrapper: createQueryWrapper(queryClient) });

    act(() => result.current.setServerUrlInput(nextUrl));
    act(() => {
      expect(result.current.saveConnection()).toBe(true);
      expect(queryClient.getQueryData(configKey)).toBeUndefined();
      expect(configQuery).not.toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(queryClient.getQueryData([...queryKeys.config.status, nextUrl])).toEqual({ server: nextUrl });
    });
    expect(queryClient.getQueryData(configKey)).toBeUndefined();
    expect(configQuery).toHaveBeenCalledExactlyOnceWith(nextUrl);
  });

  it("keeps live query results when saving the unchanged address", () => {
    window.localStorage.setItem(SERVER_CONFIG_STORAGE_KEY, "https://example.com");
    const queryClient = createTestQueryClient();
    const auth = { authorized: true };
    const devices = [{ id: "current-device" }];
    queryClient.setQueryData(queryKeys.auth.status, auth);
    queryClient.setQueryData(queryKeys.clients.all, devices);
    const { result } = renderHook(() => useServerConnectionSettings(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => expect(result.current.saveConnection()).toBe(true));
    expect(queryClient.getQueryData(queryKeys.auth.status)).toBe(auth);
    expect(queryClient.getQueryData(queryKeys.clients.all)).toBe(devices);
  });

  it("keeps old auth data cleared when the new server cannot be read", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.auth.status, { authorized: true });
    const { result } = renderHook(() => {
      const connection = useServerConnectionSettings();
      useQuery({
        queryKey: queryKeys.auth.status,
        queryFn: async () => { throw new Error("New server is offline"); },
      });
      return connection;
    }, { wrapper: createQueryWrapper(queryClient) });

    act(() => result.current.setServerUrlInput("https://offline.example.com"));
    act(() => expect(result.current.saveConnection()).toBe(true));
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.auth.status)?.status).toBe("error"));
    expect(queryClient.getQueryData(queryKeys.auth.status)).toBeUndefined();
    expect(result.current.currentServerUrl).toBe("https://offline.example.com");
  });
});
