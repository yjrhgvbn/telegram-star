/**
 * Telegram 历史消息查询。
 * 提供会话列表、单会话消息列表、过滤器预览及历史回填等功能。
 */
import { db } from "../../db/index.js";
import {
  hasConflictingChatConditions,
  matchFilterConditions,
  type FilterCondition,
} from "../filter-matching.js";
import { getClient, isClientConnected } from "./client.js";
import {
  isValidChat,
  buildTelegramLink,
  getSenderSummary,
  getScopedChatIds,
  shouldInspectChat,
  getMessageTimestampMs,
  buildDialogEntityMap,
} from "./utils.js";
import type { JoinedChat, LiveChatMessage, HistoricalFilterPreviewMessage } from "./types.js";

// --- 会话列表 ---

/** 返回当前账号已加入的所有群组/频道，按标题字母序排列 */
export async function listJoinedChats(): Promise<JoinedChat[]> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  const dialogs = await client.getDialogs({ limit: 300 });
  const seen = new Set<string>();
  const chats: JoinedChat[] = [];

  for (const dialog of dialogs) {
    const entity = (dialog as any).entity;
    if (!isValidChat(entity)) continue;

    const id = entity?.id?.toString?.() || "";
    if (!id || seen.has(id)) continue;

    seen.add(id);
    chats.push({ id, title: entity?.title || entity?.username || id });
  }

  return chats.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

// --- 单会话消息 ---

/** 拉取指定会话的最新消息列表，并标注各条消息是否已在数据库中存在 */
export async function listSingleChatMessages(options: {
  chatId: string;
  messageLimit?: number;
  chatSearchLimit?: number;
}): Promise<LiveChatMessage[]> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  const targetChatId = options.chatId.trim();
  if (!targetChatId) throw new Error("chatId is required");

  const messageLimit = Math.max(1, Math.min(options.messageLimit ?? 100, 500));
  const chatSearchLimit = Math.max(1, Math.min(options.chatSearchLimit ?? 500, 1000));
  const dialogs = await client.getDialogs({ limit: chatSearchLimit });

  const targetDialog = dialogs.find(
    (d: any) => d?.entity?.id?.toString?.() === targetChatId,
  );
  if (!targetDialog) throw new Error("Chat not found or no access");

  const entity = (targetDialog as any).entity;
  if (!isValidChat(entity)) throw new Error("Unsupported chat type");

  const chatId = entity?.id?.toString?.() || targetChatId;
  const chatTitle = entity?.title || entity?.username || chatId;
  const history = await client.getMessages(entity, { limit: messageLimit });

  const textMessages = history.filter(
    (item: any) => typeof item?.message === "string" && item.message.trim().length > 0,
  );

  const dbRows = await db.message.findMany({
    where: {
      chatId,
      telegramMessageId: { in: textMessages.map((item: any) => item.id) },
    },
    select: { telegramMessageId: true },
  });
  const storedIdSet = new Set<number>(dbRows.map((r) => r.telegramMessageId));

  return textMessages.map((item: any) => {
    const sender = (item as any).sender;
    const senderName = sender?.firstName
      ? `${sender.firstName}${sender.lastName ? ` ${sender.lastName}` : ""}`
      : sender?.title || sender?.username || "Unknown";
    const senderId = sender?.id?.toString?.() || "";

    return {
      id: item.id,
      chatId,
      chatTitle,
      senderName,
      senderId,
      content: item.message,
      messageDate: new Date((item.date || 0) * 1000).toISOString(),
      telegramLink: buildTelegramLink(chatId, entity, item.id),
      inDatabase: storedIdSet.has(item.id),
    };
  });
}

// --- 历史分段翻页 ---

/**
 * 分批向历史方向翻页，直到达到 scanLimit 或越过 sinceMs 时间窗口下界。
 * 使用 offsetId 锚点避免重复拉取同一批消息。
 */
async function loadSegmentedHistory(options: {
  entity: any;
  scanLimit: number;
  batchSize?: number;
  sinceMs?: number;
}): Promise<any[]> {
  const client = getClient();
  if (!client) return [];

  const batchSize = Math.max(20, Math.min(options.batchSize ?? 100, 200));
  const messages: any[] = [];
  let scanned = 0;
  let offsetId = 0;
  let guard = 0; // 防止意外死循环

  while (scanned < options.scanLimit && guard < 100) {
    guard += 1;
    const take = Math.min(batchSize, options.scanLimit - scanned);
    const history = await client.getMessages(options.entity, { limit: take, offsetId });

    if (!history || history.length === 0) break;

    messages.push(...history);
    scanned += history.length;

    const oldest = history[history.length - 1];
    const oldestId = Number(oldest?.id || 0);
    const oldestTs = getMessageTimestampMs(oldest);

    // 没有新锚点时停止，避免重复拉同一批
    if (!oldestId || oldestId === offsetId) break;
    offsetId = oldestId;

    if (options.sinceMs !== undefined && oldestTs > 0 && oldestTs < options.sinceMs) {
      // 已翻到时间窗口下界之前，停止继续向更早方向翻页
      break;
    }
  }

  return messages;
}

// --- 过滤器历史预览 ---

/**
 * 根据过滤器条件扫描历史消息并返回预览列表，不写入数据库。
 * 支持时间窗口（since/until）和会话范围（chatIds）限制。
 */
