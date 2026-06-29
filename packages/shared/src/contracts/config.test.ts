import { describe, expect, it } from "vitest";
import { appConfigStatusSchema, appConfigUpdateSchema } from "./config";

describe("config contract", () => {
  it("accepts the app config status returned by the server", () => {
    const status = appConfigStatusSchema.parse({
      telegram: {
        telegramConfigured: true,
        telegramConfigSource: "database",
        databaseConfigured: true,
        apiId: 12345,
        apiHashMasked: "abcd****wxyz",
      },
      media: {
        thumbIndex: 2,
        thumbQuality: "high",
      },
    });

    expect(status.media.thumbQuality).toBe("high");
  });

  it("rejects invalid media status values", () => {
    expect(() =>
      appConfigStatusSchema.parse({
        telegram: {
          telegramConfigured: false,
          telegramConfigSource: "missing",
          databaseConfigured: false,
          apiId: null,
          apiHashMasked: null,
        },
        media: {
          thumbIndex: 9,
          thumbQuality: "huge",
        },
      }),
    ).toThrow();
  });

  it("accepts form-like update payloads and rejects unknown keys", () => {
    expect(
      appConfigUpdateSchema.parse({
        telegram: { apiId: "12345", apiHash: "hash" },
        media: { thumbIndex: "1" },
      }),
    ).toEqual({
      telegram: { apiId: "12345", apiHash: "hash" },
      media: { thumbIndex: "1" },
    });

    expect(() => appConfigUpdateSchema.parse({ media: { thumbIndex: 1, extra: true } })).toThrow();
  });
});
