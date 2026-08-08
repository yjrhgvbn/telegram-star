import type { TelegramClient } from "telegram";
import pMap from "p-map";
import { db } from "../../db/index.js";
import { parseConditions } from "../filter-matching.js";
import { emitMessageEvent } from "../messageEvents.js";
import { getClient } from "./client.js";
import {
  ingestTelegramMessage,
  type ActiveMessageFilter,
  type IngestTelegramMessageInput,
  type MessageIngestionResult,
  type MessageIngestionSource,
} from "./messageIngestion.js";
import { getMessageTimestampMs } from "./utils.js";

export type MessageCatchUpReason = Exclude<MessageIngestionSource, "live">;

export const MESSAGE_CATCH_UP_OVERLAP_MS = 2 * 60 * 1000;
export const MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const MESSAGE_CATCH_UP_INTERVAL_MS = 10 * 60 * 1000;

const MESSAGE_CATCH_UP_HISTORY_BATCH_SIZE = 100;
const MESSAGE_CATCH_UP_MAX_MESSAGES_PER_CHAT = 100_000;
const MESSAGE_CATCH_UP_DIALOG_CONCURRENCY = 3;
const MESSAGE_CATCH_UP_CONFIG_PREFIX = "telegram-message-catchup:";

interface CatchUpCheckpoint {
  completedThrough: string;
}

export interface CatchUpWindow {
  sinceMs: number;
  untilMs: number;
  hadCheckpoint: boolean;
}

export interface MessageCatchUpResult {
  reason: MessageCatchUpReason;
  scannedChats: number;
  scannedMessages: number;
  savedCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  sinceMs: number;
  untilMs: number;
}

interface CatchUpDialog {
  entity?: any;
  message?: any;
}

export interface MessageCatchUpRunDependencies {
  now: () => number;
  isActive: () => boolean;
  loadCheckpoint: (accountId: string) => Promise<number | null>;
  saveCheckpoint: (accountId: string, completedThroughMs: number) => Promise<void>;
  loadActiveFilters: () => Promise<ActiveMessageFilter[]>;
  loadDialogs: (client: TelegramClient) => Promise<CatchUpDialog[]>;
  loadMessages: (input: {
    client: TelegramClient;
    entity: any;
    sinceMs: number;
    untilMs: number;
  }) => Promise<any[]>;
  ingestMessage: (input: IngestTelegramMessageInput) => Promise<MessageIngestionResult>;
  emitRefresh: () => void;
}

interface RunMessageCatchUpInput {
  client: TelegramClient;
  accountId: string;
  reason: MessageCatchUpReason;
}

interface ActiveCatchUpContext {
  client: TelegramClient;
  accountId: string;
  periodicTimer: NodeJS.Timeout;
}

class MessageCatchUpCancelledError extends Error {
  constructor() {
    super("Telegram message catch-up was cancelled");
    this.name = "MessageCatchUpCancelledError";
  }
}

let activeContext: ActiveCatchUpContext | null = null;
let pendingReason: MessageCatchUpReason | null = null;
let catchUpRunner: Promise<void> | null = null;

function checkpointKey(accountId: string): string {
  return `${MESSAGE_CATCH_UP_CONFIG_PREFIX}${accountId}`;
}

export function resolveCatchUpWindow(
  checkpointMs: number | null,
  untilMs: number,
): CatchUpWindow {
  const sinceMs = checkpointMs === null
    ? untilMs - MESSAGE_CATCH_UP_INITIAL_LOOKBACK_MS
    : checkpointMs - MESSAGE_CATCH_UP_OVERLAP_MS;

  return {
    sinceMs: Math.max(0, sinceMs),
    untilMs,
    hadCheckpoint: checkpointMs !== null,
  };
}

/** null 表示至少一个有效规则没有会话限制，因此必须扫描全部会话。 */
export function resolveCatchUpChatScope(filters: ActiveMessageFilter[]): Set<string> | null {
  const scopedChatIds = new Set<string>();

  for (const filter of filters) {
    const conditions = parseConditions(filter.conditions);
    if (conditions.length === 0) continue;

    const chatConditions = conditions.filter((condition) => condition.type === "chat");
    if (chatConditions.length === 0) return null;

    for (const condition of chatConditions) {
      for (const chatId of condition.values) scopedChatIds.add(chatId);
    }
  }

  return scopedChatIds;
}

function isCatchUpEntity(entity: any): boolean {
  return ["Channel", "Chat", "User"].includes(entity?.className);
}

