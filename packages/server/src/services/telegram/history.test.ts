import { afterAll, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../messageMemberships.test-helpers.js";

const state = vi.hoisted(() => ({
  fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined,
  client: { getDialogs: vi.fn(), getMessages: vi.fn() },
  emit: vi.fn(),
}));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
vi.mock("./client.js", () => ({ getClient: () => state.client, isClientConnected: () => true }));
vi.mock("../messageEvents.js", () => ({ emitMessageEvent: state.emit }));

import { db } from "../../db/index.js";
import { persistMessageForFilters } from "./messagePersistence.js";
import { backfillFilterHistory, listJoinedChats, previewHistoricalFilterMessages } from "./history.js";

afterAll(async () => state.fixture?.cleanup());

describe("manual history backfill with rule removal", () => {
  it("includes private and bot dialogs and scans every OR-selected source", async () => {
    const people = [
      { className: "User", id: "321", firstName: "Alice", lastName: "Z", username: "alice" },
      { className: "User", id: "654", firstName: "Helper", bot: true },
    ];
    state.client.getDialogs.mockResolvedValue(people.map(entity => ({ entity })));
    state.client.getMessages.mockImplementation(async (entity, options) => options.offsetId ? [] : [{ id: 20, message: "release", date: 1_789_000_000, sender: entity }]);
    expect(await listJoinedChats()).toEqual([{ id: "user:321", title: "Alice Z" }, { id: "user:654", title: "Helper" }]);
    const result = await previewHistoricalFilterMessages({ conditions: [
      { type: "chat", values: ["user:321"], groupId: "sources" },
      { type: "chat", values: ["user:654"], groupId: "sources" },
      { type: "keyword", values: ["release"] },
    ] });
    expect(result.scannedChats).toBe(2);
    expect(result.messages).toHaveLength(2);
    expect(result.messages.find(message => message.chatId === "user:321")?.telegramLink).toBe("https://t.me/alice");
    expect(result.messages.find(message => message.chatId === "user:654")?.telegramLink).toBe("");
  });

  it("counts restored memberships, existing memberships, and blocked removals separately", async () => {
    const now = "2026-09-09T00:00:00.000Z";
    await db.filter.deleteMany();
    await db.filter.createMany({ data: [1, 2].map((id) => ({ id, name: `Rule ${id}`, conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]), createdAt: now, updatedAt: now })) });
    await db.messageRemoval.createMany({ data: [
      { chatId: "chat-1", telegramMessageId: 10, filterId: 1, removedAt: now, blockBackfill: false },
      { chatId: "chat-1", telegramMessageId: 11, filterId: 1, removedAt: now, blockBackfill: true },
    ] });
    const baseData = { chatId: "chat-1", content: "release", messageDate: now, createdAt: now };
    await persistMessageForFilters({ ...baseData, telegramMessageId: 12 }, [{ filterId: 1, matchedKeyword: "release" }]);
    const other = await persistMessageForFilters({ ...baseData, telegramMessageId: 13, isRead: true }, [{ filterId: 2, matchedKeyword: "release" }]);
    state.client.getDialogs.mockResolvedValue([{ entity: { className: "Channel", id: "chat-1", title: "Chat" } }]);
    state.client.getMessages.mockResolvedValue([10, 11, 12, 13].map((id) => ({ id, message: "release", date: Date.parse(now) / 1000 })));
    const progress = vi.fn();

    const result = await backfillFilterHistory({
      filterId: 1,
      conditions: [{ type: "keyword", values: ["release"] }],
      onProgress: progress,
    });

    expect(result).toEqual({ scannedChats: 1, scannedMessages: 4, matchedCount: 4, savedCount: 2, skippedExistingCount: 1, skippedRemovedCount: 1 });
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ savedCount: 2, skippedExistingCount: 1, skippedRemovedCount: 1 }));
    expect(await db.messageRemoval.findMany()).toMatchObject([{ telegramMessageId: 11, blockBackfill: true }]);
    expect(await db.message.count()).toBe(3);
    expect(await db.messageFilterMembership.count()).toBe(4);
    expect(await db.message.findUnique({ where: { id: other.rowId! } })).toMatchObject({ isRead: true });
    expect(state.emit).not.toHaveBeenCalled();
  });
});

it("keeps same-ID private and channel messages separate across ingestion, listing and manual backfill", async () => {
  const { ingestTelegramMessage } = await import("./messageIngestion.js");
  const { listSingleChatMessages } = await import("./history.js");
  const now = "2026-09-18T00:00:00.000Z";
  const channel = { className: "Channel", id: "321", title: "Channel" };
  const user = { className: "User", id: "321", firstName: "Alice", username: "alice" };
  const conditions = [{ type: "keyword" as const, values: ["release"] }];
  const filter = await db.filter.create({ data: { name: "Namespace regression", conditions: JSON.stringify(conditions), createdAt: now, updatedAt: now } });
  const makeMessage = (entity: typeof user | typeof channel) => ({
    id: 909, message: "release", date: Date.parse(now) / 1000,
    fromId: { className: "PeerUser", userId: "321" }, sender: user,
    peerId: entity === user ? { className: "PeerUser", userId: "321" } : { className: "PeerChannel", channelId: "321" },
  });
  state.client.getDialogs.mockResolvedValue([{ entity: channel }, { entity: user }]);
  state.client.getMessages.mockImplementation(async (entity, options) => options.offsetId ? [] : [makeMessage(entity)]);

  expect(await ingestTelegramMessage({ message: makeMessage(channel), chat: channel, activeFilters: [filter], source: "live", notify: false, emitEvent: false })).toBe("created");
  expect(await ingestTelegramMessage({ message: makeMessage(user), chat: user, activeFilters: [filter], source: "live", notify: false, emitEvent: false })).toBe("created");
  const rows = await db.message.findMany({ where: { telegramMessageId: 909 }, orderBy: { chatId: "asc" } });
  expect(rows.map(row => [row.chatId, row.senderUserId])).toEqual([["321", "321"], ["user:321", "321"]]);

  const messages = await listSingleChatMessages({ chatId: "user:321" });
  expect(state.client.getMessages).toHaveBeenLastCalledWith(user, { limit: 100 });
  expect(messages[0]).toMatchObject({ chatId: "user:321", senderUserId: "321", inDatabase: true, telegramLink: "https://t.me/alice" });

  const targetConditions = [{ type: "chat" as const, values: ["user:321"] }];
  const target = await db.filter.create({ data: { name: "Only private", conditions: JSON.stringify(targetConditions), createdAt: now, updatedAt: now } });
  const result = await backfillFilterHistory({ filterId: target.id, conditions: targetConditions });
  expect(result).toMatchObject({ scannedChats: 1, matchedCount: 1, savedCount: 1 });
  const memberships = await db.messageFilterMembership.findMany({ where: { filterId: target.id }, include: { message: true } });
  expect(memberships.map(item => item.message.chatId)).toEqual(["user:321"]);
});
