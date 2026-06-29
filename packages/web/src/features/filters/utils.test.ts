import { describe, expect, it } from "vitest";
import { normalizeConditions, toDraftConditions } from "./utils";
import type { DraftCondition } from "./types";

describe("filter form utils", () => {
  it("normalizes keyword draft values and unsaved input together", () => {
    const conditions: DraftCondition[] = [
      {
        id: "keyword-1",
        type: "keyword",
        values: [" BTC ", ""],
        input: "ETH， SOL\n  DOGE ",
      },
    ];

    expect(normalizeConditions(conditions)).toEqual([
      { type: "keyword", values: ["BTC", "ETH", "SOL", "DOGE"] },
    ]);
  });

  it("keeps chat values explicit and ignores chat input text", () => {
    const conditions: DraftCondition[] = [
      {
        id: "chat-1",
        type: "chat",
        values: [" 1001 ", "1002"],
        input: "should-not-be-saved",
      },
    ];

    expect(normalizeConditions(conditions)).toEqual([
      { type: "chat", values: ["1001", "1002"] },
    ]);
  });

  it("drops empty draft conditions after normalization", () => {
    expect(
      normalizeConditions([
        { id: "keyword-1", type: "keyword", values: [], input: "   " },
        { id: "chat-1", type: "chat", values: [], input: "" },
      ]),
    ).toEqual([]);
  });

  it("converts persisted conditions into editable drafts without sharing value arrays", () => {
    const source = [{ type: "keyword" as const, values: ["BTC"] }];
    const drafts = toDraftConditions(source);

    drafts[0]?.values.push("ETH");

    expect(drafts).toMatchObject([{ type: "keyword", values: ["BTC", "ETH"], input: "" }]);
    expect(source).toEqual([{ type: "keyword", values: ["BTC"] }]);
  });
});
