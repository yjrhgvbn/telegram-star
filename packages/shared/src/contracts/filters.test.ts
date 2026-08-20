import { describe, expect, it } from "vitest";
import {
  filterBackfillJobCreateInputSchema,
  filterBackfillJobSchema,
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

  it("accepts exclusion and script conditions while keeping chat scope positive", () => {
    expect(
      filterCreateInputSchema.parse({
        name: "红包提醒",
        conditions: [
          { type: "chat", values: ["1001"] },
          { type: "keyword", effect: "exclude", values: ["已领完"] },
          {
            type: "script",
            values: ["return message.content.includes('红包');"],
          },
        ],
      }),
    ).toMatchObject({
      conditions: [
        { type: "chat", values: ["1001"] },
        { type: "keyword", effect: "exclude", values: ["已领完"] },
        { type: "script", values: ["return message.content.includes('红包');"] },
      ],
    });

    expect(() =>
      filterCreateInputSchema.parse({
        name: "错误会话条件",
        conditions: [{ type: "chat", effect: "exclude", values: ["1001"] }],
      }),
    ).toThrow();

    expect(() =>
      filterCreateInputSchema.parse({
        name: "多段脚本",
        conditions: [{ type: "script", values: ["return true;", "return false;"] }],
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

  it("validates time and quantity backfill jobs", () => {
    expect(
      filterBackfillJobCreateInputSchema.parse({
        mode: "time",
        startAt: "2025-08-09T00:00:00.000Z",
        endAt: "2026-08-09T23:59:59.999Z",
      }),
    ).toMatchObject({ mode: "time" });
    expect(
      filterBackfillJobCreateInputSchema.parse({
        mode: "count",
        perChatLimit: 5_000,
      }),
    ).toEqual({ mode: "count", perChatLimit: 5_000 });

    expect(() => filterBackfillJobCreateInputSchema.parse({ mode: "count" })).toThrow();
    expect(() =>
      filterBackfillJobCreateInputSchema.parse({
        mode: "time",
        startAt: "2026-08-10T00:00:00.000Z",
        endAt: "2026-08-09T23:59:59.999Z",
      }),
    ).toThrow();
  });

  it("accepts persisted backfill progress", () => {
    const job = filterBackfillJobSchema.parse({
      id: "job-1",
      filterId: 3,
      mode: "count",
      status: "running",
      startAt: null,
      endAt: null,
      perChatLimit: 5_000,
      totalChats: 4,
      completedChats: 1,
      scannedMessages: 1_200,
      matchedCount: 30,
      savedCount: 28,
      skippedExistingCount: 2,
      currentChatTitle: "资源频道",
      error: null,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:01:00.000Z",
      completedAt: null,
    });

    expect(job.status).toBe("running");
    expect(job.scannedMessages).toBe(1_200);
  });
});
