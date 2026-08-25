import { describe, expect, it } from "vitest";
import {
  assertValidRegexConditions,
  assertValidScriptConditions,
  createInitialDraftConditions,
  deriveFilterName,
  describeFilterRule,
  mergePersistableConditions,
  normalizeConditions,
  toDraftConditions,
} from "./utils";
import type { DraftCondition } from "./types";

describe("filter form utils", () => {
  it("starts a new rule with an implicit all-chat scope and a keyword condition", () => {
    expect(createInitialDraftConditions()).toMatchObject([
      { type: "chat", values: [], input: "" },
      { type: "keyword", values: [], input: "" },
    ]);
  });

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

  it("stores one script source and preserves its group exclusion effect", () => {
    expect(
      normalizeConditions([
        {
          id: "script-1",
          type: "script",
          effect: "exclude",
          values: [],
          input: "  return message.content.includes('测试');  ",
        },
      ]),
    ).toEqual([
      {
        type: "script",
        groupEffect: "exclude",
        values: ["return message.content.includes('测试');"],
      },
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
      { type: "chat", values: ["1001", "1002"] },
      { type: "regex", values: ["v\\d+"] },
    ]);
  });

  it("throws a readable error for invalid regex conditions", () => {
    expect(() =>
      assertValidRegexConditions([{ type: "regex", values: ["("] }]),
    ).toThrow("正则表达式无效：(");
  });

  it("checks script syntax without executing user code in the browser", () => {
    expect(() =>
      assertValidScriptConditions([
        { type: "script", values: ["return message.content.length > 0;"] },
      ]),
    ).not.toThrow();
    expect(() =>
      assertValidScriptConditions([{ type: "script", values: ["return (;"] }]),
    ).toThrow(/JavaScript 代码无效/);
  });

  it("converts persisted conditions into editable drafts without sharing value arrays", () => {
    const source = [{ type: "keyword" as const, values: ["发布"] }];
    const drafts = toDraftConditions(source);

    drafts[1]?.values.push("公告");

    expect(drafts).toMatchObject([
      { type: "chat", values: [], input: "" },
      { type: "keyword", values: ["发布", "公告"], input: "" },
    ]);
    expect(source).toEqual([{ type: "keyword", values: ["发布"] }]);
  });

  it("does not duplicate an existing persisted chat scope", () => {
    expect(
      toDraftConditions([
        { type: "chat", values: ["1001"] },
        { type: "keyword", values: ["发布"] },
      ]).map((condition) => condition.type),
    ).toEqual(["chat", "keyword"]);
  });

  it("loads persisted script source back into the code editor", () => {
    expect(
      toDraftConditions([
        {
          type: "script",
          effect: "exclude",
          values: ["return message.content.includes('广告');"],
        },
      ]),
    ).toMatchObject([
      { type: "chat", values: [], input: "" },
      {
        type: "script",
        effect: "exclude",
        values: [],
        input: "return message.content.includes('广告');",
      },
    ]);
  });

  it("derives an optional name from content first and chat scope as a fallback", () => {
    expect(
      deriveFilterName([
        { type: "keyword", values: [" 将夜 "] },
        { type: "chat", values: ["1001"] },
      ], [{ id: "1001", title: "动漫抢先看" }]),
    ).toBe("将夜");
    expect(deriveFilterName([{ type: "regex", values: ["v\\d+"] }])).toBe(
      "正则：v\\d+",
    );
    expect(
      deriveFilterName(
        [{ type: "chat", values: ["1001"] }],
        [{ id: "1001", title: "动漫抢先看" }],
      ),
    ).toBe("动漫抢先看");
  });

  it("describes the real AND/OR rule semantics with readable chat titles", () => {
    expect(
      describeFilterRule(
        [
          { type: "chat", values: ["1001"] },
          { type: "keyword", values: ["更新", "番外"] },
        ],
        [{ id: "1001", title: "将夜" }],
      ),
    ).toBe("消息来自「将夜」，并且内容包含「更新」或「番外」");

    expect(
      describeFilterRule([
        { type: "keyword", values: ["红包"] },
        { type: "keyword", effect: "exclude", values: ["已领完", "广告"] },
        { type: "script", values: ["return true;"] },
      ]),
    ).toBe(
      "内容包含「红包」，并且排除内容包含「已领完」或「广告」，并且自定义代码返回 true",
    );
  });

  it("keeps alternatives in one persisted OR group", () => {
    expect(
      normalizeConditions([
        {
          id: "keyword-1",
          groupId: "content-group",
          type: "keyword",
          values: ["红包"],
          input: "",
        },
        {
          id: "regex-1",
          groupId: "content-group",
          type: "regex",
          values: ["返佣.*300"],
          input: "",
        },
      ]),
    ).toEqual([
      { type: "keyword", groupId: "content-group", values: ["红包"] },
      { type: "regex", groupId: "content-group", values: ["返佣.*300"] },
    ]);

    expect(
      describeFilterRule([
        { type: "keyword", groupId: "content-group", values: ["红包"] },
        { type: "regex", groupId: "content-group", values: ["返佣.*300"] },
        {
          type: "keyword",
          groupId: "exclude-group",
          groupEffect: "exclude",
          values: ["已结束"],
        },
      ]),
    ).toBe("（内容包含「红包」，或者内容匹配「返佣.*300」），并且排除内容包含「已结束」");
  });

});
