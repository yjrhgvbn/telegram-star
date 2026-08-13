import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  getQuietRequestKind,
  getStaticCacheControl,
  sanitizeRequestUrl,
} from "./app.js";
import * as healthService from "./modules/health/health.service.js";

vi.mock("./modules/health/health.service.js", () => ({
  getHealthStatus: vi.fn(),
}));

const healthStatus: HealthStatus = {
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

describe("app", () => {
  beforeEach(() => {
    vi.mocked(healthService.getHealthStatus).mockReset();
  });

  it("registers health route and disables API response caching", async () => {
    vi.mocked(healthService.getHealthStatus).mockResolvedValue(healthStatus);
    const app = await createApp({ logger: false, serveStatic: false });
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(response.payload)).toEqual(healthStatus);
  });

  it("uses long-lived cache headers only for hashed asset files", () => {
    expect(getStaticCacheControl("/")).toBe("no-cache");
    expect(getStaticCacheControl("/app/packages/web/dist/index.html")).toBe("no-cache");
    expect(getStaticCacheControl("/app/packages/web/dist/assets/index-abc123.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(getStaticCacheControl("/app/packages/web/dist/favicon.ico")).toBe("no-cache");
  });

  it("classifies noisy request paths and removes query values from logs", () => {
    expect(getQuietRequestKind("/api/clients/device-1/heartbeat")).toBe("client-heartbeat");
    expect(getQuietRequestKind("/api/media/chat-1/42/thumb?quality=2")).toBe("media-thumb");
    expect(getQuietRequestKind("/api/messages/events")).toBe("message-events");
    expect(getQuietRequestKind("/api/messages?search=secret")).toBeNull();
    expect(sanitizeRequestUrl("/api/messages?search=secret&filterId=1")).toBe(
      "/api/messages?<redacted>",
    );
  });
});
