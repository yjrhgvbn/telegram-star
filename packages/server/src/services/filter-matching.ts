import { Script } from "node:vm";
import type {
  FilterCondition,
  FilterConditionType,
  FilterMatchEvidence,
} from "@telegram-star/shared/contracts/filters";

export type {
  FilterCondition,
  FilterConditionEffect,
  FilterConditionType,
} from "@telegram-star/shared/contracts/filters";

const SUPPORTED_CONDITION_EFFECTS = ["require", "exclude"] as const;
const SCRIPT_SOURCE_MAX_LENGTH = 20_000;
const SCRIPT_EXECUTION_TIMEOUT_MS = 25;
const SCRIPT_CACHE_MAX_ENTRIES = 100;
const MATCH_EVIDENCE_TEXT_LIMIT = 50;
const scriptCache = new Map<string, Script>();

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

function uniqueEvidenceTexts(values: unknown[]): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().slice(0, 500);
    if (!normalized) continue;
    unique.add(normalized);
    if (unique.size >= MATCH_EVIDENCE_TEXT_LIMIT) break;
  }

  return Array.from(unique);
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
  legacyMatchedText: string | null;
  matchedValues: string[];
  matchedTexts: string[];
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
    return {
      matched: result,
      legacyMatchedText: null,
      matchedValues: [],
      matchedTexts: [],
    };
  }

  if (result && typeof result === "object" && "then" in result) {
    throw new Error("自定义脚本必须同步返回，不能返回 Promise");
  }

  if (!result || typeof result !== "object" || !("matched" in result)) {
    throw new Error("自定义脚本必须返回 boolean 或 { matched, matchedText?, matchedTexts? }");
  }

  const candidate = result as {
    matched?: unknown;
    matchedText?: unknown;
    matchedTexts?: unknown;
  };
  if (typeof candidate.matched !== "boolean") {
    throw new Error("自定义脚本返回对象的 matched 必须是 boolean");
  }

  const matchedText = typeof candidate.matchedText === "string"
    ? candidate.matchedText.trim().slice(0, 500) || null
    : null;
  const matchedTexts = uniqueEvidenceTexts([
    ...(matchedText ? [matchedText] : []),
    ...(Array.isArray(candidate.matchedTexts) ? candidate.matchedTexts : []),
  ]);

  return {
    matched: candidate.matched,
    legacyMatchedText: matchedText ?? matchedTexts[0] ?? null,
    matchedValues: [],
    matchedTexts,
  };
}

interface SingleConditionMatch {
  matched: boolean;
  legacyMatchedText: string | null;
  matchedValues: string[];
  matchedTexts: string[];
}

interface ConditionHandler {
  allowsExclude: boolean;
  normalizeValues: (values: string[]) => string[];
  validate: (condition: FilterCondition) => string | null;
  evaluate: (input: FilterMatchInput, condition: FilterCondition) => SingleConditionMatch;
}

function createEmptyConditionMatch(matched = false): SingleConditionMatch {
  return {
    matched,
    legacyMatchedText: null,
    matchedValues: [],
    matchedTexts: [],
  };
}

function collectRegexMatches(pattern: string, content: string): string[] {
  const matches: string[] = [];
  const expression = new RegExp(pattern, "gi");

  for (const match of content.matchAll(expression)) {
    if (match[0]) matches.push(match[0]);
    if (matches.length >= MATCH_EVIDENCE_TEXT_LIMIT) break;
  }

  return uniqueEvidenceTexts(matches);
}

/**
 * 条件处理器注册表是服务端匹配逻辑的扩展边界。新增条件类型时，
 * TypeScript 会要求在这里同时提供归一化、校验和执行逻辑。
 */
