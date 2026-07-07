// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { SERVER_CONFIG_STORAGE_KEY } from "@/shared/runtime/serverConfig";
import { createQueryWrapper } from "@/test/queryTestUtils";
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
});
