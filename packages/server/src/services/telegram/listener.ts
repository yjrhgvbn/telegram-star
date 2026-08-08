/**
 * Telegram 事件监听与已读同步。
 *
 * 提供两条已读标记链路：
 * 1. 实时链路（handleInteractionUpdate）：订阅 Raw 更新事件，在用户对消息
 *    添加 Reaction 的瞬间立即写库，延迟极低。
 * 2. 低频兜底（syncReadByTelegramInteractions）：供 messages 路由每 30s 调用一次，
 *    通过拉取原文消息的 reactions 字段补偿可能丢失的实时事件。
 */
import { NewMessage, type NewMessageEvent, Raw } from "telegram/events/index.js";
import { UpdateConnectionState } from "telegram/network/index.js";
import { db } from "../../db/index.js";
import { getClient, isClientConnected, setConnected } from "./client.js";
import { buildDialogEntityMap } from "./utils.js";
import { emitMessageEvent } from "../messageEvents.js";
import { writeReadSyncLog } from "../readSyncLog.js";
import { extractReactionMessageRef, hasUserReactionSignal } from "./readReactionSignal.js";
import { ingestTelegramMessage } from "./messageIngestion.js";
import {
  isMessageCatchUpActive,
  requestMessageCatchUp,
} from "./messageCatchUp.js";

const listenerStartedClients = new WeakSet<object>();
const connectionStateByClient = new WeakMap<object, number>();

// --- 实时链路：Raw 事件 ---

/**
 * 处理 Telegram 原始更新，仅关注 UpdateMessageReactions 类型。
 * 当用户对消息点 Reaction 时，提取 chatId 与消息 ID，
 * 若在数据库中存在对应未读记录，立即将其标记为已读。
 */
async function handleInteractionUpdate(update: any): Promise<void> {
  const ref = extractReactionMessageRef(update);
  if (!ref) return;

  // 仅当 reaction 来自当前用户时才触发已读
  const reactionSignalMatched = hasUserReactionSignal({ reactions: update.reactions });
  if (!reactionSignalMatched) {
    return;
  }

  const row = await db.message.findFirst({
    where: { chatId: ref.chatId, telegramMessageId: ref.telegramMessageId, isRead: false },
    select: { id: true },
  });
  if (!row) return;

  await db.message.update({ where: { id: row.id }, data: { isRead: true } });
  emitMessageEvent({ type: "read", messageIds: [row.id] });

  console.info("[ReadSync][realtime] marked as read", {
    rowId: row.id,
    chatId: ref.chatId,
    telegramMessageId: ref.telegramMessageId,
    reason: "reaction",
  });
  await writeReadSyncLog({
    level: "info",
    source: "实时同步",
    action: "标记已读",
    message: "通过实时 Reaction 同步将消息标记为已读",
    rowId: row.id,
    chatId: ref.chatId,
    telegramMessageId: ref.telegramMessageId,
    details: { 原因: "reaction", 来源: "UpdateMessageReactions" },
  });
}

// --- 低频兜底：拉取式同步 ---

/**
 * 对传入的消息列表中未读条目，逐一向 Telegram 拉取原文并检查 reactions，
 * 若检测到用户已 react 则批量更新数据库并返回已变更的行 ID 集合。
 *
 * 此函数作为 30s 低频补偿，防止因 Raw 事件偶发丢失导致状态不一致。
 */
