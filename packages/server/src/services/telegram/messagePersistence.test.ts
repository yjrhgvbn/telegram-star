import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../messageMemberships.test-helpers.js";

const state = vi.hoisted(() => ({
  fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined,
  notify: vi.fn().mockResolvedValue(0),
  emit: vi.fn(),
}));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
vi.mock("../notifier.js", () => ({ forwardMatchedMessage: state.notify }));
vi.mock("../messageEvents.js", () => ({ emitMessageEvent: state.emit }));

import { db } from "../../db/index.js";
import { persistMessageForFilters } from "./messagePersistence.js";
import { ingestTelegramMessage, type MessageIngestionSource } from "./messageIngestion.js";
import { synchronizeMessageMemberships, withMessageMembershipTransaction } from "../messageMemberships.js";

const now = "2026-09-09T00:00:00.000Z";
const data = { telegramMessageId: 10, chatId: "chat-1", content: "release", messageDate: now, createdAt: now, isRead: false };
const matchA = { filterId: 1, matchedKeyword: "release" };
const matchB = { filterId: 2, matchedKeyword: "release" };

function keywordConditions(...values: string[]) {
  return JSON.stringify([{ type: "keyword", values }]);
}

async function ingestEdit(content: string, activeFilters: { id: number; name: string; conditions: string }[]) {
  return ingestTelegramMessage({
    message: { id: data.telegramMessageId, message: content, date: Date.parse(data.messageDate) / 1000, editDate: Date.now() / 1000 },
    chat: { id: data.chatId, className: "Channel", title: "Chat" },
    activeFilters,
    source: "live-edit",
    notify: true,
    emitEvent: true,
  });
}

async function removeFromRule(messageId: number, filterId: number, blockBackfill = false) {
  return withMessageMembershipTransaction(async (tx) => {
    await tx.messageRemoval.upsert({
      where: { chatId_telegramMessageId_filterId: { chatId: data.chatId, telegramMessageId: data.telegramMessageId, filterId } },
      create: { chatId: data.chatId, telegramMessageId: data.telegramMessageId, filterId, removedAt: now, blockBackfill },
      update: { removedAt: now, blockBackfill },
    });
    await tx.messageFilterMembership.deleteMany({ where: { messageId, filterId } });
    return synchronizeMessageMemberships(tx, [messageId]);
  });
}

beforeEach(async () => {
  state.notify.mockClear();
  state.emit.mockClear();
  await db.messageRemoval.deleteMany();
  await db.message.deleteMany();
  await db.filter.deleteMany();
  await db.filter.createMany({ data: [1, 2, 3].map((id) => ({ id, name: `Rule ${id}`, conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]), createdAt: now, updatedAt: now })) });
});

afterAll(async () => state.fixture?.cleanup());

