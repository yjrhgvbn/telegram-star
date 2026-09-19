import { db } from "../../db/index.js";
import { enqueueMatchedMessage } from "../notificationOutbox.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  synchronizeMessageMemberships,
  withMessageMembershipTransaction,
} from "../messageMemberships.js";
import { matchFilterConditions, parseConditions } from "../filter-matching.js";
import { appLogger } from "../../shared/logging.js";

/** Prisma 组合唯一键冲突表示该 Telegram 消息已被实时监听或回补链路保存。 */
export function isDuplicateMessageError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

/** 一份消息正文可以被多个规则独立收录。 */
export interface MessageFilterMatch {
  filterId: number;
  matchedKeyword: string | null;
}

export interface MessagePersistenceResult {
  rowId: number | null;
  created: boolean;
  addedFilterIds: number[];
  addedMatches: MessageFilterMatch[];
  blockedFilterIds: number[];
  notifyTargetCount?: number;
}

/** 检查移除标记与归属写入必须在同一事务内，避免回补把刚移除的归属写回来。 */
export async function persistMessageForFilters(
  data: Prisma.MessageUncheckedCreateInput,
  matches: MessageFilterMatch[],
  mode: "automatic" | "manual" = "automatic",
  options: { notify?: boolean; isCurrentSource?: () => boolean } = {},
): Promise<MessagePersistenceResult> {
  const empty: MessagePersistenceResult = { rowId: null, created: false, addedFilterIds: [], addedMatches: [], blockedFilterIds: [] };
  const cancelled = Symbol("stale-message-source");
  const changed = Symbol("message-or-rule-changed");
  const assertCurrent = () => { if (options.isCurrentSource && !options.isCurrentSource()) throw cancelled; };
  const uniqueMatches = [...new Map(matches.map((match) => [match.filterId, match])).values()];
  const candidateIds = new Set(uniqueMatches.map((match) => match.filterId));
  const messageQuery = {
    where: { chatId_telegramMessageId: { chatId: data.chatId, telegramMessageId: data.telegramMessageId } },
    select: { id: true, content: true, senderUserId: true, filterMemberships: { select: { filterId: true } } },
  } as const;
  const filterQuery = {
    where: { id: { in: [...candidateIds] } },
    select: { id: true, name: true, conditions: true, enabled: true, systemKey: true },
    orderBy: { id: "asc" as const },
  };
  // Evaluate potentially expensive scripts without holding SQLite's single writer.
  // The transaction rechecks the exact inputs and retries if rules/content changed.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      assertCurrent();
      const [snapshotMessage, snapshotFilters] = await Promise.all([
        db.message.findUnique(messageQuery), db.filter.findMany(filterQuery),
      ]);
      const content = snapshotMessage?.content ?? data.content ?? "";
      const senderUserId = snapshotMessage?.senderUserId ?? data.senderUserId ?? null;
      const evaluated = new Map<number, MessageFilterMatch>();
      for (const filter of snapshotFilters) {
        if (filter.systemKey !== null || (mode !== "manual" && !filter.enabled)) continue;
        const conditions = parseConditions(filter.conditions);
        if (!conditions.length) continue;
        const match = await matchFilterConditions({ chatId: data.chatId, content, senderUserId }, conditions);
        if (match.error) {
          // Script errors can contain message text chosen by the script itself.
          appLogger.warn({ event: "filter.script.execution_failed", filterId: filter.id }, "Custom filter script execution failed during persistence");
          continue;
        }
        if (match.matched) evaluated.set(filter.id, { filterId: filter.id, matchedKeyword: match.matchedKeyword });
      }
      assertCurrent();
      return await withMessageMembershipTransaction(async (tx) => {
        assertCurrent();
        const existing = await tx.message.findUnique(messageQuery);
        const filters = await tx.filter.findMany(filterQuery);
        if (existing?.id !== snapshotMessage?.id || existing?.content !== snapshotMessage?.content ||
            existing?.senderUserId !== snapshotMessage?.senderUserId || JSON.stringify(filters) !== JSON.stringify(snapshotFilters)) throw changed;
        const existingFilterIds = new Set(existing?.filterMemberships.map((membership) => membership.filterId));
        if (existing && existing.senderUserId === null && senderUserId !== null) {
          await tx.message.update({ where: { id: existing.id }, data: { senderUserId } });
        }
        const removals = await tx.messageRemoval.findMany({
          where: {
            chatId: data.chatId,
            telegramMessageId: data.telegramMessageId,
            filterId: { in: [...candidateIds] },
          },
          select: { filterId: true, blockBackfill: true },
        });
        const blockedFilterIds = removals
          .filter((removal) => mode === "automatic" || removal.blockBackfill)
          .map((removal) => removal.filterId);
        const blockedIds = new Set(blockedFilterIds);
        const allowedMatches = filters.flatMap((filter) => {
          const match = evaluated.get(filter.id);
          return match && !blockedIds.has(filter.id) ? [match] : [];
        });
        // 数据库查询顺序不是规则优先级；兼容旧监听链路按调用方顺序选择首个通知规则。
        const candidateOrder = new Map(uniqueMatches.map((match, index) => [match.filterId, index]));
        allowedMatches.sort((left, right) => candidateOrder.get(left.filterId)! - candidateOrder.get(right.filterId)!);
        if (allowedMatches.length === 0) {
          assertCurrent();
          return { rowId: null, created: false, addedFilterIds: [], addedMatches: [], blockedFilterIds };
        }
        const addedMatches = allowedMatches.filter((match) => !existingFilterIds.has(match.filterId));
        let rowId = existing?.id;
        if (rowId === undefined) {
          const primary = allowedMatches[0];
          const created = await tx.message.create({
            data: { ...data, matchedFilterId: primary.filterId, matchedKeyword: primary.matchedKeyword },
            select: { id: true },
          });
          rowId = created.id;
        }
        if (addedMatches.length > 0) {
          await tx.messageFilterMembership.createMany({
            data: addedMatches.map((match) => ({
              messageId: rowId,
              filterId: match.filterId,
              matchedKeyword: match.matchedKeyword,
              createdAt: new Date().toISOString(),
            })),
          });
        }
        if (mode === "manual") {
          // 成功恢复当前规则后才清除标记，其他规则的移除状态保持原样。
          await tx.messageRemoval.deleteMany({
            where: {
              chatId: data.chatId,
              telegramMessageId: data.telegramMessageId,
              filterId: { in: allowedMatches.map((match) => match.filterId) },
              blockBackfill: false,
            },
          });
        }
        if (existing && addedMatches.length > 0) await synchronizeMessageMemberships(tx, [rowId]);
        let notifyTargetCount = 0;
        assertCurrent();
        if (!existing && mode === "automatic" && options.notify) {
          const primary = allowedMatches[0]!;
          const filter = filters.find((item) => item.id === primary.filterId)!;
          notifyTargetCount = await enqueueMatchedMessage(tx, {
            rowId, messageKey: `${data.chatId}:${data.telegramMessageId}`, filterId: filter.id,
            filterName: filter.name, matchedKeyword: primary.matchedKeyword,
            chatTitle: data.chatTitle ?? data.chatId, senderName: data.senderName ?? "Unknown", senderId: data.senderId ?? "",
            content: data.content || (data.mediaType ? `[${data.mediaType}]` : ""),
            messageDate: data.messageDate, telegramLink: data.telegramLink ?? "",
          });
        }
        assertCurrent();
        return {
          rowId,
          created: !existing,
          addedFilterIds: addedMatches.map((match) => match.filterId),
          addedMatches,
          blockedFilterIds,
          ...(options.notify ? { notifyTargetCount } : {}),
        };
      });
    } catch (error) {
      if (error === cancelled) return empty;
      if (error !== changed) throw error;
    }
  }
  throw new Error("Message rules changed repeatedly; ingestion will retry during catch-up");
}
