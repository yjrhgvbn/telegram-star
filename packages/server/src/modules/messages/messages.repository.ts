import { db } from "../../db/index.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { MessageRemovalInput } from "@telegram-star/shared/contracts/messages";
import {
  synchronizeMessageMemberships,
  withMessageMembershipTransaction,
} from "../../services/messageMemberships.js";
import {
  MESSAGE_INCLUDE,
  type MessageRow,
} from "./messageFormatter.js";
import {
  buildAfterCursorWhere,
  buildBeforeCursorWhere,
  type MessageCursorPosition,
} from "./messagePagination.js";

const MESSAGE_ORDER_ASC: Prisma.MessageOrderByWithRelationInput[] = [{ messageDate: "asc" }, { telegramMessageId: "asc" }];
const MESSAGE_ORDER_DESC: Prisma.MessageOrderByWithRelationInput[] = [{ messageDate: "desc" }, { telegramMessageId: "desc" }];
const MESSAGE_MEMBERSHIPS_SELECT = { select: { filterId: true } } as const;

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
    select: { id: true, isRead: true },
  });
}

export async function setMessageReadState(id: number, isRead: boolean) {
  return withMessageMembershipTransaction(async (transaction) => {
    // 排队期间最后一个归属可能已被移除；按不存在处理，而不是向客户端泄漏 Prisma 错误。
    const existing = await transaction.message.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;
    const updated = await transaction.message.update({
      where: { id },
      data: { isRead },
      select: { id: true, isRead: true, filterMemberships: MESSAGE_MEMBERSHIPS_SELECT },
    });

    if (isRead) {
      const now = new Date().toISOString();
      for (const { filterId } of updated.filterMemberships) {
        await transaction.filter.update({
          where: { id: filterId },
          data: {
            lastEngagedAt: now,
            lastEngagementType: "marked_read",
            lastEngagedMessageId: updated.id,
          },
        });
      }
    }

    return updated;
  });
}

export async function markMessagesRead(ids: number[]) {
  return withMessageMembershipTransaction(async (transaction) => {
    const unreadMessages = await transaction.message.findMany({
      where: { id: { in: ids }, isRead: false },
      select: { id: true, filterMemberships: MESSAGE_MEMBERSHIPS_SELECT },
    });
    const result = await transaction.message.updateMany({
      where: { id: { in: ids } },
      data: { isRead: true },
    });

    const unreadById = new Map(unreadMessages.map((message) => [message.id, message]));
    const latestMessageByFilter = new Map<number, number>();
    for (const id of ids) {
      for (const { filterId } of unreadById.get(id)?.filterMemberships ?? []) {
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
  return withMessageMembershipTransaction(async (transaction) => {
    const message = await transaction.message.findUnique({
      where: { id: messageId },
      select: { id: true, matchedFilterId: true, filterMemberships: MESSAGE_MEMBERSHIPS_SELECT },
    });
    if (!message) return null;

    if (message.filterMemberships.length === 0) {
      return {
        recorded: false,
        filterId: null,
        lastEngagedAt: null,
        lastEngagementType: null,
        lastEngagedMessageId: null,
      };
    }

    const now = new Date().toISOString();
    for (const { filterId } of message.filterMemberships) {
      await transaction.filter.update({
        where: { id: filterId },
        data: {
          lastEngagedAt: now,
          lastEngagementType: type,
          lastEngagedMessageId: message.id,
        },
      });
    }

    return {
      recorded: true,
      filterId: message.matchedFilterId ?? message.filterMemberships[0].filterId,
      lastEngagedAt: now,
      lastEngagementType: type,
      lastEngagedMessageId: message.id,
    };
  });
}

export async function removeMessagesFromFilter(input: MessageRemovalInput) {
  return withMessageMembershipTransaction(async (transaction) => {
    // 只对仍属于目标规则的消息写标记；重试不能升级已移除消息的补录限制。
    const messages = await transaction.message.findMany({
      where: {
        id: { in: [...new Set(input.ids)] },
        filterMemberships: { some: { filterId: input.filterId } },
      },
      select: { id: true, chatId: true, telegramMessageId: true },
    });
    if (messages.length === 0) return { removedIds: [] };

    const removedAt = new Date().toISOString();
    for (const message of messages) {
      const key = {
        chatId: message.chatId,
        telegramMessageId: message.telegramMessageId,
        filterId: input.filterId,
      };
      await transaction.messageRemoval.upsert({
        where: { chatId_telegramMessageId_filterId: key },
        create: { ...key, removedAt, blockBackfill: input.blockBackfill ?? false },
        update: { removedAt, blockBackfill: input.blockBackfill ?? false },
      });
    }
    const removedIds = messages.map((message) => message.id);
    await transaction.messageFilterMembership.deleteMany({
      where: { filterId: input.filterId, messageId: { in: removedIds } },
    });
    await synchronizeMessageMemberships(transaction, removedIds);
    return { removedIds };
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
    // 游标可以保留在其它规则中；它仅用于定位，不能绕过当前列表过滤条件。
    db.message.findFirst({ where: { AND: [where, { id: cursorId }] }, include: MESSAGE_INCLUDE }),
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
