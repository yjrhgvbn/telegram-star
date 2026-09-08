import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../../services/messageMemberships.test-helpers.js";

const state = vi.hoisted(() => ({ fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined }));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../../services/messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});

import { db } from "../../db/index.js";
import { persistMessageForFilters } from "../../services/telegram/messagePersistence.js";
import { formatMessageRow } from "./messageFormatter.js";
import {
  markMessagesRead,
  listInitialMessages,
  removeMessagesFromFilter,
  setMessageReadState,
} from "./messages.repository.js";

const now = "2026-09-09T00:00:00.000Z";
const matchA = { filterId: 1, matchedKeyword: "release" };
const matchB = { filterId: 2, matchedKeyword: "new" };

async function seed(telegramMessageId = 10, matches = [matchA, matchB]) {
  const result = await persistMessageForFilters({
    telegramMessageId, chatId: "chat", content: "new release", messageDate: now, createdAt: now,
    isRead: false,
  }, matches);
  return result.rowId!;
}

beforeEach(async () => {
  await db.messageRemoval.deleteMany();
  await db.message.deleteMany();
  await db.filter.deleteMany();
  await db.filter.createMany({ data: [1, 2].map((id) => ({
    id, name: `Rule ${id}`,
    conditions: JSON.stringify([{ type: "keyword", values: [id === 1 ? "release" : "new"] }]),
    createdAt: now, updatedAt: now,
  })) });
});
afterAll(async () => state.fixture?.cleanup());

describe("message removal API persistence", () => {
  it("removes A then restores A without affecting B or message completion", async () => {
    const id = await seed();
    await setMessageReadState(id, true);
    await expect(removeMessagesFromFilter({ filterId: 1, ids: [id] }))
      .resolves.toEqual({ removedIds: [id] });
    expect((await listInitialMessages({ filterMemberships: { some: { filterId: 1 } } }, 20)).rows).toEqual([]);
    const remaining = (await listInitialMessages({ filterMemberships: { some: { filterId: 2 } } }, 20))
      .rows.map((row) => formatMessageRow(row, new Set(), 2));
    expect(remaining).toMatchObject([{ id, isRead: true, matchedFilterId: 2, filterMatches: [{ filterId: 2 }] }]);

    await seed(10, [matchB]);
    const restored = await persistMessageForFilters({
      telegramMessageId: 10, chatId: "chat", content: "new release", messageDate: now, createdAt: now,
      isRead: false,
    }, [matchA], "manual");
    expect(restored).toMatchObject({ rowId: id, created: false, addedFilterIds: [1] });
    expect(await db.messageRemoval.count()).toBe(0);
    const all = (await listInitialMessages({}, 20)).rows.map((row) => formatMessageRow(row, new Set()));
    expect(all).toMatchObject([{ id, isRead: true, filterMatches: [{ filterId: 1 }, { filterId: 2 }] }]);
  });

  it("batch removal ignores nonmembers and repeated IDs and keeps the original backfill preference", async () => {
    const shared = await seed(10);
    const onlyA = await seed(20, [matchA]);
    const onlyB = await seed(30, [matchB]);
    const result = await removeMessagesFromFilter({ filterId: 1, ids: [shared, onlyA, onlyB, shared, 999] });
    expect(result.removedIds.sort()).toEqual([shared, onlyA].sort());
    expect(await db.message.findUnique({ where: { id: onlyA } })).toBeNull();
    expect((await listInitialMessages({}, 20)).rows).toHaveLength(2);
    await expect(removeMessagesFromFilter({ filterId: 1, ids: [shared, onlyA, onlyB], blockBackfill: true }))
      .resolves.toEqual({ removedIds: [] });
    expect(await db.messageRemoval.findMany()).toMatchObject([{ blockBackfill: false }, { blockBackfill: false }]);
  });

  it("serializes remove and read mutations without losing B or reintroducing A", async () => {
    const id = await seed();
    await Promise.all([
      removeMessagesFromFilter({ filterId: 1, ids: [id] }),
      setMessageReadState(id, true),
      markMessagesRead([id]),
    ]);
    expect(await db.message.findUnique({ where: { id } })).toMatchObject({ isRead: true, matchedFilterId: 2 });
    expect(await db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 2 }]);
    expect(await db.filter.findUnique({ where: { id: 1 } })).toMatchObject({ lastEngagedAt: null });
    expect(await db.filter.findUnique({ where: { id: 2 } })).toMatchObject({ lastEngagedMessageId: id });
  });

  it("returns missing for a read queued after the last membership is removed", async () => {
    const id = await seed(10, [matchA]);
    const [removed, read] = await Promise.all([
      removeMessagesFromFilter({ filterId: 1, ids: [id] }),
      setMessageReadState(id, true),
    ]);
    expect(removed.removedIds).toEqual([id]);
    expect(read).toBeNull();
    expect(await db.message.count()).toBe(0);
    expect(await db.messageRemoval.count()).toBe(1);
  });
});
