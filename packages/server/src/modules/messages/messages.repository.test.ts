import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindFirst: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    message: {
      findFirst: mocks.messageFindFirst,
    },
  },
}));

import { findOldestUnreadMessage } from "./messages.repository.js";

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
});
