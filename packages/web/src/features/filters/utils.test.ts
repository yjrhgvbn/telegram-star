import { describe, expect, it } from "vitest";
import {
  assertValidRegexConditions,
  mergePersistableConditions,
  normalizeConditions,
  toDraftConditions,
} from "./utils";
import type { DraftCondition } from "./types";

describe("filter form utils", () => {
  it("normalizes keyword draft values and unsaved input together", () => {
    const conditions: DraftCondition[] = [
      {
        id: "keyword-1",
        type: "keyword",
        values: [" 发布 ", ""],
        input: "公告， 需求\n  修复 ",
      },
    ];

    expect(normalizeConditions(conditions)).toEqual([
      { type: "keyword", values: ["发布", "公告", "需求", "修复"] },
    ]);
  });

  it("normalizes regex draft input line by line without splitting commas", () => {
    const conditions: DraftCondition[] = [
      {
        id: "regex-1",
        type: "regex",
        values: [" v\\d+\\.\\d+ "],
        input: "foo,bar\n  release\\s+\\d+ ",
      },
    ];

    expect(normalizeConditions(conditions)).toEqual([
      { type: "regex", values: ["v\\d+\\.\\d+", "foo,bar", "release\\s+\\d+"] },
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
        { id: "regex-1", type: "regex", values: [], input: "   " },
        { id: "chat-1", type: "chat", values: [], input: "" },
      ]),
    ).toEqual([]);
  });

  it("preserves regex conditions while merging chat conditions for persistence", () => {
    expect(
      mergePersistableConditions([
        { type: "keyword", values: ["发布"] },
        { type: "chat", values: ["1001"] },
        { type: "regex", values: ["v\\d+"] },
        { type: "chat", values: ["1001", "1002"] },
      ]),
    ).toEqual([
      { type: "keyword", values: ["发布"] },
      { type: "regex", values: ["v\\d+"] },
      { type: "chat", values: ["1001", "1002"] },
    ]);
  });

  it("throws a readable error for invalid regex conditions", () => {
    expect(() =>
      assertValidRegexConditions([{ type: "regex", values: ["("] }]),
    ).toThrow("正则表达式无效：(");
  });

  it("converts persisted conditions into editable drafts without sharing value arrays", () => {
    const source = [{ type: "keyword" as const, values: ["发布"] }];
    const drafts = toDraftConditions(source);

    drafts[0]?.values.push("公告");

    expect(drafts).toMatchObject([{ type: "keyword", values: ["发布", "公告"], input: "" }]);
    expect(source).toEqual([{ type: "keyword", values: ["发布"] }]);
  });
});
