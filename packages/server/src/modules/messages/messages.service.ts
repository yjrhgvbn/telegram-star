import type {
  MessageBatchReadResponse,
  MessageDirection,
  MessageForceSyncReadResponse,
  MessageEngagementInput,
  MessageEngagementResponse,
  MessageListQuery,
  MessageListResponse,
  MessageReadStateResponse,
  MessageStats,
  ReadSyncLogsResponse,
} from "@telegram-star/shared/contracts/messages";
import type { Prisma } from "../../generated/prisma/client.js";
import { emitMessageEvent } from "../../services/messageEvents.js";
import { listReadSyncLogs, writeReadSyncLog } from "../../services/readSyncLog.js";
import { syncReadByTelegramInteractions } from "../../services/telegram.js";
import { formatMessageRow, type MessageRow } from "./messageFormatter.js";
import { buildMessageBaseWhere } from "./messagePagination.js";
import {
  countMessageStats,
  findReadSyncCandidates,
  findFirstUnreadAfterCursor,
  findMessageCursor,
  findMessageReadState,
  findMostRecentReadMessage,
  findNewestMessage,
  findOldestUnreadMessage,
  listInitialMessages,
  listMessagesAfterCursor,
  listMessagesAroundCursor,
  listMessagesBeforeCursor,
  markMessagesRead,
  recordMessageGroupEngagement,
  setMessageReadState,
} from "./messages.repository.js";
import { runInteractionSyncInBackground } from "./readSyncFallback.js";

interface MessageServiceLogger {
  debug: (payload: unknown, message: string) => void;
  info: (payload: unknown, message: string) => void;
  error: (payload: unknown, message: string) => void;
}

export class CursorMessageNotFoundError extends Error {
  constructor(cursorId: number) {
    super(`Cursor message not found: ${cursorId}`);
    this.name = "CursorMessageNotFoundError";
  }
}

export class MessageNotFoundError extends Error {
  constructor(messageId: number) {
    super(`Message not found: ${messageId}`);
    this.name = "MessageNotFoundError";
  }
}

export async function listMessages(
  query: MessageListQuery,
  log: MessageServiceLogger,
): Promise<MessageListResponse> {
  const limit = query.limit ?? 20;
  const baseWhere = buildMessageBaseWhere(query);

  const located = await resolveAutoLocateCursor(query);
  const cursorId = located.cursorId ?? query.cursorId;
  const direction = located.direction ?? query.direction ?? "before";

  const window = await listMessageWindow({
    baseWhere,
    cursorId,
    direction,
    limit,
  });

  // 列表查询会顺手触发低频 Telegram Reaction 兜底同步。
  // 这里只覆盖当前窗口，并放到后台执行，避免 Telegram 网络延迟阻塞列表响应。
  runInteractionSyncInBackground(
    window.rows.map((row) => ({
      id: row.id,
      chatId: row.chatId,
      telegramMessageId: row.telegramMessageId,
      isRead: row.isRead,
    })),
    log,
  );
  const interactedReadIds = new Set<number>();

  return {
    data: window.rows.map((row) => formatMessageRow(row, interactedReadIds)),
    hasOlder: window.hasOlder,
    hasNewer: window.hasNewer,
    ...(located.anchorId !== undefined ? { anchorId: located.anchorId } : {}),
  };
}

export async function toggleMessageRead(
  id: number,
  log: MessageServiceLogger,
): Promise<MessageReadStateResponse> {
  const existing = await findMessageReadState(id);
  if (!existing) {
    throw new MessageNotFoundError(id);
  }

  const updated = await setMessageReadState(id, !existing.isRead);

  log.info(
    {
      id,
      previousIsRead: existing.isRead,
      nextIsRead: updated.isRead,
      source: "manual-toggle",
    },
    "[ReadSync][manual] toggled read state",
  );

  if (updated.isRead) {
    await writeReadSyncLog({
      level: "info",
      source: "手动操作",
      action: "标记已读",
      message: "通过手动切换将消息标记为已读",
      rowId: id,
      details: {
        之前状态: existing.isRead,
        当前状态: updated.isRead,
      },
    });
  }

  return updated;
}

