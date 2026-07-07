import { describe, expect, it, vi } from "vitest";
import { checkDesktopServerHealth, getHealthCheckUrl } from "./health";

const healthyPayload = {
  appName: "Telegram Star",
  serverVersion: "1.0.0",
  apiVersion: "2026-07-01",
  minClientVersion: "0.1.0",
  recommendedClientVersion: "0.1.0",
  features: ["sse", "media", "client-device"],
  telegram: {
    configured: true,
    authorized: true,
    connected: true,
  },
};

describe("desktop health check", () => {
  it("builds the health endpoint from a server root", () => {
    expect(getHealthCheckUrl("https://star.example.com/api")).toBe(
      "https://star.example.com/api/health",
    );
  });

  it("parses a healthy server response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(healthyPayload)));

    await expect(checkDesktopServerHealth("https://star.example.com", { fetchImpl })).resolves.toMatchObject({
      appName: "Telegram Star",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://star.example.com/api/health",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
        },
      }),
    );
  });

  it("rejects reachable non Telegram Star responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true })));

    await expect(checkDesktopServerHealth("https://example.com", { fetchImpl })).rejects.toThrow(
      "不像 Telegram Star 后端",
    );
  });

  it("rejects unsupported server urls before requesting", async () => {
    const fetchImpl = vi.fn();

    await expect(checkDesktopServerHealth("star.example.com", { fetchImpl })).rejects.toThrow(
      "http:// 或 https://",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
