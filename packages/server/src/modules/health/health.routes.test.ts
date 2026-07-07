import type { HealthStatus } from "@telegram-star/shared/contracts/health";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { healthRoutes } from "./health.routes.js";
import * as healthService from "./health.service.js";

vi.mock("./health.service.js", () => ({
  getHealthStatus: vi.fn(),
}));

function createHealthStatus(patch: Partial<HealthStatus> = {}): HealthStatus {
  return {
    appName: "Telegram Star",
    serverVersion: "1.0.0",
    apiVersion: "2026-07-01",
    minClientVersion: "0.1.0",
    recommendedClientVersion: "0.1.0",
    features: ["sse", "media"],
    telegram: {
      configured: true,
      authorized: false,
      connected: false,
    },
    ...patch,
  };
}

describe("health routes", () => {
  beforeEach(() => {
    vi.mocked(healthService.getHealthStatus).mockReset();
  });

  it("returns the current health status", async () => {
    const status = createHealthStatus();
    vi.mocked(healthService.getHealthStatus).mockResolvedValue(status);
    const app = await createRouteTestApp(healthRoutes);

    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(status);
    expect(healthService.getHealthStatus).toHaveBeenCalledOnce();
  });
});