function shouldScanDialog(dialog: CatchUpDialog, sinceMs: number): boolean {
  const latestMessageMs = getMessageTimestampMs(dialog.message);
  return latestMessageMs <= 0 || latestMessageMs >= sinceMs;
}

export async function loadMessagesForCatchUp(input: {
  client: Pick<TelegramClient, "getMessages">;
  entity: any;
  sinceMs: number;
  untilMs: number;
  batchSize?: number;
  maxMessages?: number;
}): Promise<any[]> {
  const batchSize = Math.max(1, input.batchSize ?? MESSAGE_CATCH_UP_HISTORY_BATCH_SIZE);
  const maxMessages = Math.max(1, input.maxMessages ?? MESSAGE_CATCH_UP_MAX_MESSAGES_PER_CHAT);
  const messages: any[] = [];
  let offsetId = 0;
  let scanned = 0;
  let completed = false;

  while (scanned < maxMessages) {
    const take = Math.min(batchSize, maxMessages - scanned);
    const history = await input.client.getMessages(input.entity, { limit: take, offsetId });
    if (!history || history.length === 0) {
      completed = true;
      break;
    }

    scanned += history.length;
    for (const message of history as any[]) {
      const timestampMs = getMessageTimestampMs(message);
      if (timestampMs >= input.sinceMs && timestampMs <= input.untilMs) {
        messages.push(message);
      }
    }

    const oldest = history[history.length - 1] as any;
    const oldestId = Number(oldest?.id || 0);
    const oldestTimestampMs = getMessageTimestampMs(oldest);

    if (oldestTimestampMs > 0 && oldestTimestampMs < input.sinceMs) {
      completed = true;
      break;
    }
    if (history.length < take) {
      completed = true;
      break;
    }
    if (!oldestId || oldestId === offsetId) {
      throw new Error("Telegram catch-up history pagination stopped advancing");
    }

    offsetId = oldestId;
  }

  if (!completed && scanned >= maxMessages) {
    throw new Error(`Telegram catch-up exceeded ${maxMessages} messages in one chat`);
  }

  return messages.sort(
    (left, right) =>
      getMessageTimestampMs(left) - getMessageTimestampMs(right) ||
      Number(left?.id || 0) - Number(right?.id || 0),
  );
}

async function loadCatchUpCheckpoint(accountId: string): Promise<number | null> {
  const row = await db.appConfig.findUnique({ where: { key: checkpointKey(accountId) } });
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.valueJson) as Partial<CatchUpCheckpoint>;
    const timestampMs = Date.parse(parsed.completedThrough || "");
    return Number.isFinite(timestampMs) ? timestampMs : null;
  } catch {
    return null;
  }
}

async function saveCatchUpCheckpoint(accountId: string, completedThroughMs: number): Promise<void> {
  const now = new Date().toISOString();
  const checkpoint: CatchUpCheckpoint = {
    completedThrough: new Date(completedThroughMs).toISOString(),
  };

  await db.appConfig.upsert({
    where: { key: checkpointKey(accountId) },
    create: {
      key: checkpointKey(accountId),
      valueJson: JSON.stringify(checkpoint),
      createdAt: now,
      updatedAt: now,
    },
    update: {
      valueJson: JSON.stringify(checkpoint),
      updatedAt: now,
    },
  });
}

function assertCatchUpActive(isActive: () => boolean): void {
  if (!isActive()) throw new MessageCatchUpCancelledError();
}

