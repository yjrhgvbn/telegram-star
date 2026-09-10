import { afterEach, describe, expect, it, vi } from "vitest";
import { joinedChatListSchema } from "@telegram-star/shared/contracts/chats";
import { clientDeviceListSchema } from "@telegram-star/shared/contracts/clients";
import { appConfigStatusSchema } from "@telegram-star/shared/contracts/config";
import { filterGroupLayoutSchema, filterGroupListSchema } from "@telegram-star/shared/contracts/filter-groups";
import { filterListSchema, filterSchema, isValidTelegramUserId } from "@telegram-star/shared/contracts/filters";
import { forwardTargetListSchema, forwardTargetSchema } from "@telegram-star/shared/contracts/forward-targets";
import {
  messageBatchReadResponseSchema,
  messageEngagementResponseSchema,
  messageListResponseSchema,
  messageReadStateResponseSchema,
  messageStatsSchema,
} from "@telegram-star/shared/contracts/messages";
import { createDemoApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("isolated browser demo API", () => {
  it("provides usable fictional user IDs and stores sender rules with the real contract", async () => {
    const api = createDemoApi();
    const messages = messageListResponseSchema.parse(await api("/messages"));
    expect(messages.data.every((message) => message.senderUserId && isValidTelegramUserId(message.senderUserId))).toBe(true);
    const conditions = [{ type: "sender", values: [messages.data[0].senderUserId], groupEffect: "exclude" }];
    const filter = filterSchema.parse(await api("/filters", { method: "POST", body: JSON.stringify({ name: "用户过滤", conditions }) }));
    expect(filter.conditions).toEqual(conditions);
    await expect(api("/filters", { method: "POST", body: JSON.stringify({ name: "非法用户", conditions: [{ type: "sender", values: ["@user"] }] }) })).rejects.toThrow();
  });
  it("serves all four tabs using the real response contracts and no remote media", async () => {
    const api = createDemoApi();
    const routes = [
      ["/config", appConfigStatusSchema],
      ["/filters", filterListSchema],
      ["/filter-groups", filterGroupListSchema],
      ["/filter-groups/layout", filterGroupLayoutSchema],
      ["/forward-targets", forwardTargetListSchema],
      ["/chats", joinedChatListSchema],
      ["/clients", clientDeviceListSchema],
      ["/messages/stats", messageStatsSchema],
    ] as const;
    for (const [route, schema] of routes) expect(schema.safeParse(await api(route)).success).toBe(true);
    const { data } = messageListResponseSchema.parse(await api("/messages"));
    expect(data.length).toBeGreaterThan(10);
    expect(data.every((message) => message.telegramLink === "" && message.mediaType === null
      && message.mediaThumbBase64 === null && message.contentLinks.length === 0)).toBe(true);
    expect(await api("/auth/status")).toMatchObject({ apiId: null, apiHashMasked: null });
  });

  it("combines text search, rule membership and completion filters", async () => {
    const api = createDemoApi();
    const search = messageListResponseSchema.parse(await api("/messages?search=markdown&filterId=2&isRead=true"));
    expect(search.data.map((message) => message.id)).toEqual([1]);
    expect(search.data[0].matchedFilterId).toBe(2);
    expect(messageListResponseSchema.parse(await api("/messages?search=markdown&filterId=3")).data).toEqual([]);
    expect(messageListResponseSchema.parse(await api("/messages?search=markdown&isRead=false")).data).toEqual([]);
  });

  it("paginates chronologically without duplicating the cursor and locates pending work", async () => {
    const api = createDemoApi();
    const newest = messageListResponseSchema.parse(await api("/messages?limit=4"));
    expect(newest.data.map((message) => message.id)).toEqual([15, 16, 17, 18]);
    expect(newest).toMatchObject({ hasOlder: true, hasNewer: false });
    const older = messageListResponseSchema.parse(await api("/messages?limit=4&cursorId=15&direction=before"));
    expect(older.data.map((message) => message.id)).toEqual([11, 12, 13, 14]);
    const newer = messageListResponseSchema.parse(await api("/messages?limit=4&cursorId=14&direction=after"));
    expect(newer.data).toEqual(newest.data);
    const located = messageListResponseSchema.parse(await api("/messages?limit=5&autoLocate=true"));
    expect(located.anchorId).toBe(7);
    expect(located.data.some((message) => message.id === 7)).toBe(true);
  });

  it("updates completion and stats in memory, with independent sessions", async () => {
    const api = createDemoApi();
    const before = messageStatsSchema.parse(await api("/messages/stats"));
    expect(messageReadStateResponseSchema.parse(await api("/messages/7/read", { method: "PATCH" })))
      .toEqual({ id: 7, isRead: true });
    expect(messageBatchReadResponseSchema.parse(await api("/messages/batch-read", {
      method: "PATCH", body: JSON.stringify({ ids: [8, 9] }),
    }))).toEqual({ success: true, count: 2 });
    const after = messageStatsSchema.parse(await api("/messages/stats"));
    expect(after.unread).toBe(before.unread - 3);
    expect(after.total).toBe(before.total);
    expect(messageListResponseSchema.parse(await api("/messages?isRead=false")).data
      .some((message) => [7, 8, 9].includes(message.id))).toBe(false);
    expect(messageStatsSchema.parse(await createDemoApi()("/messages/stats"))).toEqual(before);
  });

  it("does not partly complete a batch containing an invalid message", async () => {
    const api = createDemoApi();
    await expect(api("/messages/batch-read", {
      method: "PATCH", body: JSON.stringify({ ids: [7, 999] }),
    })).rejects.toThrow("不存在");
    expect(messageListResponseSchema.parse(await api("/messages?isRead=false")).data
      .some((message) => message.id === 7)).toBe(true);
  });

  it("keeps rule names, memberships and notification assignments consistent after local edits", async () => {
    const api = createDemoApi();
    const filter = filterSchema.parse(await api("/filters", {
      method: "POST", body: JSON.stringify({ name: "演示新规则", conditions: [{ type: "keyword", values: ["demo"] }] }),
    }));
    const target = forwardTargetSchema.parse(await api("/forward-targets", {
      method: "POST", body: JSON.stringify({ name: "本地示例", appriseUrl: "demo://example", enabled: true, filterIds: [filter.id] }),
    }));
    expect(filterListSchema.parse(await api("/filters")).find((item) => item.id === filter.id)?.forwardTargetIds)
      .toEqual([target.id]);
    await api("/filters/2", { method: "PUT", body: JSON.stringify({ name: "开源收藏" }) });
    expect(messageListResponseSchema.parse(await api("/messages?filterId=2")).data
      .every((message) => message.filterName === "开源收藏")).toBe(true);
    await api(`/filters/${filter.id}`, { method: "DELETE" });
    expect(forwardTargetListSchema.parse(await api("/forward-targets")).find((item) => item.id === target.id)?.filterIds)
      .toEqual([]);
  });

  it("removes a message from the aggregate when its last real membership is removed", async () => {
    const api = createDemoApi();
    const result = await api("/messages") as { data: Array<{ content: string }> };
    result.data[0].content = "mutated by caller";
    expect(messageListResponseSchema.parse(await api("/messages")).data[0].content).not.toBe("mutated by caller");
    expect(messageListResponseSchema.parse(await api("/messages?filterId=1")))
      .toEqual(messageListResponseSchema.parse(await api("/messages")));
    await api("/messages/remove", { method: "POST", body: JSON.stringify({ filterId: 2, ids: [1] }) });
    expect(messageListResponseSchema.parse(await api("/messages?filterId=2")).data.some((message) => message.id === 1)).toBe(false);
    expect(messageListResponseSchema.parse(await api("/messages?filterId=1")).data.some((message) => message.id === 1)).toBe(false);
    expect(messageListResponseSchema.parse(await api("/messages")).data.some((message) => message.id === 1)).toBe(false);
    expect(messageStatsSchema.parse(await api("/messages/stats")).total).toBe(17);
  });

  it("deletes orphaned messages when a rule is deleted without inventing aggregate membership", async () => {
    const api = createDemoApi();
    const ruleMessages = messageListResponseSchema.parse(await api("/messages?filterId=2")).data;
    const removedIds = new Set(ruleMessages.map((message) => message.id));
    expect(ruleMessages.every((message) => message.filterMatches?.every((match) => match.filterId !== 1))).toBe(true);
    await api("/filters/2", { method: "DELETE" });
    const remaining = messageListResponseSchema.parse(await api("/messages"));
    expect(remaining.data).toHaveLength(18 - removedIds.size);
    expect(remaining.data.every((message) => !removedIds.has(message.id))).toBe(true);
    expect(messageListResponseSchema.parse(await api("/messages?filterId=1"))).toEqual(remaining);
    expect(messageStatsSchema.parse(await api("/messages/stats")).total).toBe(remaining.data.length);
    expect(filterListSchema.parse(await api("/filters")).find((filter) => filter.id === 1)?.latestMessageAt)
      .toBe(remaining.data[remaining.data.length - 1].messageDate);
  });

  it("records completion and open intent locally against the real rule without networking", async () => {
    const fetch = vi.fn(() => { throw new Error("Network must remain unused"); });
    vi.stubGlobal("fetch", fetch);
    const api = createDemoApi();
    await api("/messages/7/read", { method: "PATCH" });
    expect(filterListSchema.parse(await api("/filters")).find((filter) => filter.id === 2))
      .toMatchObject({ lastEngagementType: "marked_read", lastEngagedMessageId: 7 });
    const engagement = messageEngagementResponseSchema.parse(await api("/messages/7/engagement", {
      method: "POST", body: JSON.stringify({ type: "opened_telegram" }),
    }));
    expect(engagement).toMatchObject({ recorded: true, filterId: 2, lastEngagementType: "opened_telegram", lastEngagedMessageId: 7 });
    expect(filterListSchema.parse(await api("/filters")).find((filter) => filter.id === 2)?.lastEngagedAt)
      .toBe(engagement.lastEngagedAt);
    expect(filterListSchema.parse(await api("/filters")).find((filter) => filter.id === 1)?.lastEngagedAt)
      .toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects external effects and unknown reads or writes without ever calling fetch", async () => {
    const fetch = vi.fn(() => { throw new Error("Network must remain unused"); });
    vi.stubGlobal("fetch", fetch);
    const api = createDemoApi();
    for (const [path, method] of [
      ["/auth/login", "POST"], ["/auth/send-code", "POST"], ["/config", "PUT"],
      ["/filters/preview", "POST"], ["/filters/2/backfill", "POST"],
      ["/filters/2/backfill-jobs", "POST"], ["/forward-targets/test", "POST"],
      ["/messages/force-sync-read", "POST"], ["/clients/register", "POST"],
      ["/chats/discover?q=hello", "GET"], ["/future-endpoint", "POST"],
      ["/future-endpoint", "GET"], ["https://example.invalid/api/messages", "GET"],
    ]) await expect(api(path, { method })).rejects.toThrow("Demo 模式不支持");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an aborted mutation before changing state", async () => {
    const api = createDemoApi();
    const controller = new AbortController();
    controller.abort();
    await expect(api("/messages/7/read", { method: "PATCH", signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(messageListResponseSchema.parse(await api("/messages?isRead=false")).data
      .some((message) => message.id === 7)).toBe(true);
  });
});
