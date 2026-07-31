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
import { extractMediaInfo, getMessageTextContent, hasMessageContent } from "./media.js";
import {
  extractMessageContentLinks,
  serializeMessageContentLinks,
} from "./messageContentLinks.js";
import type {
  JoinedChat,
  LiveChatMessage,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
} from "./types.js";
import {
  getDialogPageSlice,
  getNextDialogPage,
  normalizeBackfillBatchSize,
  normalizeHistoricalPreviewLimits,
  normalizeSegmentedHistoryLimits,
  normalizeSingleChatMessageLimits,
} from "./historyScanPolicy.js";
import pMap from "p-map";

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

  const { messageLimit, chatSearchLimit } = normalizeSingleChatMessageLimits(options);
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

  const validMessages = history.filter((item: any) => hasMessageContent(item));

  const dbRows = await db.message.findMany({
    where: {
      chatId,
      telegramMessageId: { in: validMessages.map((item: any) => item.id) },
    },
    select: { telegramMessageId: true },
  });
  const storedIdSet = new Set<number>(dbRows.map((r) => r.telegramMessageId));

  return validMessages.map((item: any) => {
    const sender = (item as any).sender;
    const senderName = sender?.firstName
      ? `${sender.firstName}${sender.lastName ? ` ${sender.lastName}` : ""}`
      : sender?.title || sender?.username || "Unknown";
    const senderId = sender?.id?.toString?.() || "";
    const mediaInfo = extractMediaInfo(item);

    const content = getMessageTextContent(item);

    return {
      id: item.id,
      chatId,
      chatTitle,
      senderName,
      senderId,
      content,
      contentLinks: extractMessageContentLinks(item, content),
      messageDate: new Date((item.date || 0) * 1000).toISOString(),
      telegramLink: buildTelegramLink(chatId, entity, item.id),
      inDatabase: storedIdSet.has(item.id),
      mediaType: mediaInfo?.mediaType ?? null,
      mediaFileName: mediaInfo?.mediaFileName ?? null,
      mediaFileSize: mediaInfo?.mediaFileSize ?? null,
      mediaMimeType: mediaInfo?.mediaMimeType ?? null,
      mediaDuration: mediaInfo?.mediaDuration ?? null,
      mediaThumbBase64: mediaInfo?.mediaThumbBase64 ?? null,
      mediaExtra: mediaInfo?.mediaExtra ?? null,
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

  const { batchSize } = normalizeSegmentedHistoryLimits(options);
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
 * 支持时间窗口（since/until）限制。
 */
export async function previewHistoricalFilterMessages(options: {
  conditions: FilterCondition[];
  perChatLimit?: number;
  totalLimit?: number;
  page?: number;
  pageSize?: number;
  sampleLimit?: number;
}): Promise<{
  messages: HistoricalFilterPreviewMessage[];
  samples: HistoricalFilterPreviewSample[];
  scannedChats: number;
  nextPage?: number;
}> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  if (hasConflictingChatConditions(options.conditions)) {
    return { messages: [], samples: [], scannedChats: 0 };
  }

  const { perChatLimit, totalLimit, pageSize, page } = normalizeHistoricalPreviewLimits(options);
  const sampleLimit = Math.max(0, Math.min(options.sampleLimit ?? 0, 20));

  const dialogs = await client.getDialogs({ limit: 300 });
  const scopedChatIds = getScopedChatIds(options.conditions);
  const previews: HistoricalFilterPreviewMessage[] = [];
  const matchedSamples: HistoricalFilterPreviewSample[] = [];
  const unmatchedSamples: HistoricalFilterPreviewSample[] = [];
  let scannedChats = 0;

  const paginatedDialogs = getDialogPageSlice(dialogs, page, pageSize);

  await pMap(
    paginatedDialogs,
    async (dialog: any) => {
      const entity = (dialog as any).entity;
      if (!isValidChat(entity)) return;

      const chatId = entity?.id?.toString?.() || "";
      if (!chatId || !shouldInspectChat(chatId, scopedChatIds)) return;

      scannedChats += 1;

      const history = await loadSegmentedHistory({
        entity,
        scanLimit: perChatLimit,
        batchSize: 100,
      });

      const validMessages = history.filter((item: any) => hasMessageContent(item));

      const ids = validMessages.map((item: any) => item.id);
      const existingRows = ids.length
        ? await db.message.findMany({
            where: { chatId, telegramMessageId: { in: ids } },
            select: { telegramMessageId: true },
          })
        : [];
      const existingIdSet = new Set(existingRows.map((r) => r.telegramMessageId));

      for (const item of validMessages) {
        const textContent = getMessageTextContent(item);
        const match = matchFilterConditions({ chatId, content: textContent }, options.conditions);
        const sampleTarget = match.matched ? matchedSamples : unmatchedSamples;
        const shouldCaptureSample =
          sampleLimit > 0 && sampleTarget.length < sampleLimit;

        if (!match.matched && !shouldCaptureSample) continue;

        const sender = (item as any).sender;
        const { senderName, senderId } = getSenderSummary(sender);
        const mediaInfo = extractMediaInfo(item);

        const previewMessage: HistoricalFilterPreviewMessage = {
          id: item.id,
          chatId,
          chatTitle: entity?.title || entity?.username || chatId,
          senderName,
          senderId,
          content: textContent,
          contentLinks: extractMessageContentLinks(item, textContent),
          messageDate: new Date(getMessageTimestampMs(item)).toISOString(),
          telegramLink: buildTelegramLink(chatId, entity, item.id),
          inDatabase: existingIdSet.has(item.id),
          matchedKeyword: match.matchedKeyword,
          mediaType: mediaInfo?.mediaType ?? null,
          mediaFileName: mediaInfo?.mediaFileName ?? null,
          mediaFileSize: mediaInfo?.mediaFileSize ?? null,
          mediaMimeType: mediaInfo?.mediaMimeType ?? null,
          mediaDuration: mediaInfo?.mediaDuration ?? null,
          mediaThumbBase64: mediaInfo?.mediaThumbBase64 ?? null,
          mediaExtra: mediaInfo?.mediaExtra ?? null,
        };

        // The API keeps the existing match-only list for backfill while also
        // exposing a small balanced sample set for explainable UI previews.
        if (shouldCaptureSample) {
          sampleTarget.push({ ...previewMessage, matched: match.matched });
        }

        if (!match.matched) continue;
        previews.push(previewMessage);

        if (previews.length >= totalLimit) {
          return;
        }
      }
    },
    { concurrency: 5 },
  );

  const nextPage = getNextDialogPage(dialogs.length, page, pageSize);
  const preferredMatchedCount = Math.ceil(sampleLimit * (2 / 3));
  const preferredUnmatchedCount = sampleLimit - preferredMatchedCount;
  const samples = [
    ...matchedSamples.slice(0, preferredMatchedCount),
    ...unmatchedSamples.slice(0, preferredUnmatchedCount),
  ];
  const sampleKeys = new Set(samples.map((sample) => `${sample.chatId}-${sample.id}`));

  for (const sample of [...matchedSamples, ...unmatchedSamples]) {
    if (samples.length >= sampleLimit) break;

    const key = `${sample.chatId}-${sample.id}`;
    if (sampleKeys.has(key)) continue;
    samples.push(sample);
    sampleKeys.add(key);
  }

  samples.sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
      new Date(b.messageDate).getTime() - new Date(a.messageDate).getTime(),
  );

  return { messages: previews, samples, scannedChats, nextPage };
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
  batchSize?: number;
}): Promise<{
  scannedChats: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
}> {
  const preview = await previewHistoricalFilterMessages({
    conditions: options.conditions,
    perChatLimit: options.perChatLimit,
    totalLimit: 1000,
  });

  const batchSize = normalizeBackfillBatchSize(options.batchSize);
  let savedCount = 0;
  let skippedExistingCount = 0;

  await pMap(
    preview.messages,
    async (message: HistoricalFilterPreviewMessage) => {
      if (message.inDatabase) {
        skippedExistingCount += 1;
        return;
      }

      await db.message.create({
        data: {
          telegramMessageId: message.id,
          chatId: message.chatId,
          chatTitle: message.chatTitle,
          senderName: message.senderName,
          senderId: message.senderId,
          content: message.content,
          contentLinks: serializeMessageContentLinks(message.contentLinks),
          messageDate: message.messageDate,
          telegramLink: message.telegramLink,
          isRead: false,
          matchedFilterId: options.filterId,
          matchedKeyword: message.matchedKeyword,
          createdAt: new Date().toISOString(),
          mediaType: message.mediaType ?? undefined,
          mediaFileName: message.mediaFileName ?? undefined,
          mediaFileSize: message.mediaFileSize ?? undefined,
          mediaMimeType: message.mediaMimeType ?? undefined,
          mediaDuration: message.mediaDuration ?? undefined,
          mediaThumbBase64: message.mediaThumbBase64 ?? undefined,
          mediaExtra: message.mediaExtra ?? undefined,
        },
      });
      savedCount += 1;
    },
    { concurrency: batchSize },
  );

  return {
    scannedChats: preview.scannedChats,
    matchedCount: preview.messages.length,
    savedCount,
    skippedExistingCount,
  };
}
