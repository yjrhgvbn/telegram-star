import { afterAll, describe, expect, it, vi } from "vitest";
import type { createMessageMembershipTestDatabase } from "../messageMemberships.test-helpers.js";

const state = vi.hoisted(() => ({
  fixture: undefined as ReturnType<typeof createMessageMembershipTestDatabase> | undefined,
  client: { getDialogs: vi.fn(), getMessages: vi.fn() },
  notify: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("../../db/index.js", async () => {
  const { createMessageMembershipTestDatabase } = await import("../messageMemberships.test-helpers.js");
  state.fixture = createMessageMembershipTestDatabase();
  return { db: state.fixture.db };
});
vi.mock("./client.js", () => ({ getClient: () => state.client, isClientConnected: () => true }));
vi.mock("../notifier.js", () => ({ forwardMatchedMessage: state.notify }));
vi.mock("../messageEvents.js", () => ({ emitMessageEvent: state.emit }));
vi.mock("../../shared/logging.js", () => ({ appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import type { FilterCondition } from "../filter-matching.js";
import { db } from "../../db/index.js";
import { backfillFilterHistory, listSingleChatMessages, previewHistoricalFilterMessages } from "./history.js";
import { findFirstMatchingFilter, ingestTelegramMessage } from "./messageIngestion.js";

afterAll(async () => state.fixture?.cleanup());

describe("sender filtering across Telegram ingestion and history", () => {
  it("uses the same current user for live messages, listing, preview and backfill without querying rejected senders", async () => {
    const now = "2026-09-11T00:00:00.000Z";
    const conditions: FilterCondition[] = [
      { type: "chat", values: ["chat-1"] },
      { type: "sender", values: ["123", "456"] },
      { type: "keyword", values: ["release"] },
    ];
    const filters = [1, 2].map((id) => ({ id, name: `Sender rule ${id}`, conditions: JSON.stringify(conditions) }));
    await db.filter.deleteMany();
    await db.filter.createMany({ data: filters.map((filter) => ({ ...filter, createdAt: now, updatedAt: now })) });
    const chat = { className: "Channel", id: "chat-1", title: "Releases" };
    const metadata = [
      { fromId: { className: "PeerUser", userId: "123" }, sender: { className: "User", id: "123" } },
      { fromId: { className: "PeerUser", userId: "456" }, sender: { className: "User", id: "456", bot: true } },
      { fromId: { className: "PeerChannel", channelId: "123" }, sender: { className: "Channel", id: "123" } },
      { fromId: { className: "PeerChannel", channelId: "chat-1" }, postAuthor: "123" },
      { fromId: { className: "PeerUser", userId: "123" }, fwdFrom: { fromId: { className: "PeerUser", userId: "999" } } },
      { fromId: { className: "PeerUser", userId: "999" }, fwdFrom: { fromId: { className: "PeerUser", userId: "123" } } },
      { post: true, postAuthor: "123" },
      { fromId: { className: "PeerUser", userId: "123" } },
      { senderId: "123" },
    ];
    const messages = metadata.map((item, index) => ({
      ...item,
      id: index + 1,
      message: "release",
      date: Date.parse(now) / 1000,
      getSender: vi.fn().mockResolvedValue("sender" in item ? item.sender : undefined),
    }));
    const expectedUserIds = ["123", "456", null, null, "123", "999", null, "123", null];
    const expectedMessageIds = [1, 2, 5, 8];
    state.client.getDialogs.mockResolvedValue([{ entity: chat }]);
    state.client.getMessages.mockImplementation(async (_entity, options) => options.offsetId ? [] : messages);

    const listed = await listSingleChatMessages({ chatId: chat.id });
    expect(listed.map((message) => message.senderUserId)).toEqual(expectedUserIds);
    const preview = await previewHistoricalFilterMessages({ conditions });
    expect(preview.messages.map((message) => message.id)).toEqual(expectedMessageIds);
    expect(await db.message.count()).toBe(0);
    for (const message of messages) expect(message.getSender).not.toHaveBeenCalled();

    expect(findFirstMatchingFilter(chat.id, "release", filters, "123")?.filter.id).toBe(1);
    expect(findFirstMatchingFilter(chat.id, "release", filters)).toBeNull();
    for (const message of messages) {
      const expectedMatch = expectedMessageIds.includes(message.id);
      expect(await ingestTelegramMessage({ message, chat, activeFilters: [filters[0]!], source: "live", notify: false, emitEvent: false }))
        .toBe(expectedMatch ? "created" : "unmatched");
      expect(message.getSender).toHaveBeenCalledTimes(expectedMatch ? 1 : 0);
    }
    const stored = await db.message.findMany({ orderBy: { telegramMessageId: "asc" } });
    expect(stored.map((message) => [message.telegramMessageId, message.senderUserId]))
      .toEqual(expectedMessageIds.map((id) => [id, expectedUserIds[id - 1]]));

    const backfill = await backfillFilterHistory({ filterId: 2, conditions });
    expect(backfill).toMatchObject({ scannedMessages: 9, matchedCount: 4, savedCount: 4 });
    expect(await db.message.count()).toBe(4);
    expect(await db.messageFilterMembership.count()).toBe(8);
    for (const message of messages) {
      expect(message.getSender).toHaveBeenCalledTimes(expectedMessageIds.includes(message.id) ? 1 : 0);
    }
    expect(state.notify).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });
});
