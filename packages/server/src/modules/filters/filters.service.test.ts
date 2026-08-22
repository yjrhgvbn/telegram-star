import { describe, expect, it } from "vitest";
import { buildFilterUpdateData } from "./filters.repository.js";
import { normalizeHistoryScope, toApiFilter } from "./filters.service.js";

describe("filters.service", () => {
  it("maps database rows to API filters", () => {
    const filter = toApiFilter({
      id: 7,
      name: "Anime",
      conditions: JSON.stringify([
        { type: "keyword", values: ["  2160P  "] },
        { type: "chat", values: ["1001"] },
      ]),
      enabled: true,
      autoLocateUnreadNearRead: false,
      isFocused: true,
      lastEngagedAt: "2026-06-29T00:45:00.000Z",
      lastEngagementType: "marked_read",
      lastEngagedMessageId: 18,
      manualGroupId: 3,
      manualSortOrder: 2,
      forwardTargets: [{ id: 2 }, { id: 5 }],
      messages: [{ messageDate: "2026-06-29T00:30:00.000Z" }],
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T01:00:00.000Z",
    });

    expect(filter.conditions).toEqual([
      { type: "keyword", values: ["2160P"] },
      { type: "chat", values: ["1001"] },
    ]);
    expect(filter.autoLocateUnreadNearRead).toBe(false);
    expect(filter.forwardTargetIds).toEqual([2, 5]);
    expect(filter.latestMessageAt).toBe("2026-06-29T00:30:00.000Z");
    expect(filter).toMatchObject({
      isFocused: true,
      lastEngagedAt: "2026-06-29T00:45:00.000Z",
      lastEngagementType: "marked_read",
      lastEngagedMessageId: 18,
      manualGroupId: 3,
      manualSortOrder: 2,
    });
  });

  it("normalizes history scope without inventing defaults", () => {
    expect(normalizeHistoryScope({ perChatLimit: 20, page: 2 })).toEqual({
      perChatLimit: 20,
      totalLimit: undefined,
      page: 2,
      pageSize: undefined,
    });
    expect(normalizeHistoryScope()).toEqual({
      perChatLimit: undefined,
      totalLimit: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("builds partial update data for filter changes", () => {
    const updateData = buildFilterUpdateData({
      conditions: [{ type: "keyword", values: ["夜"] }],
      autoLocateUnreadNearRead: false,
      forwardTargetIds: [2, 5],
    });

    expect(updateData).toMatchObject({
      conditions: JSON.stringify([{ type: "keyword", values: ["夜"] }]),
      autoLocateUnreadNearRead: false,
      forwardTargets: {
        set: [{ id: 2 }, { id: 5 }],
      },
    });
    expect(updateData).not.toHaveProperty("name");
    expect(updateData.updatedAt).toEqual(expect.any(String));
  });
});
