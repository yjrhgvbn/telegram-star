import type { AppConfigStatus } from "@telegram-star/shared/contracts/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouteTestApp, parseJson } from "../../test/routeTestUtils.js";
import { configRoutes } from "./config.routes.js";
import * as configService from "./config.service.js";

vi.mock("./config.service.js", () => ({
  getConfigStatus: vi.fn(),
  updateConfig: vi.fn(),
}));

function createConfigStatus(patch: Partial<AppConfigStatus> = {}): AppConfigStatus {
  return {
    telegram: {
      telegramConfigured: true,
      telegramConfigSource: "database",
      databaseConfigured: true,
      apiId: 12345,
      apiHashMasked: "abcd****wxyz",
    },
    media: {
      thumbIndex: 1,
      thumbQuality: "medium",
    },
    ...patch,
  };
}

describe("config routes", () => {
  beforeEach(() => {
    vi.mocked(configService.getConfigStatus).mockReset();
    vi.mocked(configService.updateConfig).mockReset();
  });

  it("returns current config status", async () => {
    const status = createConfigStatus();
    vi.mocked(configService.getConfigStatus).mockResolvedValue(status);
    const app = await createRouteTestApp(configRoutes);

    const response = await app.inject({ method: "GET", url: "/api/config" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(status);
    expect(configService.getConfigStatus).toHaveBeenCalledOnce();
  });

  it("validates and forwards config updates", async () => {
    const status = createConfigStatus({
      media: { thumbIndex: 2, thumbQuality: "high" },
    });
    vi.mocked(configService.updateConfig).mockResolvedValue(status);
    const app = await createRouteTestApp(configRoutes);

    const response = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: {
        telegram: { apiId: "67890", apiHash: "new-hash" },
        media: { thumbIndex: 2 },
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(parseJson(response.payload)).toEqual(status);
    expect(configService.updateConfig).toHaveBeenCalledWith({
      telegram: { apiId: "67890", apiHash: "new-hash" },
      media: { thumbIndex: 2 },
    });
  });

  it("rejects invalid config update payloads before calling service", async () => {
    const app = await createRouteTestApp(configRoutes);

    const response = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { unknown: true },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(parseJson<{ error: string }>(response.payload).error).toContain("Unrecognized key");
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });
});