const conditionHandlers = {
  keyword: {
    allowsExclude: true,
    normalizeValues: (values) => values,
    validate: () => null,
    evaluate: (input, condition) => {
      const normalizedContent = input.content.toLocaleLowerCase();
      const matchedValues = condition.values.filter((value) =>
        normalizedContent.includes(value.toLocaleLowerCase()),
      );

      return {
        matched: matchedValues.length > 0,
        legacyMatchedText: matchedValues[0] ?? null,
        matchedValues: uniqueEvidenceTexts(matchedValues),
        // 前端会据此查找全部出现位置，不需要为重复词膨胀响应体。
        matchedTexts: uniqueEvidenceTexts(matchedValues),
      };
    },
  },
  chat: {
    allowsExclude: false,
    normalizeValues: (values) => values,
    validate: () => null,
    evaluate: (input, condition) => {
      const matched = condition.values.includes(input.chatId);
      return {
        ...createEmptyConditionMatch(matched),
        matchedValues: matched ? [input.chatId] : [],
      };
    },
  },
  regex: {
    allowsExclude: true,
    normalizeValues: (values) => values.filter(isValidRegexPattern),
    validate: (condition) => condition.values.some((value) => !isValidRegexPattern(value))
      ? "condition.regex values must be valid regular expressions"
      : null,
    evaluate: (input, condition) => {
      const matchedValues: string[] = [];
      const matchedTexts: string[] = [];

      for (const pattern of condition.values) {
        if (!isValidRegexPattern(pattern)) continue;
        const firstMatch = new RegExp(pattern, "i").exec(input.content);
        if (!firstMatch) continue;

        matchedValues.push(pattern);
        matchedTexts.push(...collectRegexMatches(pattern, input.content));
      }

      return {
        matched: matchedValues.length > 0,
        // 保留旧语义：消息表与通知模板仍记录第一条命中的表达式。
        legacyMatchedText: matchedValues[0] ?? null,
        matchedValues: uniqueEvidenceTexts(matchedValues),
        matchedTexts: uniqueEvidenceTexts(matchedTexts),
      };
    },
  },
  script: {
    allowsExclude: true,
    normalizeValues: (values) => values,
    validate: (condition) => {
      if (condition.values.length !== 1) {
        return "condition.script must contain exactly one source value";
      }

      const source = condition.values[0];
      if (source.length > SCRIPT_SOURCE_MAX_LENGTH) {
        return "condition.script source must not exceed 20000 characters";
      }

      try {
        compileScript(source);
        return null;
      } catch (error) {
        return `condition.script source is invalid: ${getErrorMessage(error)}`;
      }
    },
    evaluate: (input, condition) => {
      if (condition.values.length !== 1) {
        throw new Error("自定义脚本条件必须且只能包含一段代码");
      }
      return executeScriptCondition(condition.values[0], input);
    },
  },
} satisfies Record<FilterConditionType, ConditionHandler>;

function isSupportedConditionType(type: unknown): type is FilterConditionType {
  return typeof type === "string" && Object.hasOwn(conditionHandlers, type);
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

export interface FilterEvaluationResult extends FilterMatchResult {
  evidence: FilterMatchEvidence[];
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
        if (
          effect === null ||
          (effect === "exclude" && !conditionHandlers[item.type].allowsExclude)
        ) {
          return null;
        }

        return {
          type: item.type,
          ...(effect === "exclude" ? { effect } : {}),
          values: conditionHandlers[item.type].normalizeValues(values),
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

    if (!Array.isArray(condition.values) || condition.values.length === 0) {
      return { valid: false, error: "condition.values must be a non-empty array" };
    }

    if (condition.values.some((value) => typeof value !== "string" || !value.trim())) {
      return { valid: false, error: "condition.values must contain non-empty strings" };
    }

    const handler = conditionHandlers[condition.type];
    if (condition.effect === "exclude" && !handler.allowsExclude) {
      return { valid: false, error: `${condition.type} conditions cannot be excluded` };
    }

    const handlerError = handler.validate(condition);
    if (handlerError) {
      return { valid: false, error: handlerError };
    }
  }

  return { valid: true };
}

export function hasConflictingChatConditions(conditions: FilterCondition[]): boolean {
  return conditions.filter((condition) => condition.type === "chat").length > 1;
}

export function evaluateFilterConditions(
  input: FilterMatchInput,
  conditions: FilterCondition[],
): FilterEvaluationResult {
  if (conditions.length === 0) {
    return { matched: false, matchedKeyword: null, evidence: [] };
  }

  let matchedKeyword: string | null = null;
  const evidence: FilterMatchEvidence[] = [];

  for (const [conditionIndex, condition] of conditions.entries()) {
    try {
      const conditionMatch = conditionHandlers[condition.type].evaluate(input, condition);
      const conditionMatched = condition.effect === "exclude"
        ? !conditionMatch.matched
        : conditionMatch.matched;

      evidence.push({
        conditionIndex,
        type: condition.type,
        effect: condition.effect ?? "require",
        passed: conditionMatched,
        matchedValues: conditionMatch.matchedValues,
        matchedTexts: conditionMatch.matchedTexts,
      });

      if (!conditionMatched) {
        return { matched: false, matchedKeyword: null, evidence };
      }

      if (condition.effect !== "exclude" && conditionMatch.legacyMatchedText) {
        matchedKeyword ??= conditionMatch.legacyMatchedText;
      }
    } catch (error) {
      return {
        matched: false,
        matchedKeyword: null,
        evidence,
        error: `自定义脚本执行失败：${getErrorMessage(error)}`,
      };
    }
  }

  return { matched: true, matchedKeyword, evidence };
}

/**
 * 兼容现有实时监听、回填和通知链路，只暴露原有的匹配结果字段。
 * 需要解释或高亮时使用 evaluateFilterConditions 获取完整证据。
 */
export function matchFilterConditions(
  input: FilterMatchInput,
  conditions: FilterCondition[],
): FilterMatchResult {
  const { evidence: _evidence, ...result } = evaluateFilterConditions(input, conditions);
  return result;
}
