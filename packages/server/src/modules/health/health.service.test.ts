import { describe, expect, it } from "vitest";
import { getHealthStatus } from "./health.service.js";
import { readFileSync } from "node:fs";

const packageVersion = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;

describe("health service", () => {
  it("maps Telegram runtime status into the public health payload", async () => {
    const status = await getHealthStatus({
      getTelegramStatus: async () => ({
        connected: true,
        authorized: true,
        waitingForCode: false,
        waitingForPassword: false,
        telegramConfigured: true,
        telegramConfigSource: "database",
        databaseConfigured: true,
        apiId: 12345,
        apiHashMasked: "abcd****wxyz",
      }),
    });

    expect(status).toEqual({
      appName: "Telegram Star",
      serverVersion: packageVersion,
      apiVersion: "2026-07-01",
      minClientVersion: "0.0.1",
      recommendedClientVersion: "0.0.1",
      features: ["sse", "media"],
      telegram: {
        configured: true,
        authorized: true,
        connected: true,
      },
    });
  });
});