export async function previewHistoricalFilterMessages(options: {
  conditions: FilterCondition[];
  perChatLimit?: number;
  totalLimit?: number;
  chatIds?: string[];
  since?: string;
  until?: string;
}): Promise<{ messages: HistoricalFilterPreviewMessage[]; scannedChats: number }> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  if (hasConflictingChatConditions(options.conditions)) {
    return { messages: [], scannedChats: 0 };
  }

  // perChatLimit 表示每个会话最多向历史扫描多少条原始消息
  const perChatLimit = Math.max(1, Math.min(options.perChatLimit ?? 200, 5000));
  const totalLimit = Math.max(1, Math.min(options.totalLimit ?? 50, 200));
  const dialogs = await client.getDialogs({ limit: 300 });
  const scopedChatIds = getScopedChatIds(options.conditions);
  const selectedChatIdSet = new Set(
    (options.chatIds ?? []).map((id) => id.trim()).filter(Boolean),
  );
  const sinceMs = options.since ? Date.parse(options.since) : NaN;
  const untilMs = options.until ? Date.parse(options.until) : NaN;
  const hasSince = !Number.isNaN(sinceMs);
  const hasUntil = !Number.isNaN(untilMs);
  const previews: HistoricalFilterPreviewMessage[] = [];
  let scannedChats = 0;

  for (const dialog of dialogs) {
    const entity = (dialog as any).entity;
    if (!isValidChat(entity)) continue;

    const chatId = entity?.id?.toString?.() || "";
    if (!chatId || !shouldInspectChat(chatId, scopedChatIds)) continue;
    if (selectedChatIdSet.size > 0 && !selectedChatIdSet.has(chatId)) continue;

    scannedChats += 1;

    // 分段拉取时间窗口附近的历史，再在本地做文本与时间裁剪
    const history = await loadSegmentedHistory({
      entity,
      scanLimit: perChatLimit,
      batchSize: 100,
      sinceMs: hasSince ? sinceMs : undefined,
    });

    const textMessages = history.filter(
      (item: any) => typeof item?.message === "string" && item.message.trim().length > 0,
    );

    // 批量查询已存在于数据库中的消息 ID，用于 inDatabase 标注
    const ids = textMessages.map((item: any) => item.id);
    const existingRows = ids.length
      ? await db.message.findMany({
          where: { chatId, telegramMessageId: { in: ids } },
          select: { telegramMessageId: true },
        })
      : [];
    const existingIdSet = new Set(existingRows.map((r) => r.telegramMessageId));

    for (const item of textMessages) {
      const messageTs = getMessageTimestampMs(item);
      const messageDate = new Date(messageTs).toISOString();
      const messageMs = Date.parse(messageDate);

      // 再次做时间窗口裁剪，兼容分段翻页最后一批跨越窗口边界的情况
      if (hasSince && messageMs < sinceMs) continue;
      if (hasUntil && messageMs > untilMs) continue;

      const match = matchFilterConditions({ chatId, content: item.message }, options.conditions);
      if (!match.matched) continue;

      const sender = (item as any).sender;
      const { senderName, senderId } = getSenderSummary(sender);

      previews.push({
        id: item.id,
        chatId,
        chatTitle: entity?.title || entity?.username || chatId,
        senderName,
        senderId,
        content: item.message,
        messageDate,
        telegramLink: buildTelegramLink(chatId, entity, item.id),
        inDatabase: existingIdSet.has(item.id),
        matchedKeyword: match.matchedKeyword,
      });

      if (previews.length >= totalLimit) {
        return { messages: previews, scannedChats };
      }
    }
  }

  return { messages: previews, scannedChats };
}

// --- 历史回填 ---

/**
 * 基于过滤器条件扫描历史消息并将命中结果写入数据库（已存在的跳过）。
 * 通常由用户手动触发，用于补录过去未被实时监听到的消息。
 */
export async function backfillFilterHistory(options: {
  filterId: number;
  conditions: FilterCondition[];
  perChatLimit?: number;
  chatIds?: string[];
  since?: string;
  until?: string;
}): Promise<{
  scannedChats: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
}> {
  const preview = await previewHistoricalFilterMessages({
    conditions: options.conditions,
    perChatLimit: options.perChatLimit,
    totalLimit: 200,
    chatIds: options.chatIds,
    since: options.since,
    until: options.until,
  });

  let savedCount = 0;
  let skippedExistingCount = 0;

  for (const message of preview.messages) {
    if (message.inDatabase) {
      skippedExistingCount += 1;
      continue;
    }

    await db.message.create({
      data: {
        telegramMessageId: message.id,
        chatId: message.chatId,
        chatTitle: message.chatTitle,
        senderName: message.senderName,
        senderId: message.senderId,
        content: message.content,
        messageDate: message.messageDate,
        telegramLink: message.telegramLink,
        isRead: false,
        matchedFilterId: options.filterId,
        matchedKeyword: message.matchedKeyword,
        createdAt: new Date().toISOString(),
      },
    });
    savedCount += 1;
  }

  return {
    scannedChats: preview.scannedChats,
    matchedCount: preview.messages.length,
    savedCount,
    skippedExistingCount,
  };
}
