import { forwardMatchedMessage } from "../notifier.js";
import { matchFilterConditions, parseConditions } from "../filter-matching.js";
import { emitMessageEvent } from "../messageEvents.js";
import { appLogger } from "../../shared/logging.js";
import { extractMediaInfo, getMessageTextContent, hasMessageContent } from "./media.js";
import {
  extractMessageContentLinks,
  serializeMessageContentLinks,
} from "./messageContentLinks.js";
import { createMessageIfAbsent } from "./messagePersistence.js";
import { buildTelegramLink, getMessageTimestampMs, getSenderSummary } from "./utils.js";

export interface ActiveMessageFilter {
  id: number;
  name: string;
  conditions: string;
}

export type MessageIngestionSource =
  | "live"
  | "live-edit"
  | "startup-catchup"
  | "reconnect-catchup"
  | "periodic-catchup";

export interface IngestTelegramMessageInput {
  message: any;
  chat: any;
  activeFilters: ActiveMessageFilter[];
  source: MessageIngestionSource;
  notify: boolean;
  emitEvent: boolean;
  runId?: string;
}

export type MessageIngestionResult = "created" | "duplicate" | "unmatched";

export interface MessageTimingFields {
  messageTimestampMs: number;
  messageDate: string;
  editTimestampMs: number | null;
  editDate: string | null;
  lagMs: number;
}

export function getMessageLagLogLevel(lagMs: number): "info" | "warn" | "error" {
  if (lagMs >= 5 * 60 * 1000) return "error";
  if (lagMs >= 60 * 1000) return "warn";
  return "info";
}

function parseTelegramTimestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Telegram TL 时间通常是秒；Date.now() 量级的值则按毫秒处理。
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getMessageTimingFields(message: any, nowMs = Date.now()): MessageTimingFields {
  const originalTimestampMs = getMessageTimestampMs(message);
  const messageTimestampMs = originalTimestampMs > 0 ? originalTimestampMs : nowMs;
  const parsedEditTimestampMs = parseTelegramTimestampMs(message?.editDate);
  const editTimestampMs = parsedEditTimestampMs > 0 ? parsedEditTimestampMs : null;
  const latestTelegramTimestampMs = editTimestampMs ?? messageTimestampMs;

  return {
    messageTimestampMs,
    messageDate: new Date(messageTimestampMs).toISOString(),
    editTimestampMs,
    editDate: editTimestampMs ? new Date(editTimestampMs).toISOString() : null,
    lagMs: Math.max(0, nowMs - latestTelegramTimestampMs),
  };
}

export function findFirstMatchingFilter(
  chatId: string,
  content: string,
  filters: ActiveMessageFilter[],
): { filter: ActiveMessageFilter; matchedKeyword: string | null } | null {
  for (const filter of filters) {
    const conditions = parseConditions(filter.conditions);
    if (conditions.length === 0) continue;

    const match = matchFilterConditions({ chatId, content }, conditions);
    if (match.error) {
      // 实时链路遇到单条自定义脚本错误时跳过该规则，继续尝试后续规则。
      appLogger.warn(
        {
          event: "filter.script.execution_failed",
          filterId: filter.id,
          err: match.error,
        },
        "Custom filter script execution failed",
      );
      continue;
    }
    if (match.matched) {
      return { filter, matchedKeyword: match.matchedKeyword };
    }
  }

  return null;
}

/** 由实时监听和历史回补共用的唯一消息入库入口。 */
export async function ingestTelegramMessage(
  input: IngestTelegramMessageInput,
): Promise<MessageIngestionResult> {
  const { message, chat, activeFilters } = input;
  if (!message || !chat || !hasMessageContent(message) || activeFilters.length === 0) {
    return "unmatched";
  }

  const chatId = chat.id?.toString?.() || "";
  if (!chatId) return "unmatched";

  const textContent = getMessageTextContent(message);
  const matched = findFirstMatchingFilter(chatId, textContent, activeFilters);
  if (!matched) return "unmatched";

  const chatTitle = chat.title || chat.firstName || chat.username || chatId;
  const mediaInfo = extractMediaInfo(message);
  const contentLinks = extractMessageContentLinks(message, textContent);
  const telegramLink = buildTelegramLink(chatId, chat, message.id);
  const sender = typeof message.getSender === "function"
    ? await message.getSender()
    : message.sender;
  const { senderName, senderId } = getSenderSummary(sender);
  const receivedAtMs = Date.now();
  const timing = getMessageTimingFields(message, receivedAtMs);

  const rowId = await createMessageIfAbsent({
    telegramMessageId: message.id,
    chatId,
    chatTitle,
    senderName,
    senderId,
    content: textContent,
    contentLinks: serializeMessageContentLinks(contentLinks),
    messageDate: timing.messageDate,
    telegramLink,
    isRead: false,
    matchedFilterId: matched.filter.id,
    matchedKeyword: matched.matchedKeyword,
    createdAt: new Date().toISOString(),
    ...(mediaInfo && {
      mediaType: mediaInfo.mediaType,
      mediaFileName: mediaInfo.mediaFileName,
      mediaFileSize: mediaInfo.mediaFileSize,
      mediaMimeType: mediaInfo.mediaMimeType,
      mediaDuration: mediaInfo.mediaDuration,
      mediaThumbBase64: mediaInfo.mediaThumbBase64,
      mediaExtra: mediaInfo.mediaExtra,
    }),
  });

  if (rowId === null) return "duplicate";

  let notifyStatus: "not-requested" | "no-targets" | "queued" | "queue-failed" =
    "not-requested";
  let notifyTargetCount = 0;
  if (input.notify) {
    try {
      notifyTargetCount = await forwardMatchedMessage({
        filterId: matched.filter.id,
        filterName: matched.filter.name,
        matchedKeyword: matched.matchedKeyword,
        chatTitle,
        senderName,
        senderId,
        content: textContent || (mediaInfo ? `[${mediaInfo.mediaType}]` : ""),
        messageDate: timing.messageDate,
        telegramLink,
        messageKey: `${chatId}:${message.id}`,
        rowId,
      });
      notifyStatus = notifyTargetCount > 0 ? "queued" : "no-targets";
    } catch (error) {
      notifyStatus = "queue-failed";
      appLogger.error(
        {
          err: error,
          event: "notification.forward.queue_failed",
          messageKey: `${chatId}:${message.id}`,
          rowId,
          filterId: matched.filter.id,
        },
        "Failed to queue matched message notifications",
      );
    }
  }

  if (input.emitEvent) {
    emitMessageEvent({ type: "new" });
  }

  const logPayload = {
    event: "telegram.message.saved",
    source: input.source,
    runId: input.runId ?? null,
    messageKey: `${chatId}:${message.id}`,
    rowId,
    chatId,
    telegramMessageId: Number(message.id),
    filterId: matched.filter.id,
    mediaType: mediaInfo?.mediaType ?? null,
    telegramDate: timing.messageDate,
    editDate: timing.editDate,
    receivedAt: new Date(receivedAtMs).toISOString(),
    savedAt: new Date().toISOString(),
    lagMs: timing.lagMs,
    notifyStatus,
    notifyTargetCount,
  };
  const lagLogLevel = getMessageLagLogLevel(timing.lagMs);
  if (lagLogLevel === "error") {
    appLogger.error(logPayload, "Telegram message was saved with severe delay");
  } else if (lagLogLevel === "warn") {
    appLogger.warn(logPayload, "Telegram message was saved with delay");
  } else {
    appLogger.info(logPayload, "Telegram message saved");
  }

  return "created";
}
