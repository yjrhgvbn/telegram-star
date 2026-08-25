import type { HistoricalFilterPreviewMessage } from "@/types";

export interface PreviewHighlightRange {
  start: number;
  end: number;
}

const MAX_HIGHLIGHT_RANGES = 200;

export function cleanPreviewContent(content: string): string {
  return content
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 新服务端优先提供实际命中文本；旧服务端则回退到 matchedKeyword。
 * 两边都先使用与正文相同的清理方式，避免 Markdown 标记或换行导致漏高亮。
 */
export function getPreviewHighlightTexts(
  message: Pick<HistoricalFilterPreviewMessage, "matchedKeyword" | "matchEvidence">,
): string[] {
  const evidenceTexts = (message.matchEvidence ?? [])
    .filter((evidence) => evidence.passed && evidence.effect === "require")
    .flatMap((evidence) => evidence.matchedTexts);
  const candidates = evidenceTexts.length > 0
    ? evidenceTexts
    : message.matchedKeyword
      ? [message.matchedKeyword]
      : [];
  const unique = new Map<string, string>();

  for (const candidate of candidates) {
    const normalized = cleanPreviewContent(candidate);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (!unique.has(key)) unique.set(key, normalized);
  }

  // 先找长文本，让重叠命中合并后仍保留最完整的视觉范围。
  return Array.from(unique.values()).sort((a, b) => b.length - a.length);
}

export function getPreviewExclusionHighlightTexts(
  message: Pick<HistoricalFilterPreviewMessage, "matchEvidence">,
): string[] {
  const unique = new Map<string, string>();
  const candidates = (message.matchEvidence ?? [])
    .filter((evidence) => evidence.effect === "exclude" && !evidence.passed)
    .flatMap((evidence) => evidence.matchedTexts);

  for (const candidate of candidates) {
    const normalized = cleanPreviewContent(candidate);
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (!unique.has(key)) unique.set(key, normalized);
  }

  return Array.from(unique.values()).sort((a, b) => b.length - a.length);
}

export function findPreviewHighlightRanges(
  content: string,
  highlightTexts: string[],
): PreviewHighlightRange[] {
  const ranges: PreviewHighlightRange[] = [];

  for (const text of highlightTexts) {
    const expression = new RegExp(escapeRegExp(text), "gi");
    for (const match of content.matchAll(expression)) {
      if (match.index === undefined || !match[0]) continue;
      ranges.push({ start: match.index, end: match.index + match[0].length });
      if (ranges.length >= MAX_HIGHLIGHT_RANGES) break;
    }
    if (ranges.length >= MAX_HIGHLIGHT_RANGES) break;
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: PreviewHighlightRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }

  return merged;
}
