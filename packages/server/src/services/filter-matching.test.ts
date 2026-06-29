import { describe, expect, it } from "vitest";
import {
  hasConflictingChatConditions,
  matchFilterConditions,
  parseConditions,
  validateConditions,
} from "./filter-matching.js";

describe("filter matching", () => {
  it("parses supported conditions and drops invalid or empty values", () => {
    const conditions = parseConditions(
      JSON.stringify([
        { type: "keyword", values: [" Release ", "", 123, "Notice"] },
        { type: "chat", values: [" 1001 "] },
        { type: "unknown", values: ["ignored"] },
        { type: "keyword", values: [] },
      ]),
    );

    expect(conditions).toEqual([
      { type: "keyword", values: ["Release", "Notice"] },
      { type: "chat", values: ["1001"] },
    ]);
  });

  it("requires every condition to match and keeps the first matched keyword", () => {
    const result = matchFilterConditions(
      { chatId: "chat-1", content: "Daily RELEASE and NOTICE notes" },
      [
        { type: "keyword", values: ["release", "notice"] },
        { type: "chat", values: ["chat-1", "chat-2"] },
      ],
    );

    expect(result).toEqual({ matched: true, matchedKeyword: "release" });
  });

  it("fails when any condition does not match", () => {
    const result = matchFilterConditions(
      { chatId: "chat-9", content: "Daily RELEASE notes" },
      [
        { type: "keyword", values: ["release"] },
        { type: "chat", values: ["chat-1"] },
      ],
    );

    expect(result).toEqual({ matched: false, matchedKeyword: null });
  });

  it("validates condition shape before persistence or preview", () => {
    expect(validateConditions([])).toEqual({
      valid: false,
      error: "conditions is required",
    });
    expect(validateConditions([{ type: "keyword", values: ["  "] }])).toEqual({
      valid: false,
      error: "condition.values must contain non-empty strings",
    });
    expect(validateConditions([{ type: "chat", values: ["chat-1"] }])).toEqual({ valid: true });
  });

  it("detects multiple chat condition groups", () => {
    expect(
      hasConflictingChatConditions([
        { type: "chat", values: ["chat-1"] },
        { type: "keyword", values: ["release"] },
        { type: "chat", values: ["chat-2"] },
      ]),
    ).toBe(true);
  });
});