describe("rule-scoped message persistence", () => {
  it("preserves caller rule priority for the primary membership and the first notification", async () => {
    const ruleA = { id: 1, name: "A", conditions: keywordConditions("release") };
    const ruleB = { id: 2, name: "B", conditions: keywordConditions("release") };
    expect(await ingestTelegramMessage({
      message: { id: data.telegramMessageId, message: data.content, date: Date.now() / 1000 },
      chat: { id: data.chatId, className: "Channel", title: "Chat" },
      activeFilters: [ruleB, ruleA],
      source: "live",
      notify: true,
      emitEvent: true,
    })).toBe("created");
    expect(await db.message.findFirst()).toMatchObject({ matchedFilterId: 2 });
    expect(await db.messageFilterMembership.count()).toBe(2);
    expect(state.notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ filterId: 2 }));
    expect(state.emit).toHaveBeenCalledExactlyOnceWith({ type: "new" });
  });

  it("rechecks changed rule conditions before an old match can recreate a cleaned membership", async () => {
    const first = await persistMessageForFilters(data, [matchA]);
    await withMessageMembershipTransaction(async (tx) => {
      await tx.filter.update({ where: { id: 1 }, data: { conditions: keywordConditions("different") } });
      await tx.messageFilterMembership.deleteMany({ where: { messageId: first.rowId!, filterId: 1 } });
      await synchronizeMessageMemberships(tx, [first.rowId!]);
    });
    expect(await persistMessageForFilters(data, [matchA])).toMatchObject({ rowId: null, addedFilterIds: [] });
    expect(await db.message.count()).toBe(0);
    await db.filter.update({ where: { id: 1 }, data: { conditions: keywordConditions("rel") } });
    const fresh = await persistMessageForFilters(data, [matchA]);
    expect(fresh.addedMatches).toEqual([{ filterId: 1, matchedKeyword: "rel" }]);
    expect(await db.message.findUnique({ where: { id: fresh.rowId! } })).toMatchObject({ matchedKeyword: "rel" });
  });

  it("preserves stored content and existing memberships when Telegram edits stop matching them", async () => {
    await db.filter.update({ where: { id: 2 }, data: { conditions: keywordConditions("beta") } });
    const first = await persistMessageForFilters({ ...data, isRead: true, mediaType: "photo", mediaThumbBase64: "old" }, [matchA]);
    const filters = await db.filter.findMany({ select: { id: true, name: true, conditions: true } });
    expect(await ingestEdit("beta", filters)).toBe("unmatched");
    expect(await db.message.findUnique({ where: { id: first.rowId! } })).toMatchObject({
      content: "release", isRead: true, matchedFilterId: 1, matchedKeyword: "release", mediaType: "photo", mediaThumbBase64: "old",
    });
    expect(await db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 1, matchedKeyword: "release" }]);
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });

  it("adds a matching rule to existing content without sending notifications or SSE", async () => {
    const first = await persistMessageForFilters({ ...data, isRead: true }, [matchA]);
    const filters = await db.filter.findMany({ where: { id: { in: [1, 2] } }, select: { id: true, name: true, conditions: true } });
    expect(await ingestEdit("edited release", filters)).toBe("duplicate");
    expect(await db.message.findUnique({ where: { id: first.rowId! } })).toMatchObject({ content: "release", isRead: true });
    expect(await db.messageFilterMembership.count()).toBe(2);
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });

  it("all automatic sources respect removed A and can collect B without notifying A", async () => {
    const first = await persistMessageForFilters(data, [matchA]);
    await removeFromRule(first.rowId!, 1);
    const ruleA = { id: 1, name: "A", conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]) };
    const ruleB = { ...ruleA, id: 2, name: "B" };
    const input = {
      message: { id: data.telegramMessageId, message: data.content, date: Date.now() / 1000 },
      chat: { id: data.chatId, className: "Channel", title: "Chat" },
      notify: true,
      emitEvent: true,
    };
    for (const source of ["live", "live-edit", "startup-catchup", "reconnect-catchup", "periodic-catchup"] as MessageIngestionSource[]) {
      expect(await ingestTelegramMessage({ ...input, activeFilters: [ruleA], source })).toBe("unmatched");
    }
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
    expect(await ingestTelegramMessage({ ...input, activeFilters: [ruleA, ruleB], source: "live-edit" })).toBe("created");
    expect(state.notify).toHaveBeenCalledTimes(1);
    expect(state.notify).toHaveBeenCalledWith(expect.objectContaining({ filterId: 2 }));
    expect(await db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 2 }]);
  });
  it("stores one message with independent memberships and does not reset completion when adding a rule", async () => {
    const first = await persistMessageForFilters(data, [matchA]);
    await db.message.update({ where: { id: first.rowId! }, data: { isRead: true } });
    const second = await persistMessageForFilters(data, [matchA, matchB]);
    expect(second).toMatchObject({ rowId: first.rowId, created: false, addedFilterIds: [2] });
    expect(await db.message.count()).toBe(1);
    expect(await db.message.findUnique({ where: { id: first.rowId! } })).toMatchObject({ isRead: true, matchedFilterId: 1 });
    expect(await db.messageFilterMembership.count()).toBe(2);
  });

  it("removes only A, keeps B and skips A for every automatic persistence attempt", async () => {
    const first = await persistMessageForFilters(data, [matchA, matchB]);
    expect(await removeFromRule(first.rowId!, 1)).toEqual([]);
    expect(await db.message.findUnique({ where: { id: first.rowId! } })).toMatchObject({ matchedFilterId: 2 });
    const replay = await persistMessageForFilters(data, [matchA, matchB]);
    expect(replay).toMatchObject({ addedFilterIds: [], blockedFilterIds: [1] });
    expect(await db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 2 }]);
  });

  it("manual backfill restores A without changing B or the existing completion state", async () => {
    const first = await persistMessageForFilters(data, [matchA, matchB]);
    await db.message.update({ where: { id: first.rowId! }, data: { isRead: true } });
    await removeFromRule(first.rowId!, 1);
    const restored = await persistMessageForFilters(data, [matchA], "manual");
    expect(restored).toMatchObject({ rowId: first.rowId, created: false, addedFilterIds: [1] });
    expect(await db.messageRemoval.count()).toBe(0);
    expect(await db.messageFilterMembership.count()).toBe(2);
    expect(await db.message.findUnique({ where: { id: first.rowId! } })).toMatchObject({ isRead: true });
  });

  it("deletes the content after its final membership is removed and can recreate it through manual backfill", async () => {
    const first = await persistMessageForFilters(data, [matchA]);
    expect(await removeFromRule(first.rowId!, 1)).toEqual([first.rowId]);
    expect(await db.message.count()).toBe(0);
    expect(await persistMessageForFilters(data, [matchA])).toMatchObject({ rowId: null, blockedFilterIds: [1] });
    const restored = await persistMessageForFilters(data, [matchA], "manual");
    expect(restored).toMatchObject({ created: true, addedFilterIds: [1] });
    expect(await db.message.findUnique({ where: { id: restored.rowId! } })).toMatchObject({ isRead: false });
  });

  it("honors blockBackfill for A while another rule can still collect the message", async () => {
    const first = await persistMessageForFilters(data, [matchA]);
    await removeFromRule(first.rowId!, 1, true);
    const blocked = await persistMessageForFilters(data, [matchA], "manual");
    expect(blocked).toMatchObject({ rowId: null, blockedFilterIds: [1], addedFilterIds: [] });
    const other = await persistMessageForFilters(data, [matchB], "manual");
    expect(other).toMatchObject({ created: true, addedFilterIds: [2], blockedFilterIds: [] });
    expect(await db.messageRemoval.count()).toBe(1);
  });

  it("serializes concurrent duplicate ingestion and removal without resurrecting membership A", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => persistMessageForFilters(data, [matchA, matchB])));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    const rowId = results[0].rowId!;
    await Promise.all([
      persistMessageForFilters(data, [matchA, matchB]),
      removeFromRule(rowId, 1),
      persistMessageForFilters(data, [matchA, matchB]),
    ]);
    expect(await db.message.count()).toBe(1);
    expect(await db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 2 }]);
    expect(await db.messageRemoval.count()).toBe(1);
  });
});

