import {
  clearCache as clearPretextCache,
  measureLineStats,
  prepareWithSegments,
} from "@chenglou/pretext";
import type { Message } from "@/types";

export type MessageHeightEstimateInput = Pick<Message, "content" | "mediaType" | "mediaExtra">;

export interface MessageHeightEstimateOptions {
  containerWidth?: number;
  viewportWidth?: number;
  measureLineCount?: (paragraph: string, availableWidth: number) => number;
}

const DEFAULT_CONTAINER_WIDTH = 400;
const DEFAULT_VIEWPORT_WIDTH = 1024;
const MAX_MESSAGE_LIST_WIDTH = 980;
const MOBILE_BREAKPOINT = 640;
const MIN_CONTENT_WIDTH = 100;
const TEXT_PREVIEW_LIMIT = 360;
const TEXT_LINE_HEIGHT = 22;
const CONTENT_BLOCK_GAP = 10;

// This font string must stay in sync with the app's global message text font.
// Even small drift here shows up as virtual-scroll compensation errors.
const MESSAGE_TEXT_FONT =
  '14px "Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/**
 * Estimate one rendered message-card height for TanStack Virtual.
 *
 * The estimator mirrors CSS chrome, media blocks and text wrapping. It is kept
 * pure so scroll compensation can be covered by fast tests without mounting the
 * virtual list.
 */
export function estimateMessageItemHeight(
  message: MessageHeightEstimateInput,
  options: MessageHeightEstimateOptions = {},
): number {
  const viewportWidth = options.viewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
  const containerWidth = getMessageListEstimateWidth(options.containerWidth);
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;

  // Base height includes card chrome, header, action row and sub-pixel spacing.
  const fixedBaseHeight = isMobile ? 168.35 : 122.66;
  const horizontalPadding = isMobile ? 48 : 56;
  const availableWidth = Math.max(MIN_CONTENT_WIDTH, containerWidth - horizontalPadding);

  let height = fixedBaseHeight;
  let variableBlocks = 0;

  const mediaHeight = estimateMediaHeight(message, availableWidth);
  if (mediaHeight > 0) {
    variableBlocks++;
    height += mediaHeight;
  }

  const textHeight = estimateTextHeight(message.content, availableWidth, options.measureLineCount);
  if (textHeight > 0) {
    variableBlocks++;
    height += textHeight;
  }

  return height + variableBlocks * CONTENT_BLOCK_GAP;
}

/**
 * The rendered message column is capped at 980px. Keeping the same cap in the
 * estimator prevents wide desktop layouts from underestimating wrapped text.
 */
export function getMessageListEstimateWidth(containerWidth?: number): number {
  if (containerWidth === undefined || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return DEFAULT_CONTAINER_WIDTH;
  }

  return Math.min(containerWidth, MAX_MESSAGE_LIST_WIDTH);
}

/** Clear font metrics after the webfont becomes ready. */
export function clearMessageHeightEstimateCache() {
  clearPretextCache();
}

function estimateMediaHeight(message: MessageHeightEstimateInput, availableWidth: number): number {
  switch (message.mediaType) {
    case "photo":
    case "video":
    case "videoNote":
    case "gif":
      return estimateVisualMediaHeight(message.mediaExtra, availableWidth);
    case "sticker":
      return 160;
    case "document":
    case "audio":
    case "voice":
    case "contact":
    case "geo":
    case "poll":
      return 54;
    default:
      return 0;
  }
}

function estimateVisualMediaHeight(mediaExtra: string | null, availableWidth: number): number {
  const extra = parseMediaExtra(mediaExtra);
  const width = Number(extra.w);
  const height = Number(extra.h);

  if (width > 0 && height > 0) {
    return Math.min(360, Math.max(80, (availableWidth * height) / width));
  }

  return 240;
}

function parseMediaExtra(mediaExtra: string | null): Record<string, unknown> {
  if (!mediaExtra) return {};

  try {
    const parsed = JSON.parse(mediaExtra);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function estimateTextHeight(
  content: string,
  availableWidth: number,
  measureLineCount = measureParagraphLineCount,
): number {
  const trimmedContent = content.trim();
  if (!trimmedContent) return 0;

  const previewText =
    trimmedContent.slice(0, TEXT_PREVIEW_LIMIT) +
    (trimmedContent.length > TEXT_PREVIEW_LIMIT ? "..." : "");

  let totalLines = 0;
  for (const paragraph of previewText.split("\n")) {
    if (!paragraph) {
      totalLines += 1;
      continue;
    }

    totalLines += Math.max(1, measureLineCount(paragraph, availableWidth));
  }

  return totalLines * TEXT_LINE_HEIGHT;
}

function measureParagraphLineCount(paragraph: string, availableWidth: number): number {
  const prepared = prepareWithSegments(paragraph, MESSAGE_TEXT_FONT);
  return measureLineStats(prepared, availableWidth).lineCount;
}
