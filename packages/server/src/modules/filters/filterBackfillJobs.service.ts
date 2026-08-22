import {
  ALL_MESSAGES_SYSTEM_KEY,
  filterBackfillJobSchema,
  type FilterBackfillJob,
  type FilterBackfillJobCreateInput,
} from "@telegram-star/shared/contracts/filters";
import type { FilterBackfillJob as FilterBackfillJobRow } from "../../generated/prisma/client.js";
import { db } from "../../db/index.js";
import { parseConditions } from "../../services/filter-matching.js";
import {
  backfillFilterHistory,
  type FilterBackfillHistoryProgress,
} from "../../services/telegram.js";
import { appLogger } from "../../shared/logging.js";

const runningJobIds = new Set<string>();
const PROGRESS_WRITE_INTERVAL_MS = 750;

export class FilterBackfillJobNotFoundError extends Error {
  constructor(message = "Backfill job not found") {
    super(message);
  }
}

function toApiBackfillJob(row: FilterBackfillJobRow): FilterBackfillJob {
  return filterBackfillJobSchema.parse(row);
}

function scheduleBackfillJob(jobId: string): void {
  if (runningJobIds.has(jobId)) return;

  runningJobIds.add(jobId);
  void runBackfillJob(jobId)
    .catch((error: unknown) => {
      appLogger.error(
        { err: error, event: "filter_backfill.stopped_unexpectedly", jobId },
        "Filter backfill job stopped unexpectedly",
      );
    })
    .finally(() => {
      runningJobIds.delete(jobId);
    });
}

async function runBackfillJob(jobId: string): Promise<void> {
  const job = await db.filterBackfillJob.findUnique({
    where: { id: jobId },
    include: { filter: { select: { conditions: true } } },
  });
  if (!job || ["completed", "failed"].includes(job.status)) return;

  const startedAtMs = Date.now();

  const startedAt = new Date().toISOString();
  await db.filterBackfillJob.updateMany({
    where: { id: jobId },
    data: {
      status: "running",
      totalChats: 0,
      completedChats: 0,
      scannedMessages: 0,
      matchedCount: 0,
      savedCount: 0,
      skippedExistingCount: 0,
      currentChatTitle: null,
      error: null,
      completedAt: null,
      updatedAt: startedAt,
    },
  });
  appLogger.info(
    {
      event: "filter_backfill.started",
      jobId,
      filterId: job.filterId,
      mode: job.mode,
    },
    "Filter backfill job started",
  );

  let lastProgressWriteAt = 0;
  let lastCompletedChats = -1;
  const persistProgress = async (progress: FilterBackfillHistoryProgress) => {
    const now = Date.now();
    const chatChanged = progress.completedChats !== lastCompletedChats;
    if (!chatChanged && now - lastProgressWriteAt < PROGRESS_WRITE_INTERVAL_MS) return;

    lastProgressWriteAt = now;
    lastCompletedChats = progress.completedChats;
    await db.filterBackfillJob.updateMany({
      where: { id: jobId, status: "running" },
      data: {
        totalChats: progress.totalChats,
        completedChats: progress.completedChats,
        scannedMessages: progress.scannedMessages,
        matchedCount: progress.matchedCount,
        savedCount: progress.savedCount,
        skippedExistingCount: progress.skippedExistingCount,
        currentChatTitle: progress.currentChatTitle,
        updatedAt: new Date().toISOString(),
      },
    });
  };

  try {
    const result = await backfillFilterHistory({
      filterId: job.filterId,
      conditions: parseConditions(job.filter.conditions),
      perChatLimit: job.mode === "count" ? job.perChatLimit ?? undefined : null,
      sinceMs: job.startAt ? Date.parse(job.startAt) : undefined,
      untilMs: job.endAt ? Date.parse(job.endAt) : undefined,
      onProgress: persistProgress,
    });
    const completedAt = new Date().toISOString();

    await db.filterBackfillJob.updateMany({
      where: { id: jobId },
      data: {
        status: "completed",
        completedChats: result.scannedChats,
        scannedMessages: result.scannedMessages,
        matchedCount: result.matchedCount,
        savedCount: result.savedCount,
        skippedExistingCount: result.skippedExistingCount,
        currentChatTitle: null,
        error: null,
        completedAt,
        updatedAt: completedAt,
      },
    });
    appLogger.info(
      {
        event: "filter_backfill.completed",
        jobId,
        filterId: job.filterId,
        durationMs: Date.now() - startedAtMs,
        ...result,
      },
      "Filter backfill job completed",
    );
  } catch (error: unknown) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error && error.message
      ? error.message
      : "History backfill failed";

    await db.filterBackfillJob.updateMany({
      where: { id: jobId },
      data: {
        status: "failed",
        currentChatTitle: null,
        error: message.slice(0, 800),
        completedAt: failedAt,
        updatedAt: failedAt,
      },
    });
    appLogger.error(
      {
        err: error,
        event: "filter_backfill.failed",
        jobId,
        filterId: job.filterId,
        durationMs: Date.now() - startedAtMs,
      },
      "Filter backfill job failed",
    );
  }
}

export async function createFilterBackfillJob(
  filterId: number,
  input: FilterBackfillJobCreateInput,
): Promise<FilterBackfillJob> {
  const filter = await db.filter.findUnique({
    where: { id: filterId },
    select: { id: true, systemKey: true },
  });
  if (!filter) throw new FilterBackfillJobNotFoundError("Filter not found");
  if (filter.systemKey === ALL_MESSAGES_SYSTEM_KEY) {
    throw new FilterBackfillJobNotFoundError("System message groups cannot be backfilled");
  }

  const existing = await db.filterBackfillJob.findFirst({
    where: { filterId, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    scheduleBackfillJob(existing.id);
    return toApiBackfillJob(existing);
  }

  const now = new Date().toISOString();
  const created = await db.filterBackfillJob.create({
    data: {
      filterId,
      mode: input.mode,
      status: "queued",
      startAt: input.mode === "time" ? input.startAt ?? null : null,
      endAt: input.mode === "time" ? input.endAt ?? null : null,
      perChatLimit: input.mode === "count" ? input.perChatLimit ?? null : null,
      createdAt: now,
      updatedAt: now,
    },
  });

  // 不等待扫描完成；任务进度持久化到数据库，页面关闭不会中断进程内任务。
  scheduleBackfillJob(created.id);
  return toApiBackfillJob(created);
}

export async function getLatestFilterBackfillJob(
  filterId: number,
): Promise<FilterBackfillJob | null> {
  const filter = await db.filter.findUnique({
    where: { id: filterId },
    select: { id: true },
  });
  if (!filter) throw new FilterBackfillJobNotFoundError("Filter not found");

  const job = await db.filterBackfillJob.findFirst({
    where: { filterId },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;

  // 服务重启后，用户重新打开进度面板会恢复未完成任务；唯一键保证重复扫描不会重复入库。
  if (["queued", "running"].includes(job.status)) scheduleBackfillJob(job.id);
  return toApiBackfillJob(job);
}

export async function getFilterBackfillJob(
  filterId: number,
  jobId: string,
): Promise<FilterBackfillJob> {
  const job = await db.filterBackfillJob.findFirst({
    where: { id: jobId, filterId },
  });
  if (!job) throw new FilterBackfillJobNotFoundError();

  if (["queued", "running"].includes(job.status)) scheduleBackfillJob(job.id);
  return toApiBackfillJob(job);
}
