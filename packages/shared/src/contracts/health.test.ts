import { describe, expect, it } from "vitest";
import { healthStatusSchema } from "./health";

describe("health contract", () => {
  it("accepts the health status returned by the server", () => {
    const status = healthStatusSchema.parse({
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
    });

    expect(status.features).toEqual(["sse", "media"]);
  });

  it("rejects unsupported feature names", () => {
    expect(() =>
      healthStatusSchema.parse({
        appName: "Telegram Star",
        serverVersion: "1.0.0",
        apiVersion: "2026-07-01",
        minClientVersion: "0.1.0",
        recommendedClientVersion: "0.1.0",
        features: ["unknown"],
        telegram: {
          configured: false,
          authorized: false,
          connected: false,
        },
      }),
    ).toThrow();
  });
});
