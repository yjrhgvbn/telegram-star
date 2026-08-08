import { describe, expect, it } from "vitest";
import { findFirstMatchingFilter } from "./messageIngestion.js";
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
});
