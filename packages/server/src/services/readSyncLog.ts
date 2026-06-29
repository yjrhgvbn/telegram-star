import { db } from "../db/index.js";
import type { ReadSyncLogLevel } from "@telegram-star/shared/contracts/messages";

const READ_SYNC_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let lastCleanupMs = 0;

export type { ReadSyncLogLevel } from "@telegram-star/shared/contracts/messages";

interface ReadSyncLogInput {
  level: ReadSyncLogLevel;
  source: string;
  action: string;
  message: string;
  chatId?: string;
  telegramMessageId?: number;
  rowId?: number;
  details?: Record<string, unknown>;
}

async function cleanupExpiredReadSyncLogs(nowMs: number): Promise<void> {
  if (nowMs - lastCleanupMs < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupMs = nowMs;

  const cutoff = new Date(nowMs - READ_SYNC_LOG_RETENTION_MS).toISOString();
  await db.readSyncLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export async function writeReadSyncLog(input: ReadSyncLogInput): Promise<void> {
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();

  try {
    await cleanupExpiredReadSyncLogs(nowMs);
    await db.readSyncLog.create({
      data: {
        level: input.level,
        source: input.source,
        action: input.action,
        message: input.message,
        chatId: input.chatId,
        telegramMessageId: input.telegramMessageId,
        rowId: input.rowId,
        detailsJson: input.details ? JSON.stringify(input.details) : null,
        createdAt,
      },
    });
  } catch (error) {
    // 记录失败不能影响主业务链路
    console.error("[ReadSync][log] failed to write db log", error);
  }
}

export async function listReadSyncLogs(limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - READ_SYNC_LOG_RETENTION_MS).toISOString();

  await cleanupExpiredReadSyncLogs(nowMs);

  const rows = await db.readSyncLog.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });

  return rows.map((row) => {
    let details: Record<string, unknown> | null = null;
    if (row.detailsJson) {
      try {
        details = JSON.parse(row.detailsJson) as Record<string, unknown>;
      } catch {
        details = { parseError: true, raw: row.detailsJson };
      }
    }

    return {
      id: row.id,
      level: row.level,
      source: row.source,
      action: row.action,
      message: row.message,
      chatId: row.chatId,
      telegramMessageId: row.telegramMessageId,
      rowId: row.rowId,
      details,
      createdAt: row.createdAt,
    };
  });
}
