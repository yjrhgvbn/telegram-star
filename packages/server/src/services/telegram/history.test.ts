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
import { backfillFilterHistory } from "./history.js";

afterAll(async () => state.fixture?.cleanup());

describe("manual history backfill with rule removal", () => {
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
