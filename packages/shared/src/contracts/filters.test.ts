import { describe, expect, it } from "vitest";
import {
  filterCreateInputSchema,
  filterListSchema,
  filterPreviewInputSchema,
  filterUpdateInputSchema,
} from "./filters";

describe("filters contract", () => {
  it("accepts a persisted filter response", () => {
    const filters = filterListSchema.parse([
      {
        id: 1,
        name: "项目更新",
        conditions: [{ type: "keyword", values: ["更新"] }],
        enabled: true,
        autoLocateUnreadNearRead: true,
        forwardTargetIds: [2],
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(filters[0]?.conditions[0]?.values).toEqual(["更新"]);
    expect(filters[0]?.forwardTargetIds).toEqual([2]);
  });

  it("accepts optional forward target bindings on create and update", () => {
    expect(
      filterCreateInputSchema.parse({
        name: "项目更新",
        conditions: [{ type: "keyword", values: ["更新"] }],
        forwardTargetIds: [1, 2],
      }),
    ).toEqual({
      name: "项目更新",
      conditions: [{ type: "keyword", values: ["更新"] }],
      forwardTargetIds: [1, 2],
    });

    expect(filterUpdateInputSchema.parse({ forwardTargetIds: [] })).toEqual({
      forwardTargetIds: [],
    });

    expect(() =>
      filterCreateInputSchema.parse({
        name: "项目更新",
        conditions: [{ type: "keyword", values: ["更新"] }],
        forwardTargetIds: [0],
      }),
    ).toThrow();
  });

  it("rejects empty names and empty condition values", () => {
    expect(() =>
      filterCreateInputSchema.parse({
        name: " ",
        conditions: [{ type: "keyword", values: ["更新"] }],
      }),
    ).toThrow();

    expect(() =>
      filterCreateInputSchema.parse({
        name: "项目更新",
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
