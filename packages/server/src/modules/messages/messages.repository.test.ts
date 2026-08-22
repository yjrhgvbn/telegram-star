import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filterUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindUnique: vi.fn(),
  messageUpdate: vi.fn(),
  messageUpdateMany: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    $transaction: vi.fn(async (callback) => callback({
      filter: { update: mocks.filterUpdate },
      message: {
        findMany: mocks.messageFindMany,
        findUnique: mocks.messageFindUnique,
        update: mocks.messageUpdate,
        updateMany: mocks.messageUpdateMany,
      },
    })),
    message: {
      findFirst: mocks.messageFindFirst,
    },
  },
}));

import {
  findOldestUnreadMessage,
  markMessagesRead,
  recordMessageGroupEngagement,
  setMessageReadState,
} from "./messages.repository.js";

describe("messages repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.messageUpdate.mockResolvedValue({ id: 7, isRead: true, matchedFilterId: 3 });
    mocks.filterUpdate.mockResolvedValue({ id: 3 });

    await expect(setMessageReadState(7, true)).resolves.toMatchObject({ id: 7, isRead: true });

    expect(mocks.messageUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isRead: true },
      select: { id: true, isRead: true, matchedFilterId: true },
    });
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
    mocks.messageUpdate.mockResolvedValue({ id: 7, isRead: false, matchedFilterId: 3 });

    await setMessageReadState(7, false);

    expect(mocks.filterUpdate).not.toHaveBeenCalled();
  });

  it("updates each affected group when messages are batch marked read", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { id: 1, matchedFilterId: 2 },
      { id: 3, matchedFilterId: 2 },
      { id: 5, matchedFilterId: 4 },
    ]);
    mocks.messageUpdateMany.mockResolvedValue({ count: 3 });
    mocks.filterUpdate.mockResolvedValue({});

    await markMessagesRead([5, 1, 3]);

    expect(mocks.filterUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.filterUpdate).toHaveBeenCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        lastEngagementType: "marked_read",
        lastEngagedMessageId: 5,
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
    mocks.messageFindUnique.mockResolvedValueOnce({ id: 8, matchedFilterId: 12 });
    mocks.filterUpdate.mockResolvedValue({});

    await expect(recordMessageGroupEngagement(8, "opened_telegram")).resolves.toMatchObject({
      recorded: true,
      filterId: 12,
      lastEngagementType: "opened_telegram",
      lastEngagedMessageId: 8,
    });

    mocks.messageFindUnique.mockResolvedValueOnce({ id: 9, matchedFilterId: null });
    await expect(recordMessageGroupEngagement(9, "opened_telegram")).resolves.toEqual({
      recorded: false,
      filterId: null,
      lastEngagedAt: null,
      lastEngagementType: null,
      lastEngagedMessageId: null,
    });
    expect(mocks.filterUpdate).toHaveBeenCalledOnce();
  });
});
