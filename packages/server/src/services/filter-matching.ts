export type FilterConditionType = "keyword" | "chat";

export interface FilterCondition {
  type: FilterConditionType;
  values: string[];
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
      .map((item) => ({
        type: item.type,
        values: Array.isArray(item.values)
          ? item.values
              .filter((value: unknown) => typeof value === "string")
              .map((value: string) => value.trim())
              .filter(Boolean)
          : [],
      }))
      .filter(
        (item): item is FilterCondition =>
          (item.type === "keyword" || item.type === "chat") &&
          item.values.length > 0,
      );
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
    if (!condition || !["keyword", "chat"].includes(condition.type)) {
      return { valid: false, error: "condition.type must be keyword or chat" };
    }

    if (!Array.isArray(condition.values) || condition.values.length === 0) {
      return { valid: false, error: "condition.values must be a non-empty array" };
    }

    if (condition.values.some((value) => typeof value !== "string" || !value.trim())) {
      return { valid: false, error: "condition.values must contain non-empty strings" };
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

    if (condition.type === "chat") {
      conditionMatched = condition.values.includes(input.chatId);
    }

    if (!conditionMatched) {
      return { matched: false, matchedKeyword: null };
    }
  }

  return { matched: true, matchedKeyword };
}
