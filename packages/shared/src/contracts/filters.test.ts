import { describe, expect, it } from "vitest";
import {
  filterCreateInputSchema,
  filterListSchema,
  filterPreviewInputSchema,
} from "./filters";

describe("filters contract", () => {
  it("accepts a persisted filter response", () => {
    const filters = filterListSchema.parse([
      {
        id: 1,
        name: "BTC",
        conditions: [{ type: "keyword", values: ["BTC"] }],
        enabled: true,
        autoLocateUnreadNearRead: true,
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(filters[0]?.conditions[0]?.values).toEqual(["BTC"]);
  });

  it("rejects empty names and empty condition values", () => {
    expect(() =>
      filterCreateInputSchema.parse({
        name: " ",
        conditions: [{ type: "keyword", values: ["BTC"] }],
      }),
    ).toThrow();

    expect(() =>
      filterCreateInputSchema.parse({
        name: "BTC",
        conditions: [{ type: "keyword", values: [" "] }],
      }),
    ).toThrow();
  });

  it("validates preview input scope", () => {
    expect(
      filterPreviewInputSchema.parse({
        conditions: [{ type: "chat", values: ["1001"] }],
        perChatLimit: 200,
        page: 1,
      }),
    ).toEqual({
      conditions: [{ type: "chat", values: ["1001"] }],
      perChatLimit: 200,
      page: 1,
    });

    expect(() =>
      filterPreviewInputSchema.parse({
        conditions: [{ type: "chat", values: ["1001"] }],
        perChatLimit: 0,
      }),
    ).toThrow();
  });
});
