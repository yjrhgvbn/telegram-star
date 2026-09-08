import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filterUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdate: vi.fn(),
  messageUpdateMany: vi.fn(),
  membershipDeleteMany: vi.fn(),
  removalUpsert: vi.fn(),
  synchronizeMemberships: vi.fn(),
}));

const transaction = {
  filter: { update: mocks.filterUpdate },
  message: {
    findMany: mocks.messageFindMany,
    findUnique: mocks.messageFindUnique,
    update: mocks.messageUpdate,
    updateMany: mocks.messageUpdateMany,
  },
  messageFilterMembership: { deleteMany: mocks.membershipDeleteMany },
  messageRemoval: { upsert: mocks.removalUpsert },
};

vi.mock("../../services/messageMemberships.js", () => ({
  withMessageMembershipTransaction: vi.fn(async (callback) => callback(transaction)),
  synchronizeMessageMemberships: mocks.synchronizeMemberships,
}));

vi.mock("../../db/index.js", () => ({
  db: {
    $transaction: vi.fn(async (callback) => callback(transaction)),
    message: {
      findFirst: mocks.messageFindFirst,
      findMany: mocks.messageFindMany,
    },
  },
}));

import {
  findOldestUnreadMessage,
  markMessagesRead,
  listMessagesAroundCursor,
  removeMessagesFromFilter,
  recordMessageGroupEngagement,
  setMessageReadState,
} from "./messages.repository.js";

describe("messages repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messageFindUnique.mockResolvedValue({ id: 7 });
    mocks.synchronizeMemberships.mockResolvedValue([]);
  });

  it("finds the oldest unread message with a deterministic tie-breaker", async () => {
    mocks.messageFindFirst.mockResolvedValue({ id: 1 });

    await findOldestUnreadMessage({ matchedFilterId: 12 });

    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { matchedFilterId: 12, isRead: false },
      orderBy: [
        { messageDate: "asc" },
        { telegramMessageId: "asc" },
      ],
    });
  });

  it("records marked-read engagement in the same transaction as the message update", async () => {
    mocks.messageUpdate.mockResolvedValue({ id: 7, isRead: true, filterMemberships: [{ filterId: 3 }, { filterId: 8 }] });
    mocks.filterUpdate.mockResolvedValue({ id: 3 });

    await expect(setMessageReadState(7, true)).resolves.toMatchObject({ id: 7, isRead: true });

    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isRead: true },
      select: { id: true, isRead: true, filterMemberships: { select: { filterId: true } } },
    });
    expect(mocks.filterUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.filterUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        lastEngagedAt: expect.any(String),
        lastEngagementType: "marked_read",
        lastEngagedMessageId: 7,
      },
    });
  });

  it("does not treat restoring unread as a follow-up", async () => {
    mocks.messageUpdate.mockResolvedValue({ id: 7, isRead: false, filterMemberships: [{ filterId: 3 }] });

    await setMessageReadState(7, false);

    expect(mocks.filterUpdate).not.toHaveBeenCalled();
  });

  it("updates each affected group when messages are batch marked read", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { id: 1, filterMemberships: [{ filterId: 2 }] },
      { id: 3, filterMemberships: [{ filterId: 2 }, { filterId: 4 }] },
      { id: 5, filterMemberships: [{ filterId: 4 }] },
    ]);
    mocks.messageUpdateMany.mockResolvedValue({ count: 3 });
    mocks.filterUpdate.mockResolvedValue({});

    await markMessagesRead([5, 1, 3]);

    expect(mocks.filterUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.filterUpdate).toHaveBeenCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        lastEngagementType: "marked_read",
        lastEngagedMessageId: 3,
      }),
    });
    expect(mocks.filterUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: expect.objectContaining({
        lastEngagementType: "marked_read",
        lastEngagedMessageId: 3,
      }),
    });
  });

  it("records Telegram opens only for messages that belong to a group", async () => {
    mocks.messageFindUnique.mockResolvedValueOnce({ id: 8, matchedFilterId: 12, filterMemberships: [{ filterId: 12 }] });
    mocks.filterUpdate.mockResolvedValue({});

    await expect(recordMessageGroupEngagement(8, "opened_telegram")).resolves.toMatchObject({
      recorded: true,
      filterId: 12,
      lastEngagementType: "opened_telegram",
      lastEngagedMessageId: 8,
    });

    mocks.messageFindUnique.mockResolvedValueOnce({ id: 9, matchedFilterId: null, filterMemberships: [] });
    await expect(recordMessageGroupEngagement(9, "opened_telegram")).resolves.toEqual({
      recorded: false,
      filterId: null,
      lastEngagedAt: null,
      lastEngagementType: null,
      lastEngagedMessageId: null,
    });
    expect(mocks.filterUpdate).toHaveBeenCalledOnce();
  });

  it("removes only the selected rule and synchronizes remaining memberships", async () => {
    const messages = [
      { id: 1, chatId: "chat", telegramMessageId: 10 },
      { id: 2, chatId: "chat", telegramMessageId: 20 },
    ];
    mocks.messageFindMany.mockResolvedValue(messages);
    mocks.synchronizeMemberships.mockResolvedValue([2]);

    await expect(removeMessagesFromFilter({ filterId: 3, ids: [1, 1, 2], blockBackfill: true }))
      .resolves.toEqual({ removedIds: [1, 2] });

    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, filterMemberships: { some: { filterId: 3 } } },
      select: { id: true, chatId: true, telegramMessageId: true },
    });
    expect(mocks.removalUpsert).toHaveBeenCalledWith({
      where: { chatId_telegramMessageId_filterId: { chatId: "chat", telegramMessageId: 10, filterId: 3 } },
      create: {
        chatId: "chat", telegramMessageId: 10, filterId: 3,
        blockBackfill: true, removedAt: expect.any(String),
      },
      update: { blockBackfill: true, removedAt: expect.any(String) },
    });
    expect(mocks.membershipDeleteMany).toHaveBeenCalledWith({
      where: { filterId: 3, messageId: { in: [1, 2] } },
    });
    expect(mocks.synchronizeMemberships).toHaveBeenCalledWith(transaction, [1, 2]);
    expect(mocks.removalUpsert.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.membershipDeleteMany.mock.invocationCallOrder[0]);
    expect(mocks.membershipDeleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.synchronizeMemberships.mock.invocationCallOrder[0]);
  });

  it("keeps retries and unrelated rule IDs idempotent without changing removal preferences", async () => {
    mocks.messageFindMany.mockResolvedValue([]);

    await expect(removeMessagesFromFilter({ filterId: 3, ids: [1], blockBackfill: true }))
      .resolves.toEqual({ removedIds: [] });

    expect(mocks.removalUpsert).not.toHaveBeenCalled();
    expect(mocks.membershipDeleteMany).not.toHaveBeenCalled();
  });

  it("does not insert an around-cursor message removed from the requested rule", async () => {
    const where = { filterMemberships: { some: { filterId: 3 } } };
    mocks.messageFindMany.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 5 }]);
    mocks.messageFindFirst.mockResolvedValue(null);

    await expect(listMessagesAroundCursor(where, 3, {
      messageDate: "2026-09-09T00:00:00.000Z", telegramMessageId: 30,
    }, 20)).resolves.toMatchObject({ rows: [{ id: 1 }, { id: 5 }] });
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [where, { id: 3 }] },
    }));
  });
});
