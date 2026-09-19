import type { MessageListQuery } from "@telegram-star/shared/contracts/messages";
import type { Prisma } from "../../generated/prisma/client.js";

export interface MessageCursorPosition {
  id: number;
  messageDate: string;
  telegramMessageId: number;
}

/** 构建基础过滤条件（不含游标） */
export function buildMessageBaseWhere(
  query: Pick<MessageListQuery, "isRead" | "filterId" | "search">,
): Prisma.MessageWhereInput {
  const where: Prisma.MessageWhereInput = {};
  if (query.isRead !== undefined) {
    where.isRead = query.isRead;
  }
  if (query.filterId !== undefined) {
    where.filterMemberships = { some: { filterId: query.filterId } };
  }
  if (query.search) {
    where.content = { contains: query.search };
  }
  return where;
}

export function buildBeforeCursorWhere(
  baseWhere: Prisma.MessageWhereInput,
  cursor: MessageCursorPosition,
): Prisma.MessageWhereInput {
  return {
    AND: [
      baseWhere,
      buildCursorBoundary(cursor, "before"),
    ],
  };
}

export function buildAfterCursorWhere(
  baseWhere: Prisma.MessageWhereInput,
  cursor: MessageCursorPosition,
): Prisma.MessageWhereInput {
  return {
    AND: [
      baseWhere,
      buildCursorBoundary(cursor, "after"),
    ],
  };
}

function buildCursorBoundary(
  cursor: MessageCursorPosition,
  direction: "before" | "after",
): Prisma.MessageWhereInput {
  const dateOperator = direction === "before" ? "lt" : "gt";
  const messageIdOperator = direction === "before" ? "lt" : "gt";

  // Telegram IDs are only unique within a chat. The database row ID breaks ties
  // across chats that published the same message number in the same second.
  return {
    OR: [
      { messageDate: { [dateOperator]: cursor.messageDate } },
      {
        messageDate: cursor.messageDate,
        telegramMessageId: { [messageIdOperator]: cursor.telegramMessageId },
      },
      {
        messageDate: cursor.messageDate,
        telegramMessageId: cursor.telegramMessageId,
        id: { [messageIdOperator]: cursor.id },
      },
    ],
  };
}
