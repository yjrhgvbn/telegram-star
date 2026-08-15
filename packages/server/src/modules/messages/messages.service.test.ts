import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMessageCursor: vi.fn(),
  findMostRecentReadMessage: vi.fn(),
  findOldestUnreadMessage: vi.fn(),
  listMessagesAroundCursor: vi.fn(),
  runInteractionSyncInBackground: vi.fn(),
}));

vi.mock("./messages.repository.js", () => ({
  countMessageStats: vi.fn(),
  findFirstUnreadAfterCursor: vi.fn(),
  findMessageCursor: mocks.findMessageCursor,
  findMessageReadState: vi.fn(),
  findMostRecentReadMessage: mocks.findMostRecentReadMessage,
  findNewestMessage: vi.fn(),
  findOldestUnreadMessage: mocks.findOldestUnreadMessage,
  findReadSyncCandidates: vi.fn(),
  listInitialMessages: vi.fn(),
  listMessagesAfterCursor: vi.fn(),
  listMessagesAroundCursor: mocks.listMessagesAroundCursor,
  listMessagesBeforeCursor: vi.fn(),
  markMessagesRead: vi.fn(),
  setMessageReadState: vi.fn(),
}));

vi.mock("./readSyncFallback.js", () => ({
  runInteractionSyncInBackground: mocks.runInteractionSyncInBackground,
}));

import { listMessages } from "./messages.service.js";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
};

describe("messages service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("anchors automatic positioning to the oldest unread message when none are read", async () => {
    const cursor = {
      id: 1,
      messageDate: "2026-06-01T00:00:00.000Z",
      telegramMessageId: 1001,
    };
    mocks.findMostRecentReadMessage.mockResolvedValue(null);
    mocks.findOldestUnreadMessage.mockResolvedValue(cursor);
    mocks.findMessageCursor.mockResolvedValue(cursor);
    mocks.listMessagesAroundCursor.mockResolvedValue({
      rows: [],
      hasOlder: false,
      hasNewer: true,
    });

    const result = await listMessages({
      filterId: 12,
      autoLocate: true,
      limit: 20,
    }, logger);

    expect(mocks.findOldestUnreadMessage).toHaveBeenCalledWith({ matchedFilterId: 12 });
    expect(mocks.listMessagesAroundCursor).toHaveBeenCalledWith(
      { matchedFilterId: 12 },
      cursor.id,
      cursor,
      20,
    );
    expect(result).toEqual({
      data: [],
      hasOlder: false,
      hasNewer: true,
      anchorId: cursor.id,
    });
  });
});
