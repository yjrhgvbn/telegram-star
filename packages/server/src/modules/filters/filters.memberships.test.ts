import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = await vi.hoisted(async () => {
  const { createMessageMembershipTestDatabase } = await import("../../services/messageMemberships.test-helpers.js");
  return createMessageMembershipTestDatabase();
});
vi.mock("../../db/index.js", () => ({ db: fixture.db }));

import { persistMessageForFilters } from "../../services/telegram/messagePersistence.js";
import { deleteFilterWithMessages, findFilterRows, updateFilterRow } from "./filters.repository.js";
import { subscribeToMessageEvents } from "../../services/messageEvents.js";

const now = "2026-09-09T00:00:00.000Z";

describe("rule changes preserve other memberships", () => {
  beforeEach(async () => {
    await fixture.db.message.deleteMany();
    await fixture.db.filter.deleteMany();
    await fixture.db.filter.createMany({ data: [1, 2].map((id) => ({
      id, name: `rule-${id}`, conditions: JSON.stringify([{ type: "keyword", values: ["hello"] }]),
      createdAt: now, updatedAt: now,
    })) });
  });
  afterAll(() => fixture.cleanup());

  async function seed() {
    const saved = await persistMessageForFilters({
      telegramMessageId: 100, chatId: "chat", content: "hello", messageDate: now, createdAt: now,
      isRead: true,
    }, [{ filterId: 1, matchedKeyword: "hello" }, { filterId: 2, matchedKeyword: "hello" }]);
    return saved.rowId!;
  }

  it("uses the latest shared message for every rule's activity summary", async () => {
    await seed();
    const rows = (await findFilterRows()).filter((row) => row.systemKey === null);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.messageMemberships[0]?.message.messageDate === now)).toBe(true);
  });

  it("removes only A's nonmatching membership when its conditions change", async () => {
    const messageId = await seed();
    await updateFilterRow(1, { conditions: [{ type: "keyword", values: ["different"] }] });
    expect(await fixture.db.message.findUnique({ where: { id: messageId } })).toMatchObject({
      isRead: true, content: "hello", matchedFilterId: 2,
    });
    expect(await fixture.db.messageFilterMembership.findMany()).toMatchObject([{ filterId: 2, messageId }]);
    expect(await fixture.db.messageRemoval.count()).toBe(0);
  });

  it("keeps B when A is deleted, then cleans up after the last rule is deleted", async () => {
    const messageId = await seed();
    const events: unknown[] = [];
    const unsubscribe = subscribeToMessageEvents((event) => events.push(event));
    try {
      await deleteFilterWithMessages(1);
      expect(await fixture.db.message.findUnique({ where: { id: messageId } })).toMatchObject({ matchedFilterId: 2, isRead: true });
      await deleteFilterWithMessages(2);
      expect(await fixture.db.message.findUnique({ where: { id: messageId } })).toBeNull();
      expect(await fixture.db.messageRemoval.count()).toBe(0);
      expect(events).toEqual([]);
    } finally { unsubscribe(); }
  });

  it("rolls back invalid rule evaluation without losing either membership", async () => {
    const messageId = await seed();
    await expect(updateFilterRow(1, { conditions: [{ type: "script", values: ["throw new Error('bad rule')"] }] })).rejects.toThrow();
    expect(await fixture.db.messageFilterMembership.count({ where: { messageId } })).toBe(2);
    expect(await fixture.db.message.findUnique({ where: { id: messageId } })).toMatchObject({ matchedFilterId: 1 });
  });
});
