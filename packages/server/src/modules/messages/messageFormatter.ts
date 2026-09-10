import type { Prisma } from "../../generated/prisma/client.js";
import { parseMessageContentLinks } from "../../services/telegram/messageContentLinks.js";

/** include 子查询：关联 filter 名称 */
export const MESSAGE_INCLUDE = {
  matchedFilter: { select: { name: true } },
  filterMemberships: {
    select: {
      filterId: true,
      matchedKeyword: true,
      filter: { select: { name: true } },
    },
    orderBy: { filterId: "asc" },
  },
} as const;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/** 将 DB row 格式化为 API 响应格式 */
export function formatMessageRow(
  row: MessageRow,
  interactedReadIds: Set<number>,
  filterId?: number,
) {
  const filterMatches = row.filterMemberships.map((membership) => ({
    filterId: membership.filterId,
    filterName: membership.filter.name,
    matchedKeyword: membership.matchedKeyword,
  }));
  // 当前规则的列表始终展示该归属，兼容字段不再让其它规则覆盖它。
  const match = filterMatches.find((membership) => membership.filterId === (filterId ?? row.matchedFilterId))
    ?? filterMatches[0];
  return {
    id: row.id,
    telegramMessageId: row.telegramMessageId,
    chatId: row.chatId,
    chatTitle: row.chatTitle,
    senderName: row.senderName,
    senderId: row.senderId,
    senderUserId: row.senderUserId ?? null,
    content: row.content,
    contentLinks: parseMessageContentLinks(row.contentLinks),
    messageDate: row.messageDate,
    telegramLink: row.telegramLink,
    isRead: interactedReadIds.has(row.id) ? true : row.isRead,
    matchedFilterId: match?.filterId ?? row.matchedFilterId,
    matchedKeyword: match ? match.matchedKeyword : row.matchedKeyword,
    createdAt: row.createdAt,
    filterName: match?.filterName ?? row.matchedFilter?.name ?? null,
    filterMatches,
    mediaType: row.mediaType ?? null,
    mediaFileName: row.mediaFileName ?? null,
    mediaFileSize: row.mediaFileSize ?? null,
    mediaMimeType: row.mediaMimeType ?? null,
    mediaDuration: row.mediaDuration ?? null,
    mediaThumbBase64: row.mediaThumbBase64 ?? null,
    mediaExtra: row.mediaExtra ?? null,
  };
}
