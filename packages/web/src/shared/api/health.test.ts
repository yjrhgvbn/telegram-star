import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { checkServerHealth } from "./health";

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

describe("checkServerHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks same-origin health by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(healthResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkServerHealth("")).resolves.toEqual(healthResponse);

    expect(fetchMock).toHaveBeenCalledWith("/api/health", {
      headers: {
        Accept: "application/json",
      },
    });
  });

  it("normalizes remote server urls before checking health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse(healthResponse));
    vi.stubGlobal("fetch", fetchMock);

    await checkServerHealth("https://example.com/api/");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/api/health", expect.anything());
  });

  it("rejects reachable non-Telegram-Star backends", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse({ ok: true })));

    await expect(checkServerHealth("https://example.com")).rejects.toThrow(
      "不像 Telegram Star 后端",
    );
  });

  it("formats network failures as server connection errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(checkServerHealth("https://example.com")).rejects.toThrow(
      "无法连接到后端 https://example.com",
    );
  });
});
