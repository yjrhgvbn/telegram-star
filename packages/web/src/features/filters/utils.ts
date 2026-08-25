import type {
  FilterCondition,
  FilterConditionType,
  JoinedChat,
} from "@/types";
import type { DraftCondition } from "./types";

function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

export function createDraftCondition(type: FilterConditionType = "keyword"): DraftCondition {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    effect: "require",
    values: [],
    input: "",
  };
}

/**
 * 新建规则默认把会话范围展示出来。空的 chat 条件只表示“全部会话”，
 * normalizeConditions 会在保存前忽略它，因此不会给现有 API 增加特殊值。
 */
export function createInitialDraftConditions(): DraftCondition[] {
  return [createDraftCondition("chat"), createDraftCondition("keyword")];
}

export function toDraftConditions(conditions: FilterCondition[]): DraftCondition[] {
  if (conditions.length === 0) {
    return createInitialDraftConditions();
  }

  const drafts = conditions.map((condition, index) => {
    const isScript = condition.type === "script";
    return {
      id: `${condition.type}-${index}-${Math.random().toString(36).slice(2, 10)}`,
      type: condition.type,
      effect: condition.effect ?? "require",
      values: isScript ? [] : [...condition.values],
      input: isScript ? (condition.values[0] ?? "") : "",
    };
  });

  return conditions.some((condition) => condition.type === "chat")
    ? drafts
    : [createDraftCondition("chat"), ...drafts];
}

export function normalizeConditions(conditions: DraftCondition[]): FilterCondition[] {
  return conditions
    .map((condition) => {
      const values = (
        // 关键词条件允许"输入框未点添加就直接保存"，把暂存输入一并并入最终值
        condition.type === "script"
          ? [condition.input]
          : condition.type === "keyword"
          ? [
              ...condition.values,
              ...condition.input
                .split(/[,，\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
            ]
          : condition.type === "regex"
            ? [
                ...condition.values,
                ...condition.input
                  .split(/\n/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              ]
            : condition.values
      )
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        type: condition.type,
        ...(condition.effect === "exclude" ? { effect: condition.effect } : {}),
        values,
      } as FilterCondition;
    })
    .filter((condition) => condition.values.length > 0);
}

export function mergePersistableConditions(conditions: FilterCondition[]): FilterCondition[] {
  const nonChatConditions = conditions.filter((condition) => condition.type !== "chat");
  const chatValues = Array.from(
    new Set(
      conditions
        .filter((condition) => condition.type === "chat")
        .flatMap((condition) => condition.values),
    ),
  );

  return chatValues.length > 0
    ? [...nonChatConditions, { type: "chat", values: chatValues }]
    : nonChatConditions;
}

export function assertValidRegexConditions(conditions: FilterCondition[]): void {
  const invalidValue = conditions
    .filter((condition) => condition.type === "regex")
    .flatMap((condition) => condition.values)
    .find((value) => !isValidRegexPattern(value));

  if (invalidValue) {
    throw new Error(`正则表达式无效：${invalidValue}`);
  }
}

function compileFilterScript(source: string): void {
  // 这里只做语法检查；真正执行统一在服务端完成，避免预览与实时监听出现两套结果。
  new Function("message", `"use strict";\n${source}`);
}

export function assertValidScriptConditions(conditions: FilterCondition[]): void {
  for (const condition of conditions) {
    if (condition.type !== "script") continue;

    if (condition.values.length !== 1) {
      throw new Error("每个自定义 JavaScript 条件只能包含一段代码");
    }

    const source = condition.values[0];
    if (source.length > 20_000) {
      throw new Error("自定义 JavaScript 不能超过 20,000 个字符");
    }

    try {
      compileFilterScript(source);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`JavaScript 代码无效：${detail}`);
    }
  }
}

function formatQuotedList(values: string[], fallback: string): string {
  if (values.length === 0) return fallback;

  const visible = values.slice(0, 3).map((value) => `「${value}」`);
  const suffix = values.length > visible.length ? `等 ${values.length} 项` : "";
  return `${visible.join("或")}${suffix}`;
}

function resolveChatNames(values: string[], chats: JoinedChat[]): string[] {
  const chatTitleById = new Map(chats.map((chat) => [chat.id, chat.title]));
  return values.map((value) => chatTitleById.get(value) ?? value);
}

function truncateFilterName(value: string, maxLength = 32): string {
  const characters = Array.from(value.trim());
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength).join("")}…`
    : characters.join("");
}

/**
 * 自定义名称为空时，从第一条内容条件生成稳定、可读的名称；
 * 仅有会话条件时再退回到第一个会话名称。
 */
export function deriveFilterName(
  conditions: FilterCondition[],
  chats: JoinedChat[] = [],
): string {
  const contentCondition = conditions.find(
    (condition) => ["keyword", "regex", "script"].includes(condition.type),
  );
  const contentValue = contentCondition?.values[0]?.trim();

  if (contentCondition && contentValue) {
    if (contentCondition.type === "script") return "自定义代码规则";

    const effectPrefix = contentCondition.effect === "exclude" ? "排除：" : "";
    return truncateFilterName(
      contentCondition.type === "regex"
        ? `${effectPrefix}正则：${contentValue}`
        : `${effectPrefix}${contentValue}`,
    );
  }

  const firstChatId = conditions.find((condition) => condition.type === "chat")
    ?.values[0];
  if (firstChatId) {
    return truncateFilterName(resolveChatNames([firstChatId], chats)[0] ?? firstChatId);
  }

  return "新规则";
}

export function describeFilterCondition(
  condition: FilterCondition,
  chats: JoinedChat[] = [],
): string {
  if (condition.type === "chat") {
    return `消息来自${formatQuotedList(resolveChatNames(condition.values, chats), "任一已加入会话")}`;
  }

  if (condition.type === "regex") {
    const description = `内容匹配${formatQuotedList(condition.values, "尚未填写的正则表达式")}`;
    return condition.effect === "exclude" ? `排除${description}` : description;
  }

  if (condition.type === "script") {
    return condition.effect === "exclude"
      ? "自定义代码返回 true 时排除"
      : "自定义代码返回 true";
  }

  const description = `内容包含${formatQuotedList(condition.values, "尚未填写的关键词")}`;
  return condition.effect === "exclude" ? `排除${description}` : description;
}

export function describeFilterRule(
  conditions: FilterCondition[],
  chats: JoinedChat[] = [],
): string {
  if (conditions.length === 0) return "尚未定义命中条件";
  return conditions.map((condition) => describeFilterCondition(condition, chats)).join("，并且");
}
