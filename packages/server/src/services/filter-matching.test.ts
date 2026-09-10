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

  it("matches exact sender IDs as alternatives without producing content highlights", () => {
    const result = evaluateFilterConditions(
      { chatId: "chat-1", senderUserId: "9007199254740993", content: "User 9007199254740993 posted" },
      [{ type: "sender", values: ["9007199254740992", "9007199254740993"] }],
    );
    expect(result).toEqual({
      matched: true,
      matchedKeyword: null,
      evidence: [{
        conditionIndex: 0,
        type: "sender",
        effect: "require",
        passed: true,
        matchedValues: ["9007199254740993"],
        matchedTexts: [],
      }],
    });
    expect(matchFilterConditions(
      { chatId: "chat-1", senderUserId: "9007199254740992", content: "9007199254740993" },
      [{ type: "sender", values: ["9007199254740993"] }],
    )).toEqual({ matched: false, matchedKeyword: null });
  });

  it.each([undefined, null, "-123", "@username", "0", "0123"])(
    "does not infer a user from content when senderUserId is %s",
    (senderUserId) => {
      const input = { chatId: "123", senderUserId, content: "sender 123" };
      expect(matchFilterConditions(input, [{ type: "sender", values: ["123"] }]))
        .toEqual({ matched: false, matchedKeyword: null });
      expect(matchFilterConditions(input, [{ type: "sender", effect: "exclude", values: ["123"] }]))
        .toEqual({ matched: true, matchedKeyword: null });
    },
  );

  it("combines sender, chat, and keyword restrictions with AND", () => {
    const conditions = [
      { type: "sender" as const, values: ["123", "456"] },
      { type: "chat" as const, values: ["chat-1"] },
      { type: "keyword" as const, values: ["BTC"] },
    ];
    const input = { chatId: "chat-1", senderUserId: "456", content: "BTC update" };
    expect(matchFilterConditions(input, conditions)).toEqual({ matched: true, matchedKeyword: "BTC" });
    expect(matchFilterConditions({ ...input, senderUserId: "789" }, conditions).matched).toBe(false);
    expect(matchFilterConditions({ ...input, chatId: "chat-2" }, conditions).matched).toBe(false);
    expect(matchFilterConditions({ ...input, content: "other update" }, conditions).matched).toBe(false);
  });

  it("combines sender alternatives with content and excludes any blocked sender", () => {
    const conditions = [
      { type: "chat" as const, groupId: "source", values: ["chat-1"] },
      { type: "sender" as const, groupId: "include", values: ["123"] },
      { type: "keyword" as const, groupId: "include", values: ["BTC"] },
      { type: "sender" as const, groupId: "blocked", groupEffect: "exclude" as const, values: ["456", "789"] },
    ];
    const senderOnly = evaluateFilterConditions(
      { chatId: "chat-1", senderUserId: "123", content: "ordinary update" }, conditions,
    );
    expect(senderOnly.matched).toBe(true);
    expect(senderOnly.matchedKeyword).toBeNull();
    expect(senderOnly.evidence[1]).toMatchObject({
      groupId: "include", groupPassed: true, conditionMatched: true,
      matchedValues: ["123"], matchedTexts: [],
    });
    expect(matchFilterConditions(
      { chatId: "chat-1", senderUserId: "111", content: "BTC update" }, conditions,
    )).toEqual({ matched: true, matchedKeyword: "BTC" });
    const excluded = evaluateFilterConditions(
      { chatId: "chat-1", senderUserId: "789", content: "BTC update" }, conditions,
    );
    expect(excluded.matched).toBe(false);
    expect(excluded.evidence[3]).toMatchObject({
      groupId: "blocked", effect: "exclude", passed: false, groupPassed: false,
      conditionMatched: true, matchedValues: ["789"], matchedTexts: [],
    });
    expect(matchFilterConditions(
      { chatId: "chat-2", senderUserId: "123", content: "BTC update" }, conditions,
    ).matched).toBe(false);
  });

  it("round-trips sender IDs and exclusion groups", () => {
    const serialized = serializeConditions([
      { type: "sender", groupId: "allowed", values: [" 123 ", "9007199254740993"] },
      { type: "sender", groupId: "blocked", groupEffect: "exclude", values: [" 456 "] },
    ]);
    expect(parseConditions(serialized)).toEqual([
      { type: "sender", groupId: "allowed", values: ["123", "9007199254740993"] },
      { type: "sender", groupId: "blocked", groupEffect: "exclude", values: ["456"] },
    ]);
  });

  it.each(["0", "-123", "+123", "@user", "0123", "1.2", "1e3", "9223372036854775808"])(
    "rejects invalid sender ID %s without broadening a stored rule",
    (value) => {
      const conditions = [
        { type: "keyword" as const, values: ["BTC"] },
        { type: "sender" as const, values: ["123", value] },
      ];
      expect(validateConditions(conditions)).toEqual({
        valid: false,
        error: "condition.sender values must be valid Telegram user IDs",
      });
      expect(parseConditions(JSON.stringify(conditions))).toEqual([]);
      expect(() => serializeConditions(conditions)).toThrow();
    },
  );

  it.each([{ values: [] }, { values: [123] }, { values: [""] }, { values: ["123", null] }])(
    "rejects malformed persisted sender values $values",
    ({ values }) => {
      expect(parseConditions(JSON.stringify([
        { type: "keyword", values: ["BTC"] },
        { type: "sender", values },
      ]))).toEqual([]);
    },
  );

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
