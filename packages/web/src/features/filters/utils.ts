import type {
  FilterCondition,
  FilterConditionType,
  HistoricalFilterPreviewMessage,
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
    values: [],
    input: "",
  };
}

export function toDraftConditions(conditions: FilterCondition[]): DraftCondition[] {
  if (conditions.length === 0) {
    return [createDraftCondition()];
  }

  return conditions.map((condition, index) => ({
    id: `${condition.type}-${index}-${Math.random().toString(36).slice(2, 10)}`,
    type: condition.type,
    values: [...condition.values],
    input: "",
  }));
}

export function normalizeConditions(conditions: DraftCondition[]): FilterCondition[] {
  return conditions
    .map((condition) => ({
      type: condition.type,
      values: (
        // 关键词条件允许"输入框未点添加就直接保存"，把暂存输入一并并入最终值
        condition.type === "keyword"
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
        .filter(Boolean),
    }))
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

export function describeFilterCondition(
  condition: FilterCondition,
  chats: JoinedChat[] = [],
): string {
  if (condition.type === "chat") {
    return `消息来自${formatQuotedList(resolveChatNames(condition.values, chats), "任一已加入会话")}`;
  }

  if (condition.type === "regex") {
    return `内容匹配${formatQuotedList(condition.values, "尚未填写的正则表达式")}`;
  }

  return `内容包含${formatQuotedList(condition.values, "尚未填写的关键词")}`;
}

export function describeFilterRule(
  conditions: FilterCondition[],
  chats: JoinedChat[] = [],
): string {
  if (conditions.length === 0) return "尚未定义命中条件";
  return conditions.map((condition) => describeFilterCondition(condition, chats)).join("，并且");
}

export type ConditionEvidence = {
  type: FilterConditionType;
  label: string;
  detail: string;
  matched: boolean;
};

export function evaluatePreviewMessage(
  message: Pick<HistoricalFilterPreviewMessage, "chatId" | "content">,
  conditions: FilterCondition[],
  chats: JoinedChat[] = [],
): ConditionEvidence[] {
  const normalizedContent = message.content.toLowerCase();

  return conditions.map((condition) => {
    if (condition.type === "chat") {
      const matched = condition.values.includes(message.chatId);
      return {
        type: condition.type,
        label: "消息来源",
        detail: matched
          ? `来自${formatQuotedList(resolveChatNames([message.chatId], chats), message.chatId)}`
          : `需要来自${formatQuotedList(resolveChatNames(condition.values, chats), "指定会话")}`,
        matched,
      };
    }

    if (condition.type === "regex") {
      const matchedPattern = condition.values.find((pattern) => {
        try {
          return new RegExp(pattern, "i").test(message.content);
        } catch {
          return false;
        }
      });
      return {
        type: condition.type,
        label: "正则匹配",
        detail: matchedPattern ? `匹配「${matchedPattern}」` : "没有表达式匹配",
        matched: Boolean(matchedPattern),
      };
    }

    const matchedKeyword = condition.values.find((keyword) =>
      normalizedContent.includes(keyword.toLowerCase()),
    );
    return {
      type: condition.type,
      label: "内容条件",
      detail: matchedKeyword ? `包含「${matchedKeyword}」` : "没有关键词出现",
      matched: Boolean(matchedKeyword),
    };
  });
}
