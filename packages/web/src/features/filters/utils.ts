import type { FilterCondition, FilterConditionType } from "@/types";
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
