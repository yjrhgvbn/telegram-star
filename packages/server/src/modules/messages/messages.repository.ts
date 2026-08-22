import { db } from "../../db/index.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  MESSAGE_INCLUDE,
  type MessageRow,
} from "./messageFormatter.js";
import {
  buildAfterCursorWhere,
  buildBeforeCursorWhere,
  type MessageCursorPosition,
} from "./messagePagination.js";

const MESSAGE_ORDER_ASC = [{ messageDate: "asc" }, { telegramMessageId: "asc" }] as const;
const MESSAGE_ORDER_DESC = [{ messageDate: "desc" }, { telegramMessageId: "desc" }] as const;

export interface MessageWindow {
  rows: MessageRow[];
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface MessageReadSyncCandidate {
  id: number;
  chatId: string;
  telegramMessageId: number;
  isRead: boolean;
}

export interface MessageStatsCounts {
  total: number;
  unread: number;
  today: number;
}

export type MessageGroupEngagementType = "marked_read" | "opened_telegram";

export interface MessageGroupEngagementRecord {
  recorded: boolean;
  filterId: number | null;
  lastEngagedAt: string | null;
  lastEngagementType: MessageGroupEngagementType | null;
  lastEngagedMessageId: number | null;
}

export async function findMessageCursor(id: number) {
  return db.message.findUnique({
    where: { id },
    select: { id: true, messageDate: true, telegramMessageId: true },
  });
}

export async function findMessageReadState(id: number) {
  return db.message.findUnique({
    where: { id },
    select: { id: true, isRead: true, matchedFilterId: true },
  });
}

export async function setMessageReadState(id: number, isRead: boolean) {
  return db.$transaction(async (transaction) => {
    const updated = await transaction.message.update({
      where: { id },
      data: { isRead },
      select: { id: true, isRead: true, matchedFilterId: true },
    });

    if (isRead && updated.matchedFilterId !== null) {
      const now = new Date().toISOString();
      await transaction.filter.update({
        where: { id: updated.matchedFilterId },
        data: {
          lastEngagedAt: now,
          lastEngagementType: "marked_read",
          lastEngagedMessageId: updated.id,
        },
      });
    }

    return updated;
  });
}

export async function markMessagesRead(ids: number[]) {
  return db.$transaction(async (transaction) => {
    const unreadMessages = await transaction.message.findMany({
      where: { id: { in: ids }, isRead: false },
      select: { id: true, matchedFilterId: true },
    });
    const result = await transaction.message.updateMany({
      where: { id: { in: ids } },
      data: { isRead: true },
    });

    const unreadById = new Map(unreadMessages.map((message) => [message.id, message]));
    const latestMessageByFilter = new Map<number, number>();
    for (const id of ids) {
      const filterId = unreadById.get(id)?.matchedFilterId;
      if (filterId !== null && filterId !== undefined) {
        latestMessageByFilter.set(filterId, id);
      }
    }

    const now = new Date().toISOString();
    for (const [filterId, messageId] of latestMessageByFilter) {
      await transaction.filter.update({
        where: { id: filterId },
        data: {
          lastEngagedAt: now,
          lastEngagementType: "marked_read",
          lastEngagedMessageId: messageId,
        },
      });
    }

    return result;
  });
}

export async function recordMessageGroupEngagement(
  messageId: number,
  type: MessageGroupEngagementType,
): Promise<MessageGroupEngagementRecord | null> {
  return db.$transaction(async (transaction) => {
    const message = await transaction.message.findUnique({
      where: { id: messageId },
      select: { id: true, matchedFilterId: true },
    });
    if (!message) return null;

    if (message.matchedFilterId === null) {
      return {
        recorded: false,
        filterId: null,
        lastEngagedAt: null,
        lastEngagementType: null,
        lastEngagedMessageId: null,
      };
    }

    const now = new Date().toISOString();
    await transaction.filter.update({
      where: { id: message.matchedFilterId },
      data: {
        lastEngagedAt: now,
        lastEngagementType: type,
        lastEngagedMessageId: message.id,
      },
    });

    return {
      recorded: true,
      filterId: message.matchedFilterId,
      lastEngagedAt: now,
      lastEngagementType: type,
      lastEngagedMessageId: message.id,
    };
  });
}

export async function findReadSyncCandidates(ids: number[]): Promise<MessageReadSyncCandidate[]> {
  return db.message.findMany({
    where: { id: { in: ids } },
    select: { id: true, chatId: true, telegramMessageId: true, isRead: true },
  });
}

export async function countMessageStats(todayIso: string): Promise<MessageStatsCounts> {
  const [total, unread, todayRows] = await Promise.all([
    db.message.count(),
    db.message.count({ where: { isRead: false } }),
    db.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE datetime(created_at) >= datetime(${todayIso})
    `,
  ]);

  return {
    total,
    unread,
    today: Number(todayRows[0]?.count ?? 0),
  };
}

export async function findMostRecentReadMessage(where: Prisma.MessageWhereInput) {
  return db.message.findFirst({
    where: { ...where, isRead: true },
    orderBy: MESSAGE_ORDER_DESC,
  });
}

export async function findOldestUnreadMessage(where: Prisma.MessageWhereInput) {
  return db.message.findFirst({
    where: { ...where, isRead: false },
    orderBy: MESSAGE_ORDER_ASC,
  });
}

export async function findFirstUnreadAfterCursor(
  where: Prisma.MessageWhereInput,
  cursor: MessageCursorPosition,
) {
  return db.message.findFirst({
    where: buildAfterCursorWhere({ ...where, isRead: false }, cursor),
    orderBy: MESSAGE_ORDER_ASC,
  });
}

export async function findNewestMessage(where: Prisma.MessageWhereInput) {
  return db.message.findFirst({
    where,
    orderBy: MESSAGE_ORDER_DESC,
  });
}

export async function listInitialMessages(
  where: Prisma.MessageWhereInput,
  limit: number,
): Promise<MessageWindow> {
  const raw = await db.message.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: MESSAGE_ORDER_DESC,
    take: limit + 1,
  });
  const hasOlder = raw.length > limit;

  return {
    rows: (hasOlder ? raw.slice(0, limit) : raw).reverse(),
    hasOlder,
    hasNewer: false,
  };
}

export async function listMessagesBeforeCursor(
  where: Prisma.MessageWhereInput,
  cursor: MessageCursorPosition,
  limit: number,
): Promise<MessageWindow> {
  const raw = await db.message.findMany({
    where: buildBeforeCursorWhere(where, cursor),
    include: MESSAGE_INCLUDE,
    orderBy: MESSAGE_ORDER_DESC,
    take: limit + 1,
  });
  const hasOlder = raw.length > limit;

  return {
    rows: (hasOlder ? raw.slice(0, limit) : raw).reverse(),
    hasOlder,
    hasNewer: true,
  };
}

export async function listMessagesAfterCursor(
  where: Prisma.MessageWhereInput,
  cursor: MessageCursorPosition,
  limit: number,
): Promise<MessageWindow> {
  const raw = await db.message.findMany({
    where: buildAfterCursorWhere(where, cursor),
    include: MESSAGE_INCLUDE,
    orderBy: MESSAGE_ORDER_ASC,
    take: limit + 1,
  });
  const hasNewer = raw.length > limit;

  return {
    rows: hasNewer ? raw.slice(0, limit) : raw,
    hasOlder: true,
    hasNewer,
  };
}

export async function listMessagesAroundCursor(
  where: Prisma.MessageWhereInput,
  cursorId: number,
  cursor: MessageCursorPosition,
  limit: number,
): Promise<MessageWindow> {
  const halfLimit = Math.floor(limit / 2);

  const [beforeRaw, afterRaw, cursorMessage] = await Promise.all([
    db.message.findMany({
      where: buildBeforeCursorWhere(where, cursor),
      include: MESSAGE_INCLUDE,
      orderBy: MESSAGE_ORDER_DESC,
      take: halfLimit + 1,
    }),
    db.message.findMany({
      where: buildAfterCursorWhere(where, cursor),
      include: MESSAGE_INCLUDE,
      orderBy: MESSAGE_ORDER_ASC,
      take: halfLimit + 1,
    }),
    db.message.findUnique({ where: { id: cursorId }, include: MESSAGE_INCLUDE }),
  ]);

  const hasOlder = beforeRaw.length > halfLimit;
  const hasNewer = afterRaw.length > halfLimit;
  const before = (hasOlder ? beforeRaw.slice(0, halfLimit) : beforeRaw).reverse();
  const after = hasNewer ? afterRaw.slice(0, halfLimit) : afterRaw;

  return {
    rows: cursorMessage ? [...before, cursorMessage, ...after] : [...before, ...after],
    hasOlder,
    hasNewer,
  };
}
