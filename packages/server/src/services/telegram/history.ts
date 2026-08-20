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
} from "./utils.js";
import { extractMediaInfo, getMessageTextContent, hasMessageContent } from "./media.js";
import {
  extractMessageContentLinks,
  serializeMessageContentLinks,
} from "./messageContentLinks.js";
import { createMessageIfAbsent } from "./messagePersistence.js";
import type {
  JoinedChat,
  LiveChatMessage,
  HistoricalFilterPreviewMessage,
  HistoricalFilterPreviewSample,
} from "./types.js";
import {
  getDialogPageSlice,
  getNextDialogPage,
  normalizeBackfillPerChatLimit,
  normalizeHistoricalPreviewLimits,
  normalizeSegmentedHistoryLimits,
  normalizeSingleChatMessageLimits,
} from "./historyScanPolicy.js";
import { createAsyncTtlCache, type AsyncTtlCache } from "./asyncTtlCache.js";
import pMap from "p-map";

const PREVIEW_CACHE_TTL_MS = 30_000;
const PREVIEW_CACHE_MAX_CHATS = 8;
const PREVIEW_CACHE_MAX_PER_CHAT = 1_000;

interface PreviewClientCache {
  dialogs: AsyncTtlCache<any[]>;
  chatMessages: AsyncTtlCache<HistoricalFilterPreviewMessage[]>;
}

// 按 TelegramClient 实例隔离，退出并切换账号后旧快照不会被新账号复用。
const previewClientCaches = new WeakMap<object, PreviewClientCache>();

function getPreviewClientCache(client: object): PreviewClientCache {
  const existing = previewClientCaches.get(client);
  if (existing) return existing;

  const created: PreviewClientCache = {
    dialogs: createAsyncTtlCache({
      ttlMs: PREVIEW_CACHE_TTL_MS,
      maxEntries: 1,
    }),
    chatMessages: createAsyncTtlCache({
      ttlMs: PREVIEW_CACHE_TTL_MS,
      maxEntries: PREVIEW_CACHE_MAX_CHATS,
    }),
  };
  previewClientCaches.set(client, created);
  return created;
}

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

