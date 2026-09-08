import { setTimeout as delay } from "node:timers/promises";
import type { Prisma } from "../generated/prisma/client.js";
import { db } from "../db/index.js";

let pendingWrite: Promise<unknown> = Promise.resolve();

function isRetryableWriteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return ["P2002", "P2034", "P1008", "SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT"].includes(code)
    || /SQLITE_BUSY|database is locked|write conflict/i.test(message);
}

/**
 * SQLite 同时只有一个写入者。统一排队避免采集/移除的读后写事务互相争锁，
 * 外部连接造成锁冲突时则重跑整个事务，确保重新检查最新移除标记。
 */
export function withMessageMembershipTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const run = pendingWrite.then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await db.$transaction(operation, { timeout: 15_000, maxWait: 10_000 });
      } catch (error) {
        if (attempt >= 4 || !isRetryableWriteError(error)) throw error;
        await delay(25 * 2 ** attempt);
      }
    }
  });
  pendingWrite = run.catch(() => undefined);
  return run;
}

/** 只检查本次变更的消息，避免清理迁移前没有规则归属的独立消息。 */
export async function synchronizeMessageMemberships(
  tx: Prisma.TransactionClient,
  messageIds: number[],
): Promise<number[]> {
  if (messageIds.length === 0) return [];
  const messages = await tx.message.findMany({
    where: { id: { in: [...new Set(messageIds)] } },
    select: {
      id: true,
      matchedFilterId: true,
      matchedKeyword: true,
      filterMemberships: {
        orderBy: { filterId: "asc" },
        select: { filterId: true, matchedKeyword: true },
      },
    },
  });
  const deletedIds: number[] = [];
  for (const message of messages) {
    const primary = message.filterMemberships.find(
      (membership) => membership.filterId === message.matchedFilterId,
    ) ?? message.filterMemberships[0];
    if (!primary) {
      deletedIds.push(message.id);
      continue;
    }
    if (message.matchedFilterId !== primary.filterId || message.matchedKeyword !== primary.matchedKeyword) {
      await tx.message.update({
        where: { id: message.id },
        data: { matchedFilterId: primary.filterId, matchedKeyword: primary.matchedKeyword },
      });
    }
  }
  if (deletedIds.length > 0) {
    await tx.message.deleteMany({ where: { id: { in: deletedIds } } });
  }
  return deletedIds;
}
