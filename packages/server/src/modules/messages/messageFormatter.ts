import type { Prisma } from "../../generated/prisma/client.js";
import { parseMessageContentLinks } from "../../services/telegram/messageContentLinks.js";

/** include 子查询：关联 filter 名称 */
export const MESSAGE_INCLUDE = { matchedFilter: { select: { name: true } } } as const;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** 将 DB row 格式化为 API 响应格式 */
export function formatMessageRow(
  row: MessageRow,
  interactedReadIds: Set<number>,
) {
  return {
    id: row.id,
    telegramMessageId: row.telegramMessageId,
    chatId: row.chatId,
    chatTitle: row.chatTitle,
    senderName: row.senderName,
    senderId: row.senderId,
    content: row.content,
    contentLinks: parseMessageContentLinks(row.contentLinks),
    messageDate: row.messageDate,
    telegramLink: row.telegramLink,
    isRead: interactedReadIds.has(row.id) ? true : row.isRead,
    matchedFilterId: row.matchedFilterId,
    matchedKeyword: row.matchedKeyword,
    createdAt: row.createdAt,
    filterName: row.matchedFilter?.name ?? null,
    mediaType: row.mediaType ?? null,
    mediaFileName: row.mediaFileName ?? null,
    mediaFileSize: row.mediaFileSize ?? null,
    mediaMimeType: row.mediaMimeType ?? null,
    mediaDuration: row.mediaDuration ?? null,
    mediaThumbBase64: row.mediaThumbBase64 ?? null,
    mediaExtra: row.mediaExtra ?? null,
  };
}
