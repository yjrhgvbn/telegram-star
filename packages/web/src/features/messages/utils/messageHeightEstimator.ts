import { clearCache as clearPretextCache, measureLineStats, prepareWithSegments } from "@chenglou/pretext";
import type { Message } from "@/types";
import { getMessageContentPreview } from "./messageContentPreview";
import { getVisualMediaRatio } from "./mediaPreviewMetadata";

export type MessageHeightEstimateInput = Pick<Message, "content" | "mediaType" | "mediaExtra"> & Partial<Pick<Message,
  "contentLinks" | "mediaFileName" | "mediaFileSize" | "chatTitle" | "senderName" | "telegramLink"
>>;
export interface MessageHeightEstimateOptions {
  containerWidth?: number;
  viewportWidth?: number;
  measureLineCount?: (paragraph: string, availableWidth: number) => number;
}

const DEFAULT_CONTAINER_WIDTH = 400;
const MAX_MESSAGE_TEXT_WIDTH = 800;
const MOBILE_BREAKPOINT = 640;
const TEXT_LINE_HEIGHT = 24;
const MESSAGE_TEXT_FONT = '14px "Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/** Mirrors MessageCard's container query, media sizing and footer actions. The
 * measured virtual row replaces this estimate after expansion or media loading. */
export function estimateMessageItemHeight(message: MessageHeightEstimateInput, options: MessageHeightEstimateOptions = {}): number {
  const viewportWidth = options.viewportWidth ?? 1024;
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const listWidth = getMessageListEstimateWidth(options.containerWidth);
  // Horizontal gutters belong to the list; the article adds no second inset.
  const gutter = viewportWidth <= 680 ? 14 : viewportWidth <= 900 ? 18 : 24;
  const queryWidth = Math.max(100, listWidth - gutter * 2);
  const mainWidth = Math.max(80, queryWidth - (isMobile ? 38 : 44));
  const hasText = Boolean(message.content.trim());
  const visual = ["photo", "video", "videoNote", "gif"].includes(message.mediaType || "");
  const parallel = queryWidth >= 700 && visual && hasText;
  // 28cqi is relative to the whole article, including its avatar column.
  const mediaWidth = parallel ? Math.min(360, Math.max(280, queryWidth * 0.28)) : Math.min(420, mainWidth);
  const textWidth = Math.min(MAX_MESSAGE_TEXT_WIDTH, parallel ? Math.max(80, mainWidth - mediaWidth - 32) : mainWidth);
  const textHeight = estimateTextHeight(message, textWidth, options.measureLineCount);
  const mediaHeight = estimateMediaHeight(message, mediaWidth);
  const bodyHeight = parallel ? Math.max(textHeight, mediaHeight) : textHeight + mediaHeight + (hasText && mediaHeight ? 12 : 0);
  const source = message.chatTitle || message.senderName || "Telegram";
  const senderLine = message.senderName && message.senderName !== source ? 20 : 0;
  // Padding + separator + source header + header gap + action gap + 44px actions.
  const fixedHeight = (isMobile ? 42 : 44) + 1 + 24 + senderLine + 12 + 16 + 44;
  const wrappedActions = message.telegramLink && mainWidth < 250 ? 48 : 0;
  return fixedHeight + bodyHeight + wrappedActions;
}

export function getMessageListEstimateWidth(containerWidth?: number): number {
  if (containerWidth === undefined || !Number.isFinite(containerWidth) || containerWidth <= 0) return DEFAULT_CONTAINER_WIDTH;
  return containerWidth;
}
export function clearMessageHeightEstimateCache() { clearPretextCache(); }

function estimateMediaHeight(message: MessageHeightEstimateInput, availableWidth: number): number {
  if (!message.mediaType) return 0;
  if (["photo", "video", "videoNote", "gif"].includes(message.mediaType)) {
    const ratio = getVisualMediaRatio(message.mediaExtra);
    let height = ratio ? Math.min(280, Math.max(80, availableWidth / ratio)) : 240;
    if (message.mediaType !== "photo") {
      const metadataLines = Number(Boolean(message.mediaFileName)) + Number(Boolean(message.mediaFileSize && message.mediaFileSize > 0));
      if (metadataLines) height += 8 + metadataLines * 18 + (metadataLines - 1) * 2;
    }
    return height;
  }
  return message.mediaType === "sticker" ? 160 : 64;
}
function estimateTextHeight(message: MessageHeightEstimateInput, availableWidth: number, measureLineCount = measureParagraphLineCount): number {
  if (!message.content.trim()) return 0;
  const preview = getMessageContentPreview(message.content, message.contentLinks);
  let totalLines = 0;
  const text = preview.text + (preview.truncated ? "…" : "");
  for (const paragraph of text.split("\n")) totalLines += paragraph ? Math.max(1, measureLineCount(paragraph, availableWidth)) : 1;
  return totalLines * TEXT_LINE_HEIGHT + (preview.truncated ? 40 : 0);
}
function measureParagraphLineCount(paragraph: string, availableWidth: number): number {
  return measureLineStats(prepareWithSegments(paragraph, MESSAGE_TEXT_FONT), availableWidth).lineCount;
}