export async function markMessagesAsRead(
  ids: number[],
  log: MessageServiceLogger,
): Promise<MessageBatchReadResponse> {
  await markMessagesRead(ids);

  log.info(
    {
      idsCount: ids.length,
      ids,
      source: "manual-batch",
    },
    "[ReadSync][manual] batch marked as read",
  );

  await writeReadSyncLog({
    level: "info",
    source: "手动操作",
    action: "批量标记已读",
    message: "通过手动批量操作将消息标记为已读",
    details: {
      标记数量: ids.length,
      标记ID列表: ids,
    },
  });

  emitMessageEvent({ type: "read", messageIds: ids });
  return { success: true, count: ids.length };
}

export async function recordMessageEngagement(
  id: number,
  input: MessageEngagementInput,
): Promise<MessageEngagementResponse> {
  const engagement = await recordMessageGroupEngagement(id, input.type);
  if (!engagement) {
    throw new MessageNotFoundError(id);
  }

  return engagement;
}

export async function forceSyncMessageRead(ids: number[]): Promise<MessageForceSyncReadResponse> {
  const messages = await findReadSyncCandidates(ids);
  const alreadyReadIds = messages.filter((message) => message.isRead).map((message) => message.id);
  const unreadMessages = messages.filter((message) => !message.isRead);

  let markedIds = new Set<number>();
  if (unreadMessages.length > 0) {
    markedIds = await syncReadByTelegramInteractions(unreadMessages);
  }

  return {
    markedIds: [...alreadyReadIds, ...Array.from(markedIds)],
  };
}

export async function getMessageStats(): Promise<MessageStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return countMessageStats(today.toISOString());
}

export async function listMessageReadSyncLogs(limit = 100): Promise<ReadSyncLogsResponse> {
  return { data: await listReadSyncLogs(limit) };
}

async function resolveAutoLocateCursor(query: MessageListQuery): Promise<{
  anchorId?: number | null;
  cursorId?: number;
  direction?: MessageDirection;
}> {
  if (query.autoLocate !== true || query.cursorId !== undefined) {
    return {};
  }

  const anchorBaseWhere = buildMessageBaseWhere({
    filterId: query.filterId,
    search: query.search,
  });
  const anchorId = await findAutoLocateAnchorId(anchorBaseWhere);

  return anchorId === null
    ? { anchorId }
    : { anchorId, cursorId: anchorId, direction: "around" };
}

async function findAutoLocateAnchorId(where: Prisma.MessageWhereInput): Promise<number | null> {
  const mostRecentRead = await findMostRecentReadMessage(where);

  // 自动定位的目标是“接近用户上次处理进度”：
  // 1. 没有已读记录时从最老未读开始；
  // 2. 有已读记录时优先跳到其后的第一条未读；
  // 3. 全部已读时退回最新消息，避免空白列表。
  if (!mostRecentRead) {
    const oldestUnread = await findOldestUnreadMessage(where);
    return oldestUnread?.id ?? null;
  }

  const newerUnread = await findFirstUnreadAfterCursor(where, mostRecentRead);
  if (newerUnread) {
    return newerUnread.id;
  }

  const newestMessage = await findNewestMessage(where);
  return newestMessage?.id ?? null;
}

async function listMessageWindow({
  baseWhere,
  cursorId,
  direction,
  limit,
}: {
  baseWhere: Prisma.MessageWhereInput;
  cursorId: number | undefined;
  direction: MessageDirection;
  limit: number;
}): Promise<{ rows: MessageRow[]; hasOlder: boolean; hasNewer: boolean }> {
  if (cursorId === undefined) {
    return listInitialMessages(baseWhere, limit);
  }

  const cursor = await findMessageCursor(cursorId);
  if (!cursor) {
    throw new CursorMessageNotFoundError(cursorId);
  }

  if (direction === "before") {
    return listMessagesBeforeCursor(baseWhere, cursor, limit);
  }
  if (direction === "after") {
    return listMessagesAfterCursor(baseWhere, cursor, limit);
  }
  return listMessagesAroundCursor(baseWhere, cursorId, cursor, limit);
}