async function loadPreviewChatSnapshot(options: {
  client: object;
  entity: any;
  chatId: string;
  chatTitle: string;
  perChatLimit: number;
}): Promise<HistoricalFilterPreviewMessage[]> {
  const loadSnapshot = async () => {
    const history = await loadSegmentedHistory({
      entity: options.entity,
      scanLimit: options.perChatLimit,
      batchSize: 100,
    });
    const validMessages = history.filter((item: any) => hasMessageContent(item));
    const ids = validMessages.map((item: any) => item.id);
    const existingRows = ids.length
      ? await db.message.findMany({
          where: { chatId: options.chatId, telegramMessageId: { in: ids } },
          select: { telegramMessageId: true },
        })
      : [];
    const existingIdSet = new Set(existingRows.map((row) => row.telegramMessageId));

    return validMessages.map((item: any): HistoricalFilterPreviewMessage => {
      const textContent = getMessageTextContent(item);
      const { senderName, senderId } = getSenderSummary((item as any).sender);
      const mediaInfo = extractMediaInfo(item);

      return {
        id: item.id,
        chatId: options.chatId,
        chatTitle: options.chatTitle,
        senderName,
        senderId,
        content: textContent,
        contentLinks: extractMessageContentLinks(item, textContent),
        messageDate: new Date(getMessageTimestampMs(item)).toISOString(),
        telegramLink: buildTelegramLink(options.chatId, options.entity, item.id),
        inDatabase: existingIdSet.has(item.id),
        matchedKeyword: null,
        mediaType: mediaInfo?.mediaType ?? null,
        mediaFileName: mediaInfo?.mediaFileName ?? null,
        mediaFileSize: mediaInfo?.mediaFileSize ?? null,
        mediaMimeType: mediaInfo?.mediaMimeType ?? null,
        mediaDuration: mediaInfo?.mediaDuration ?? null,
        mediaThumbBase64: mediaInfo?.mediaThumbBase64 ?? null,
        mediaExtra: mediaInfo?.mediaExtra ?? null,
      };
    });
  };

  // API 仍允许更大的手动扫描范围，但只缓存 UI 支持的 1000 条以内快照，
  // 防止单个异常请求长期占用过多内存。
  if (options.perChatLimit > PREVIEW_CACHE_MAX_PER_CHAT) {
    return loadSnapshot();
  }

  const cache = getPreviewClientCache(options.client);
  return cache.chatMessages.get(
    `${options.chatId}:${options.perChatLimit}`,
    loadSnapshot,
  );
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

  const previewCache = getPreviewClientCache(client);
  const dialogs = await previewCache.dialogs.get("dialogs:300", () =>
    client.getDialogs({ limit: 300 }) as Promise<any[]>,
  );
  const scopedChatIds = getScopedChatIds(options.conditions);
  const previews: HistoricalFilterPreviewMessage[] = [];
  const matchedSamples: HistoricalFilterPreviewSample[] = [];
  const unmatchedSamples: HistoricalFilterPreviewSample[] = [];
  let scannedChats = 0;

  const inspectableDialogs = dialogs.filter((dialog: any) => {
    const entity = (dialog as any).entity;
    if (!isValidChat(entity)) return false;

    const chatId = entity?.id?.toString?.() || "";
    return Boolean(chatId) && shouldInspectChat(chatId, scopedChatIds);
  });
  const paginatedDialogs = getDialogPageSlice(inspectableDialogs, page, pageSize);

  await pMap(
    paginatedDialogs,
    async (dialog: any) => {
      const entity = (dialog as any).entity;
      if (!isValidChat(entity)) return;

      const chatId = entity?.id?.toString?.() || "";
      if (!chatId) return;

      scannedChats += 1;

      const chatTitle = entity?.title || entity?.username || chatId;
      const snapshot = await loadPreviewChatSnapshot({
        client,
        entity,
        chatId,
        chatTitle,
        perChatLimit,
      });

      for (const baseMessage of snapshot) {
        const match = matchFilterConditions(
          { chatId, content: baseMessage.content },
          options.conditions,
        );
        if (match.error) throw new Error(match.error);
        const sampleTarget = match.matched ? matchedSamples : unmatchedSamples;
        const shouldCaptureSample =
          sampleLimit > 0 && sampleTarget.length < sampleLimit;

        if (!match.matched && !shouldCaptureSample) continue;

        const previewMessage: HistoricalFilterPreviewMessage = {
          ...baseMessage,
          matchedKeyword: match.matchedKeyword,
        };

        // The API keeps the existing match-only list for backfill while also
        // exposing a small balanced sample set for explainable UI previews.
        if (shouldCaptureSample) {
          sampleTarget.push({ ...previewMessage, matched: match.matched });
        }

        if (!match.matched) continue;
        previews.push(previewMessage);
      }
    },
    { concurrency: 5 },
  );

  const nextPage = getNextDialogPage(inspectableDialogs.length, page, pageSize);
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

  const messages = previews
    .sort(
      (a, b) =>
        new Date(b.messageDate).getTime() - new Date(a.messageDate).getTime(),
    )
    .slice(0, totalLimit);

  return { messages, samples, scannedChats, nextPage };
}

// --- 历史回填 ---

/**
 * 基于过滤器条件扫描历史消息并将命中结果写入数据库（已存在的跳过）。
 * 通常由用户手动触发，用于补录过去未被实时监听到的消息。
 */
export interface FilterBackfillHistoryProgress {
  totalChats: number;
  completedChats: number;
  scannedMessages: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
  currentChatTitle: string | null;
}

