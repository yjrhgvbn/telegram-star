import { describe, expect, it } from "vitest";
import {
  findFirstMatchingFilter,
  getMessageLagLogLevel,
  getMessageTimingFields,
} from "./messageIngestion.js";
import { isDuplicateMessageError } from "./messagePersistence.js";

describe("Telegram message ingestion", () => {
  it("selects the first enabled filter that matches all of its conditions", () => {
    const result = findFirstMatchingFilter("chat-1", "Release V2 is ready", [
      {
        id: 1,
        name: "wrong chat",
        conditions: JSON.stringify([
          { type: "keyword", values: ["release"] },
          { type: "chat", values: ["chat-2"] },
        ]),
      },
      {
        id: 2,
        name: "release",
        conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]),
      },
      {
        id: 3,
        name: "later match",
        conditions: JSON.stringify([{ type: "regex", values: ["V\\d+"] }]),
      },
    ]);

    expect(result).toEqual({
      filter: {
        id: 2,
        name: "release",
        conditions: JSON.stringify([{ type: "keyword", values: ["release"] }]),
      },
      matchedKeyword: "release",
    });
  });

  it("recognizes Prisma unique constraint errors without swallowing other failures", () => {
    expect(isDuplicateMessageError({ code: "P2002" })).toBe(true);
    expect(isDuplicateMessageError({ code: "P2025" })).toBe(false);
    expect(isDuplicateMessageError(new Error("database unavailable"))).toBe(false);
  });

  it("calculates ingestion delay from an edit timestamp when present", () => {
    expect(getMessageTimingFields({
      date: 1_000,
      editDate: new Date(1_120_000),
    }, 1_180_000)).toEqual({
      messageTimestampMs: 1_000_000,
      messageDate: "1970-01-01T00:16:40.000Z",
      editTimestampMs: 1_120_000,
      editDate: "1970-01-01T00:18:40.000Z",
      lagMs: 60_000,
    });
  });

  it("raises delayed message logs at one and five minutes", () => {
    expect(getMessageLagLogLevel(59_999)).toBe("info");
    expect(getMessageLagLogLevel(60_000)).toBe("warn");
    expect(getMessageLagLogLevel(299_999)).toBe("warn");
    expect(getMessageLagLogLevel(300_000)).toBe("error");
  });
});
