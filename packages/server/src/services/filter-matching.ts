import type { FilterCondition } from "@telegram-star/shared/contracts/filters";

export type { FilterCondition, FilterConditionType } from "@telegram-star/shared/contracts/filters";

const SUPPORTED_CONDITION_TYPES = ["keyword", "chat", "regex"] as const;

function isSupportedConditionType(type: unknown): type is FilterCondition["type"] {
  return SUPPORTED_CONDITION_TYPES.includes(type as FilterCondition["type"]);
}

function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function normalizeConditionValues(type: FilterCondition["type"], values: string[]): string[] {
  if (type !== "regex") return values;
  return values.filter(isValidRegexPattern);
}

export interface FilterMatchInput {
  chatId: string;
  content: string;
}

export interface FilterMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

export function parseConditions(raw: string): FilterCondition[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        if (!isSupportedConditionType(item.type)) return null;

        const values = Array.isArray(item.values)
          ? item.values
              .filter((value: unknown) => typeof value === "string")
              .map((value: string) => value.trim())
              .filter(Boolean)
          : [];

        return {
          type: item.type,
          values: normalizeConditionValues(item.type, values),
        };
      })
      .filter((item): item is FilterCondition => item !== null && item.values.length > 0);
  } catch {
    return [];
  }
}

export function serializeConditions(conditions: FilterCondition[]): string {
  return JSON.stringify(
    conditions.map((condition) => ({
      type: condition.type,
      values: condition.values.map((value) => value.trim()).filter(Boolean),
    })),
  );
}

export function validateConditions(conditions: FilterCondition[]): { valid: boolean; error?: string } {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { valid: false, error: "conditions is required" };
  }

  for (const condition of conditions) {
    if (!condition || !isSupportedConditionType(condition.type)) {
      return { valid: false, error: "condition.type must be keyword, chat, or regex" };
    }

    if (!Array.isArray(condition.values) || condition.values.length === 0) {
      return { valid: false, error: "condition.values must be a non-empty array" };
    }

    if (condition.values.some((value) => typeof value !== "string" || !value.trim())) {
      return { valid: false, error: "condition.values must contain non-empty strings" };
    }

    if (condition.type === "regex" && condition.values.some((value) => !isValidRegexPattern(value))) {
      return { valid: false, error: "condition.regex values must be valid regular expressions" };
    }
  }

  return { valid: true };
}

export function hasConflictingChatConditions(conditions: FilterCondition[]): boolean {
  return conditions.filter((condition) => condition.type === "chat").length > 1;
}

export function matchFilterConditions(
  input: FilterMatchInput,
  conditions: FilterCondition[],
): FilterMatchResult {
  if (conditions.length === 0) {
    return { matched: false, matchedKeyword: null };
  }

  let matchedKeyword: string | null = null;
  const normalizedContent = input.content.toLowerCase();

  for (const condition of conditions) {
    let conditionMatched = false;

    if (condition.type === "keyword") {
      for (const keyword of condition.values) {
        if (normalizedContent.includes(keyword.toLowerCase())) {
          conditionMatched = true;
          matchedKeyword ??= keyword;
          break;
        }
      }
    }

    if (condition.type === "regex") {
      for (const pattern of condition.values) {
        if (!isValidRegexPattern(pattern)) continue;

        const regex = new RegExp(pattern, "i");
        if (regex.test(input.content)) {
          conditionMatched = true;
          matchedKeyword ??= pattern;
          break;
        }
      }
    }

    if (condition.type === "chat") {
      conditionMatched = condition.values.includes(input.chatId);
    }

    if (!conditionMatched) {
      return { matched: false, matchedKeyword: null };
    }
  }

  return { matched: true, matchedKeyword };
}