export async function backfillFilterHistory(options: {
  filterId: number;
  conditions: FilterCondition[];
  /** null 表示按时间持续向前扫描，直到越过 startAt 或到达完整历史末尾。 */
  perChatLimit?: number | null;
  sinceMs?: number;
  untilMs?: number;
  onProgress?: (
    progress: FilterBackfillHistoryProgress,
  ) => void | Promise<void>;
}): Promise<{
  scannedChats: number;
  scannedMessages: number;
  matchedCount: number;
  savedCount: number;
  skippedExistingCount: number;
}> {
  const client = getClient();
  if (!client || !isClientConnected()) {
    throw new Error("Telegram client is not connected");
  }

  if (hasConflictingChatConditions(options.conditions)) {
    return {
      scannedChats: 0,
      scannedMessages: 0,
      matchedCount: 0,
      savedCount: 0,
      skippedExistingCount: 0,
    };
  }

  const dialogs = await client.getDialogs({}) as any[];
  const scopedChatIds = getScopedChatIds(options.conditions);
  const inspectableDialogs = dialogs.filter((dialog: any) => {
    const entity = dialog?.entity;
    if (!isValidChat(entity)) return false;

    const chatId = entity?.id?.toString?.() || "";
    return Boolean(chatId) && shouldInspectChat(chatId, scopedChatIds);
  });
  const perChatLimit = options.perChatLimit === null
    ? null
    : normalizeBackfillPerChatLimit(options.perChatLimit);
  const batchSize = 100;
  let scannedMessages = 0;
  let matchedCount = 0;
  let savedCount = 0;
  let skippedExistingCount = 0;
  let completedChats = 0;

  const reportProgress = async (currentChatTitle: string | null) => {
    await options.onProgress?.({
      totalChats: inspectableDialogs.length,
      completedChats,
      scannedMessages,
      matchedCount,
      savedCount,
      skippedExistingCount,
      currentChatTitle,
    });
  };

  await reportProgress(null);

  for (const dialog of inspectableDialogs) {
    const entity = dialog.entity;
    const chatId = entity?.id?.toString?.() || "";
    const chatTitle = entity?.title || entity?.username || chatId;
    let offsetId = 0;
    let scannedInChat = 0;

    await reportProgress(chatTitle);

    while (perChatLimit === null || scannedInChat < perChatLimit) {
      const take = perChatLimit === null
        ? batchSize
        : Math.min(batchSize, perChatLimit - scannedInChat);
      const history = await client.getMessages(entity, { limit: take, offsetId });
      if (!history || history.length === 0) break;

      scannedInChat += history.length;
      scannedMessages += history.length;

      for (const item of history as any[]) {
        const timestampMs = getMessageTimestampMs(item);
        if (options.untilMs !== undefined && timestampMs > options.untilMs) continue;
        if (options.sinceMs !== undefined && timestampMs < options.sinceMs) continue;
        if (!hasMessageContent(item)) continue;

        const textContent = getMessageTextContent(item);
        const match = matchFilterConditions(
          { chatId, content: textContent },
          options.conditions,
        );
        if (match.error) throw new Error(match.error);
        if (!match.matched) continue;

        matchedCount += 1;
        const { senderName, senderId } = getSenderSummary(item.sender);
        const mediaInfo = extractMediaInfo(item);
        const rowId = await createMessageIfAbsent({
          telegramMessageId: item.id,
          chatId,
          chatTitle,
          senderName,
          senderId,
          content: textContent,
          contentLinks: serializeMessageContentLinks(
            extractMessageContentLinks(item, textContent),
          ),
          messageDate: new Date(timestampMs).toISOString(),
          telegramLink: buildTelegramLink(chatId, entity, item.id),
          isRead: false,
          matchedFilterId: options.filterId,
          matchedKeyword: match.matchedKeyword,
          createdAt: new Date().toISOString(),
          mediaType: mediaInfo?.mediaType,
          mediaFileName: mediaInfo?.mediaFileName,
          mediaFileSize: mediaInfo?.mediaFileSize,
          mediaMimeType: mediaInfo?.mediaMimeType,
          mediaDuration: mediaInfo?.mediaDuration,
          mediaThumbBase64: mediaInfo?.mediaThumbBase64,
          mediaExtra: mediaInfo?.mediaExtra,
        });
        if (rowId !== null) savedCount += 1;
        else skippedExistingCount += 1;
      }

      await reportProgress(chatTitle);

      const oldest = history[history.length - 1] as any;
      const oldestId = Number(oldest?.id || 0);
      const oldestTimestampMs = getMessageTimestampMs(oldest);
      if (
        options.sinceMs !== undefined &&
        oldestTimestampMs > 0 &&
        oldestTimestampMs < options.sinceMs
      ) {
        break;
      }
      if (history.length < take) break;
      if (!oldestId || oldestId === offsetId) {
        throw new Error(`Telegram history pagination stopped advancing in ${chatTitle}`);
      }

      offsetId = oldestId;
    }

    completedChats += 1;
    await reportProgress(null);
  }

  // 本次写入改变了 inDatabase 标记；清掉消息快照，下一次预览可返回准确状态。
  getPreviewClientCache(client).chatMessages.clear();

  return {
    scannedChats: completedChats,
    scannedMessages,
    matchedCount,
    savedCount,
    skippedExistingCount,
  };
}
