import { describe, expect, it } from "vitest";
import {
  buildAfterCursorWhere,
  buildBeforeCursorWhere,
  buildMessageBaseWhere,
} from "./messagePagination.js";

const cursor = {
  messageDate: "2026-06-26T00:00:00.000Z",
  telegramMessageId: 42,
};

describe("messagePagination", () => {
  it("builds base message filters", () => {
    expect(buildMessageBaseWhere({
      isRead: false,
      filterId: 7,
      search: "keyword",
    })).toEqual({
      isRead: false,
      matchedFilterId: 7,
      content: { contains: "keyword" },
    });
  });

  it("uses messageDate and telegramMessageId for before-cursor windows", () => {
    expect(buildBeforeCursorWhere({ isRead: false }, cursor)).toEqual({
      AND: [
        { isRead: false },
        {
          OR: [
            { messageDate: { lt: cursor.messageDate } },
            {
              messageDate: cursor.messageDate,
              telegramMessageId: { lt: cursor.telegramMessageId },
            },
          ],
        },
      ],
    });
  });

  it("uses messageDate and telegramMessageId for after-cursor windows", () => {
    expect(buildAfterCursorWhere({ matchedFilterId: 7 }, cursor)).toEqual({
      AND: [
        { matchedFilterId: 7 },
        {
          OR: [
            { messageDate: { gt: cursor.messageDate } },
            {
              messageDate: cursor.messageDate,
              telegramMessageId: { gt: cursor.telegramMessageId },
            },
          ],
        },
      ],
    });
  });
});