it("migrates legacy rule ownership and preserves old standalone messages", async () => {
  const { createMessageMembershipTestDatabase } = await import("../messageMemberships.test-helpers.js");
  const fixture = createMessageMembershipTestDatabase({
    beforeRemovalMigration(sqlite) {
      sqlite.exec(`
        INSERT INTO filters(id, name, conditions, created_at, updated_at) VALUES(90, 'Legacy', '[]', '${now}', '${now}');
        INSERT INTO messages(id, telegram_message_id, chat_id, message_date, matched_filter_id, matched_keyword, is_read, created_at)
          VALUES(90, 90, 'legacy', '${now}', 90, 'release', 1, '${now}');
        INSERT INTO messages(id, telegram_message_id, chat_id, message_date, created_at)
          VALUES(91, 91, 'legacy', '${now}', '${now}');
      `);
    },
  });
  try {
    expect(await fixture.db.message.count()).toBe(2);
    expect(await fixture.db.messageFilterMembership.findMany()).toMatchObject([{ messageId: 90, filterId: 90, matchedKeyword: "release" }]);
    expect(await fixture.db.message.findUnique({ where: { id: 90 } })).toMatchObject({ isRead: true });
    expect(await fixture.db.message.findUnique({ where: { id: 91 } })).not.toBeNull();
  } finally {
    await fixture.cleanup();
  }
});
