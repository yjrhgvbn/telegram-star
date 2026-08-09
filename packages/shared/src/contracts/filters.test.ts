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
        conditions: [
          { type: "keyword", values: ["更新"] },
          { type: "regex", values: ["v\\d+\\.\\d+"] },
        ],
        enabled: true,
        autoLocateUnreadNearRead: true,
        forwardTargetIds: [2],
        latestMessageAt: "2026-06-25T02:00:00.000Z",
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(filters[0]?.conditions[0]?.values).toEqual(["更新"]);
    expect(filters[0]?.conditions[1]).toEqual({ type: "regex", values: ["v\\d+\\.\\d+"] });
    expect(filters[0]?.forwardTargetIds).toEqual([2]);
    expect(filters[0]?.latestMessageAt).toBe("2026-06-25T02:00:00.000Z");
  });

  it("defaults activity fields for responses from an older server", () => {
    const filters = filterListSchema.parse([
      {
        id: 1,
        name: "兼容分组",
        conditions: [{ type: "keyword", values: ["更新"] }],
        enabled: true,
        autoLocateUnreadNearRead: true,
        forwardTargetIds: [],
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    expect(filters[0]?.latestMessageAt).toBeNull();
  });

  it("accepts regex conditions and rejects invalid regex patterns", () => {
    expect(
      filterCreateInputSchema.parse({
        name: "版本号",
        conditions: [{ type: "regex", values: ["v\\d+\\.\\d+"] }],
      }),
    ).toEqual({
      name: "版本号",
      conditions: [{ type: "regex", values: ["v\\d+\\.\\d+"] }],
    });

    expect(() =>
      filterCreateInputSchema.parse({
        name: "坏正则",
        conditions: [{ type: "regex", values: ["("] }],
      }),
    ).toThrow();
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