export async function runMessageCatchUpOnce(
  input: RunMessageCatchUpInput,
  dependencies: MessageCatchUpRunDependencies,
): Promise<MessageCatchUpResult> {
  assertCatchUpActive(dependencies.isActive);
  const untilMs = dependencies.now();
  const checkpointMs = await dependencies.loadCheckpoint(input.accountId);
  const window = resolveCatchUpWindow(checkpointMs, untilMs);
  const activeFilters = await dependencies.loadActiveFilters();
  assertCatchUpActive(dependencies.isActive);

  let scannedChats = 0;
  let scannedMessages = 0;
  let savedCount = 0;
  let duplicateCount = 0;
  let unmatchedCount = 0;

  if (activeFilters.length > 0) {
    const chatScope = resolveCatchUpChatScope(activeFilters);
    const dialogs = await dependencies.loadDialogs(input.client);
    const inspectableDialogs = dialogs.filter((dialog) => {
      const entity = dialog.entity;
      if (!isCatchUpEntity(entity) || !shouldScanDialog(dialog, window.sinceMs)) return false;

      const chatId = entity.id?.toString?.() || "";
      return Boolean(chatId) && (chatScope === null || chatScope.has(chatId));
    });

    await pMap(
      inspectableDialogs,
      async (dialog) => {
        assertCatchUpActive(dependencies.isActive);
        const messages = await dependencies.loadMessages({
          client: input.client,
          entity: dialog.entity,
          sinceMs: window.sinceMs,
          untilMs: window.untilMs,
        });

        scannedChats += 1;
        scannedMessages += messages.length;

        for (const message of messages) {
          assertCatchUpActive(dependencies.isActive);
          const result = await dependencies.ingestMessage({
            message,
            chat: dialog.entity,
            activeFilters,
            source: input.reason,
            // 首次部署没有水位时不推送一天内的旧消息，避免通知风暴。
            notify: window.hadCheckpoint,
            emitEvent: false,
          });

          if (result === "created") savedCount += 1;
          else if (result === "duplicate") duplicateCount += 1;
          else unmatchedCount += 1;
        }
      },
      { concurrency: MESSAGE_CATCH_UP_DIALOG_CONCURRENCY },
    );
  }

  assertCatchUpActive(dependencies.isActive);
  await dependencies.saveCheckpoint(input.accountId, window.untilMs);
  if (savedCount > 0) dependencies.emitRefresh();

  return {
    reason: input.reason,
    scannedChats,
    scannedMessages,
    savedCount,
    duplicateCount,
    unmatchedCount,
    sinceMs: window.sinceMs,
    untilMs: window.untilMs,
  };
}

function defaultRunDependencies(context: ActiveCatchUpContext): MessageCatchUpRunDependencies {
  return {
    now: Date.now,
    isActive: () =>
      activeContext === context &&
      getClient() === context.client &&
      Boolean(context.client.connected),
    loadCheckpoint: loadCatchUpCheckpoint,
    saveCheckpoint: saveCatchUpCheckpoint,
    loadActiveFilters: () =>
      db.filter.findMany({
        where: { enabled: true },
        orderBy: { id: "asc" },
        select: { id: true, name: true, conditions: true },
      }),
    loadDialogs: (client) => client.getDialogs({}) as Promise<CatchUpDialog[]>,
    loadMessages: (messageInput) => loadMessagesForCatchUp(messageInput),
    ingestMessage: ingestTelegramMessage,
    emitRefresh: () => emitMessageEvent({ type: "new" }),
  };
}

async function drainCatchUpQueue(): Promise<void> {
  while (pendingReason && activeContext) {
    const reason = pendingReason;
    pendingReason = null;
    const context = activeContext;

    try {
      const result = await runMessageCatchUpOnce(
        { client: context.client, accountId: context.accountId, reason },
        defaultRunDependencies(context),
      );
      console.info("[Telegram][catch-up] completed", result);
    } catch (error) {
      if (error instanceof MessageCatchUpCancelledError) continue;
      console.error(`[Telegram][catch-up] ${reason} failed:`, error);
    }
  }
}

function ensureCatchUpRunner(): Promise<void> {
  if (catchUpRunner) return catchUpRunner;

  catchUpRunner = drainCatchUpQueue().finally(() => {
    catchUpRunner = null;
    // 覆盖队列结束与新触发恰好同时发生的边界。
    if (pendingReason && activeContext) void ensureCatchUpRunner();
  });
  return catchUpRunner;
}

export function requestMessageCatchUp(reason: MessageCatchUpReason): Promise<void> {
  const context = activeContext;
  if (!context || getClient() !== context.client || !context.client.connected) {
    return Promise.resolve();
  }

  // 多个触发只保留一次；重连/启动原因优先于周期性兜底，便于日志定位。
  if (!pendingReason || reason !== "periodic-catchup") pendingReason = reason;
  return ensureCatchUpRunner();
}

export function activateMessageCatchUp(client: TelegramClient, accountId: string): void {
  if (activeContext) clearInterval(activeContext.periodicTimer);

  const periodicTimer = setInterval(() => {
    if (getClient() !== client) {
      deactivateMessageCatchUp(client);
      return;
    }
    if (client.connected) void requestMessageCatchUp("periodic-catchup");
  }, MESSAGE_CATCH_UP_INTERVAL_MS);
  periodicTimer.unref?.();

  activeContext = {
    client,
    accountId,
    periodicTimer,
  };

  void requestMessageCatchUp("startup-catchup");
}

export function deactivateMessageCatchUp(client?: TelegramClient): void {
  if (!activeContext || (client && activeContext.client !== client)) return;

  clearInterval(activeContext.periodicTimer);
  activeContext = null;
  pendingReason = null;
}

export function isMessageCatchUpActive(client: TelegramClient): boolean {
  return activeContext?.client === client;
}