export async function syncReadByTelegramInteractions(
  messages: Array<{
    id: number;
    chatId: string;
    telegramMessageId: number;
    isRead: boolean;
  }>,
): Promise<Set<number>> {
  const client = getClient();
  if (!client || !isClientConnected() || messages.length === 0) return new Set();

  const unread = messages.filter((m) => !m.isRead);
  if (unread.length === 0) return new Set();

  const dialogs = await client.getDialogs({ limit: 500 });
  const entityMap = buildDialogEntityMap(dialogs as any[]);

  // 按 chatId 分组，减少重复 API 调用
  const byChat = new Map<string, Array<{ id: number; telegramMessageId: number }>>();
  for (const item of unread) {
    if (!byChat.has(item.chatId)) byChat.set(item.chatId, []);
    byChat.get(item.chatId)!.push({ id: item.id, telegramMessageId: item.telegramMessageId });
  }

  const shouldMarkReadIds = new Set<number>();
  let scannedCount = 0;

  for (const [chatId, refs] of byChat.entries()) {
    const entity = entityMap.get(chatId);
    if (!entity) continue;

    const ids = refs.map((r) => r.telegramMessageId);
    const idToRowId = new Map<number, number>(refs.map((r) => [r.telegramMessageId, r.id]));

    const history = await client.getMessages(entity, { ids });
    for (const raw of history as any[]) {
      scannedCount += 1;
      const telegramMessageId = Number(raw?.id || 0);
      const rowId = idToRowId.get(telegramMessageId);
      if (rowId && hasUserReactionSignal(raw)) {
        shouldMarkReadIds.add(rowId);
      }
    }
  }

  if (shouldMarkReadIds.size === 0) return shouldMarkReadIds;

  await db.message.updateMany({
    where: { id: { in: Array.from(shouldMarkReadIds) }, isRead: false },
    data: { isRead: true },
  });

  emitMessageEvent({ type: "read", messageIds: Array.from(shouldMarkReadIds) });

  console.info("[ReadSync][fallback] marked rows as read", {
    inputCount: messages.length,
    unreadCount: unread.length,
    scannedCount,
    markedCount: shouldMarkReadIds.size,
    markedIds: Array.from(shouldMarkReadIds),
    reason: "reaction-signal",
  });
  await writeReadSyncLog({
    level: "info",
    source: "兜底同步",
    action: "批量标记已读",
    message: "通过兜底同步将消息批量标记为已读",
    details: {
      输入消息数: messages.length,
      未读消息数: unread.length,
      扫描消息数: scannedCount,
      标记数量: shouldMarkReadIds.size,
      标记ID列表: Array.from(shouldMarkReadIds),
      原因: "reaction-signal",
    },
  });

  return shouldMarkReadIds;
}

// --- 新消息处理 ---

/** 处理入站新消息：逐一匹配启用的过滤器，首次命中后入库并触发通知推送 */
async function handleNewMessage(event: NewMessageEvent): Promise<void> {
  const message = event.message;
  if (!message) return;

  const activeFilters = await db.filter.findMany({
    where: { enabled: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, conditions: true },
  });
  if (activeFilters.length === 0) return;

  const chat = await message.getChat();
  if (!chat) return;

  await ingestTelegramMessage({
    message,
    chat,
    activeFilters,
    source: "live",
    notify: true,
    emitEvent: true,
  });
}

// --- 监听器启动 ---

/**
 * 启动两个持久事件处理器：
 * - NewMessage：实时捕获新消息，匹配过滤器后入库并推送通知。
 * - Raw：订阅所有原始更新，过滤 UpdateMessageReactions 后实时标记已读。
 *
 * 可在连接前调用；函数会按 client 实例防止重复注册。
 */
export function startMessageListener(): void {
  const client = getClient();
  if (!client || listenerStartedClients.has(client)) return;
  listenerStartedClients.add(client);

  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleNewMessage(event);
    } catch (err) {
      console.error("[Telegram] Error handling message:", err);
    }
  }, new NewMessage({}));

  client.addEventHandler(async (update: any) => {
    try {
      await handleInteractionUpdate(update);
    } catch (err) {
      console.error("[Telegram] Error handling interaction update:", err);
    }
  }, new Raw({}));

  client.addEventHandler((update: UpdateConnectionState) => {
    const previousState = connectionStateByClient.get(client);
    connectionStateByClient.set(client, update.state);

    const connected = update.state === UpdateConnectionState.connected;
    setConnected(connected);

    if (
      connected &&
      previousState !== UpdateConnectionState.connected &&
      isMessageCatchUpActive(client)
    ) {
      void requestMessageCatchUp("reconnect-catchup");
    }
  }, new Raw({ types: [UpdateConnectionState] }));

  console.log("[Telegram] Message listener started");
}
