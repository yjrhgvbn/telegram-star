import { describe, expect, it } from "vitest";
import {
  evaluateFilterConditions,
  hasConflictingChatConditions,
  matchFilterConditions,
  parseConditions,
  serializeConditions,
  validateConditions,
} from "./filter-matching.js";

describe("filter matching", () => {
  it("parses supported conditions and drops invalid or empty values", () => {
    const conditions = parseConditions(
      JSON.stringify([
        { type: "keyword", values: [" Release ", "", 123, "Notice"] },
        { type: "regex", values: [" v\\d+\\.\\d+ ", "(", ""] },
        { type: "chat", values: [" 1001 "] },
        { type: "unknown", values: ["ignored"] },
        { type: "keyword", values: [] },
      ]),
    );

    expect(conditions).toEqual([
      { type: "keyword", values: ["Release", "Notice"] },
      { type: "regex", values: ["v\\d+\\.\\d+"] },
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

  it("matches regex conditions case-insensitively", () => {
    const result = matchFilterConditions(
      { chatId: "chat-1", content: "Release V12.4 is live" },
      [
        { type: "regex", values: ["v\\d+\\.\\d+"] },
        { type: "chat", values: ["chat-1"] },
      ],
    );

    expect(result).toEqual({ matched: true, matchedKeyword: "v\\d+\\.\\d+" });
  });

  it("collects evidence for every matching value and the actual regex text", () => {
    const result = evaluateFilterConditions(
      { chatId: "chat-1", content: "RELEASE V12.4, release NOTICE v13.5" },
      [
        { type: "keyword", values: ["release", "notice"] },
        { type: "regex", values: ["v\\d+\\.\\d+"] },
        { type: "chat", values: ["chat-1"] },
      ],
    );

    expect(result).toEqual({
      matched: true,
      matchedKeyword: "release",
      evidence: [
        {
          conditionIndex: 0,
          type: "keyword",
          effect: "require",
          passed: true,
          matchedValues: ["release", "notice"],
          matchedTexts: ["release", "notice"],
        },
        {
          conditionIndex: 1,
          type: "regex",
          effect: "require",
          passed: true,
          matchedValues: ["v\\d+\\.\\d+"],
          matchedTexts: ["V12.4", "v13.5"],
        },
        {
          conditionIndex: 2,
          type: "chat",
          effect: "require",
          passed: true,
          matchedValues: ["chat-1"],
          matchedTexts: [],
        },
      ],
    });
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
    expect(validateConditions([{ type: "regex", values: ["("] }])).toEqual({
      valid: false,
      error: "condition.regex values must be valid regular expressions",
    });
  });

  it("detects multiple chat condition groups", () => {
    expect(
      hasConflictingChatConditions([
        { type: "chat", values: ["chat-1"] },
        { type: "keyword", values: ["release"] },
        { type: "chat", values: ["chat-2"] },
      ]),
    ).toBe(true);

    expect(
      hasConflictingChatConditions([
        { type: "chat", groupId: "source", values: ["chat-1"] },
        { type: "chat", groupId: "source", values: ["chat-2"] },
      ]),
    ).toBe(false);
  });

  it("round-trips exclusion and script conditions without changing legacy conditions", () => {
    const serialized = serializeConditions([
      { type: "keyword", values: [" 红包 "] },
      { type: "keyword", effect: "exclude", values: [" 已领完 "] },
      { type: "script", values: [" return message.content.includes('300'); "] },
    ]);

    expect(JSON.parse(serialized)).toEqual([
      { type: "keyword", values: ["红包"] },
      { type: "keyword", effect: "exclude", values: ["已领完"] },
      { type: "script", values: ["return message.content.includes('300');"] },
    ]);
    expect(parseConditions(serialized)).toEqual(JSON.parse(serialized));
  });

  it("round-trips group metadata", () => {
    const serialized = serializeConditions([
      { type: "keyword", groupId: "content", values: [" 红包 "] },
      { type: "regex", groupId: "content", values: [" 返佣.*300 "] },
      {
        type: "keyword",
        groupId: "excluded",
        groupEffect: "exclude",
        values: [" 已结束 "],
      },
    ]);

    expect(parseConditions(serialized)).toEqual([
      { type: "keyword", groupId: "content", values: ["红包"] },
      { type: "regex", groupId: "content", values: ["返佣.*300"] },
      {
        type: "keyword",
        groupId: "excluded",
        groupEffect: "exclude",
        values: ["已结束"],
      },
    ]);
  });

  it("matches alternatives with OR, groups with AND, and exclusions with NOT", () => {
    const conditions = [
      { type: "keyword" as const, groupId: "content", values: ["红包"] },
      { type: "regex" as const, groupId: "content", values: ["返佣.*300"] },
      {
        type: "keyword" as const,
        groupId: "excluded",
        groupEffect: "exclude" as const,
        values: ["已结束", "已领完"],
      },
    ];

    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "返佣最高可到 300，马上参加" },
        conditions,
      ),
    ).toEqual({ matched: true, matchedKeyword: "返佣.*300" });

    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "红包 300，活动已结束" },
        conditions,
      ),
    ).toEqual({ matched: false, matchedKeyword: null });

    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "只有数字 300，没有活动信息" },
        conditions,
      ),
    ).toEqual({ matched: false, matchedKeyword: null });
  });

  it("rejects a message when any exclusion condition matches", () => {
    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "300 元红包，速领" },
        [
          { type: "keyword", values: ["红包"] },
          { type: "keyword", effect: "exclude", values: ["已领完", "广告"] },
        ],
      ),
    ).toEqual({ matched: true, matchedKeyword: "红包" });

    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "300 元红包，已领完" },
        [
          { type: "keyword", values: ["红包"] },
          { type: "keyword", effect: "exclude", values: ["已领完", "广告"] },
        ],
      ),
    ).toEqual({ matched: false, matchedKeyword: null });
  });

  it("runs a user script with message data and accepts an optional matched text", () => {
    const result = matchFilterConditions(
      { chatId: "chat-1", content: "恭喜发财，红包金额 300 元" },
      [
        {
          type: "script",
          values: [
            "return { matched: /红包.*(?:^|\\D)300(?:\\D|$)/.test(message.content), matchedText: '300 元红包' };",
          ],
        },
      ],
    );

    expect(result).toEqual({ matched: true, matchedKeyword: "300 元红包" });
  });

  it("supports excluding a message when a user script returns true", () => {
    const conditions = [
      { type: "keyword" as const, values: ["红包"] },
      {
        type: "script" as const,
        effect: "exclude" as const,
        values: ["return message.content.includes('测试');"],
      },
    ];

    expect(
      matchFilterConditions({ chatId: "chat-1", content: "正式红包 300 元" }, conditions),
    ).toEqual({ matched: true, matchedKeyword: "红包" });
    expect(
      matchFilterConditions({ chatId: "chat-1", content: "测试红包 300 元" }, conditions),
    ).toEqual({ matched: false, matchedKeyword: null });
  });

  it("reports script validation and runtime errors without matching", () => {
    const validation = validateConditions([
      { type: "script", values: ["return (;"] },
    ]);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("condition.script source is invalid");

    expect(
      matchFilterConditions(
        { chatId: "chat-1", content: "红包 300 元" },
        [{ type: "script", values: ["throw new Error('boom');"] }],
      ),
    ).toMatchObject({
      matched: false,
      matchedKeyword: null,
      error: expect.stringContaining("boom"),
    });
  });
});
