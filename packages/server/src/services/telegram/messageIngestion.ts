import { forwardMatchedMessage } from "../notifier.js";
import { matchFilterConditions, parseConditions } from "../filter-matching.js";
import { emitMessageEvent } from "../messageEvents.js";
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

export type MessageIngestionSource = "live" | "startup-catchup" | "reconnect-catchup" | "periodic-catchup";

export interface IngestTelegramMessageInput {
  message: any;
  chat: any;
  activeFilters: ActiveMessageFilter[];
  source: MessageIngestionSource;
  notify: boolean;
  emitEvent: boolean;
}

export type MessageIngestionResult = "created" | "duplicate" | "unmatched";

export function findFirstMatchingFilter(
  chatId: string,
  content: string,
  filters: ActiveMessageFilter[],
): { filter: ActiveMessageFilter; matchedKeyword: string | null } | null {
  for (const filter of filters) {
    const conditions = parseConditions(filter.conditions);
    if (conditions.length === 0) continue;

    const match = matchFilterConditions({ chatId, content }, conditions);
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
  const timestampMs = getMessageTimestampMs(message);
  const messageDate = new Date(timestampMs > 0 ? timestampMs : Date.now()).toISOString();

  const created = await createMessageIfAbsent({
    telegramMessageId: message.id,
    chatId,
    chatTitle,
    senderName,
    senderId,
    content: textContent,
    contentLinks: serializeMessageContentLinks(contentLinks),
    messageDate,
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

  if (!created) return "duplicate";

  if (input.notify) {
    await forwardMatchedMessage({
      filterId: matched.filter.id,
      filterName: matched.filter.name,
      matchedKeyword: matched.matchedKeyword,
      chatTitle,
      senderName,
      senderId,
      content: textContent || (mediaInfo ? `[${mediaInfo.mediaType}]` : ""),
      messageDate,
      telegramLink,
    });
  }

  if (input.emitEvent) {
    emitMessageEvent({ type: "new" });
  }

  console.log(
    `[Telegram][${input.source}] Saved message from "${chatTitle}" matching filter "${matched.filter.name}"${
      mediaInfo ? ` [${mediaInfo.mediaType}]` : ""
    }`,
  );

  return "created";
}
