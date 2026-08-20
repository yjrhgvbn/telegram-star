import { Script } from "node:vm";
import type { FilterCondition } from "@telegram-star/shared/contracts/filters";

export type {
  FilterCondition,
  FilterConditionEffect,
  FilterConditionType,
} from "@telegram-star/shared/contracts/filters";

const SUPPORTED_CONDITION_TYPES = ["keyword", "chat", "regex", "script"] as const;
const SUPPORTED_CONDITION_EFFECTS = ["require", "exclude"] as const;
const SCRIPT_SOURCE_MAX_LENGTH = 20_000;
const SCRIPT_EXECUTION_TIMEOUT_MS = 25;
const SCRIPT_CACHE_MAX_ENTRIES = 100;
const scriptCache = new Map<string, Script>();

function isSupportedConditionType(type: unknown): type is FilterCondition["type"] {
  return SUPPORTED_CONDITION_TYPES.includes(type as FilterCondition["type"]);
}

function isSupportedConditionEffect(
  effect: unknown,
): effect is NonNullable<FilterCondition["effect"]> {
  return SUPPORTED_CONDITION_EFFECTS.includes(
    effect as NonNullable<FilterCondition["effect"]>,
  );
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

function compileScript(source: string): Script {
  const cached = scriptCache.get(source);
  if (cached) {
    // Map 的插入顺序同时作为轻量 LRU，避免频繁使用的脚本被优先淘汰。
    scriptCache.delete(source);
    scriptCache.set(source, cached);
    return cached;
  }

  const script = new Script(
    `((message) => {\n"use strict";\n${source}\n})(message)`,
    { filename: "telegram-star-filter.js" },
  );
  scriptCache.set(source, script);

  if (scriptCache.size > SCRIPT_CACHE_MAX_ENTRIES) {
    const oldestSource = scriptCache.keys().next().value;
    if (oldestSource !== undefined) scriptCache.delete(oldestSource);
  }

  return script;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ScriptConditionResult {
  matched: boolean;
  matchedText: string | null;
}

function executeScriptCondition(
  source: string,
  input: FilterMatchInput,
): ScriptConditionResult {
  const script = compileScript(source);
  const result = script.runInNewContext(
    {
      message: Object.freeze({ chatId: input.chatId, content: input.content }),
    },
    {
      timeout: SCRIPT_EXECUTION_TIMEOUT_MS,
      microtaskMode: "afterEvaluate",
    },
  ) as unknown;

  if (typeof result === "boolean") {
    return { matched: result, matchedText: null };
  }

  if (result && typeof result === "object" && "then" in result) {
    throw new Error("自定义脚本必须同步返回，不能返回 Promise");
  }

  if (!result || typeof result !== "object" || !("matched" in result)) {
    throw new Error("自定义脚本必须返回 boolean 或 { matched, matchedText? }");
  }

  const candidate = result as { matched?: unknown; matchedText?: unknown };
  if (typeof candidate.matched !== "boolean") {
    throw new Error("自定义脚本返回对象的 matched 必须是 boolean");
  }

  const matchedText = typeof candidate.matchedText === "string"
    ? candidate.matchedText.trim().slice(0, 500) || null
    : null;

  return { matched: candidate.matched, matchedText };
}

interface SingleConditionMatch {
  matched: boolean;
  matchedText: string | null;
}

function matchSingleCondition(
  input: FilterMatchInput,
  condition: FilterCondition,
): SingleConditionMatch {
  if (condition.type === "keyword") {
    const normalizedContent = input.content.toLowerCase();
    const keyword = condition.values.find((value) =>
      normalizedContent.includes(value.toLowerCase()),
    );
    return { matched: keyword !== undefined, matchedText: keyword ?? null };
  }

  if (condition.type === "regex") {
    for (const pattern of condition.values) {
      if (!isValidRegexPattern(pattern)) continue;
      if (new RegExp(pattern, "i").test(input.content)) {
        return { matched: true, matchedText: pattern };
      }
    }
    return { matched: false, matchedText: null };
  }

  if (condition.type === "chat") {
    return {
      matched: condition.values.includes(input.chatId),
      matchedText: null,
    };
  }

  if (condition.values.length !== 1) {
    throw new Error("自定义脚本条件必须且只能包含一段代码");
  }

  return executeScriptCondition(condition.values[0], input);
}

export interface FilterMatchInput {
  chatId: string;
  content: string;
}

export interface FilterMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
  error?: string;
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

        const effect = item.effect === undefined || item.effect === "require"
          ? undefined
          : isSupportedConditionEffect(item.effect)
            ? item.effect
            : null;
        if (effect === null || (item.type === "chat" && effect === "exclude")) return null;

        return {
          type: item.type,
          ...(effect === "exclude" ? { effect } : {}),
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
      ...(condition.effect === "exclude" ? { effect: condition.effect } : {}),
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
      return { valid: false, error: "condition.type must be keyword, chat, regex, or script" };
    }

    if (condition.effect !== undefined && !isSupportedConditionEffect(condition.effect)) {
      return { valid: false, error: "condition.effect must be require or exclude" };
    }

    if (condition.type === "chat" && condition.effect === "exclude") {
      return { valid: false, error: "chat conditions cannot be excluded" };
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

    if (condition.type === "script") {
      if (condition.values.length !== 1) {
        return { valid: false, error: "condition.script must contain exactly one source value" };
      }

      const source = condition.values[0];
      if (source.length > SCRIPT_SOURCE_MAX_LENGTH) {
        return { valid: false, error: "condition.script source must not exceed 20000 characters" };
      }

      try {
        compileScript(source);
      } catch (error) {
        return {
          valid: false,
          error: `condition.script source is invalid: ${getErrorMessage(error)}`,
        };
      }
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

  for (const condition of conditions) {
    try {
      const conditionMatch = matchSingleCondition(input, condition);
      const conditionMatched = condition.effect === "exclude"
        ? !conditionMatch.matched
        : conditionMatch.matched;

      if (!conditionMatched) {
        return { matched: false, matchedKeyword: null };
      }

      if (condition.effect !== "exclude" && conditionMatch.matchedText) {
        matchedKeyword ??= conditionMatch.matchedText;
      }
    } catch (error) {
      return {
        matched: false,
        matchedKeyword: null,
        error: `自定义脚本执行失败：${getErrorMessage(error)}`,
      };
    }
  }

  return { matched: true, matchedKeyword };
}
