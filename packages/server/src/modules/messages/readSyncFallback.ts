import { syncReadByTelegramInteractions } from "../../services/telegram.js";

// 低频兜底：每 30s 最多对 Telegram 发起一次拉取式互动同步，
// 实时链路（Real-time Reaction 监听）会先捕获大多数场景。
export const INTERACTION_SYNC_INTERVAL_MS = 30_000;

export interface ReadSyncFallbackMessage {
  id: number;
  chatId: string;
  telegramMessageId: number;
  isRead: boolean;
}

interface ReadSyncFallbackLogger {
  debug: (payload: unknown, message: string) => void;
  info: (payload: unknown, message: string) => void;
  error: (payload: unknown, message: string) => void;
}

interface RunInteractionSyncOptions {
  nowMs?: number;
  intervalMs?: number;
  syncRead?: (messages: ReadSyncFallbackMessage[]) => Promise<Set<number>>;
}

let lastInteractionSyncMs = 0;

export function shouldRunInteractionSync(
  nowMs: number,
  lastSyncMs: number,
  intervalMs = INTERACTION_SYNC_INTERVAL_MS,
) {
  return nowMs - lastSyncMs >= intervalMs;
}

export function resetInteractionSyncThrottleForTests() {
  lastInteractionSyncMs = 0;
}

/** 在当前 data 上做 Telegram 互动同步（含 30s 限流） */
export async function runInteractionSync(
  data: ReadSyncFallbackMessage[],
  log: ReadSyncFallbackLogger,
  options: RunInteractionSyncOptions = {},
): Promise<Set<number>> {
  const now = options.nowMs ?? Date.now();
  const intervalMs = options.intervalMs ?? INTERACTION_SYNC_INTERVAL_MS;
  if (!shouldRunInteractionSync(now, lastInteractionSyncMs, intervalMs)) {
    log.debug({ elapsedMs: now - lastInteractionSyncMs }, "[ReadSync][fallback] skipped due to interval");
    return new Set<number>();
  }

  lastInteractionSyncMs = now;
  const syncRead = options.syncRead ?? syncReadByTelegramInteractions;
  const markedIds = await syncRead(data);
  log.info(
    {
      resultCount: data.length,
      markedCount: markedIds.size,
      markedIds: Array.from(markedIds),
    },
    "[ReadSync][fallback] sync completed",
  );
  return markedIds;
}

/**
 * 在后台执行 Telegram 拉取式兜底同步，避免外部网络延迟阻塞消息列表响应。
 * 同步产生的已读变化会通过 message event stream 主动通知前端。
 */
export function runInteractionSyncInBackground(
  data: ReadSyncFallbackMessage[],
  log: ReadSyncFallbackLogger,
  options: RunInteractionSyncOptions = {},
): void {
  void runInteractionSync(data, log, options).catch((error) => {
    log.error({ err: error }, "[ReadSync][fallback] background sync failed");
  });
}
