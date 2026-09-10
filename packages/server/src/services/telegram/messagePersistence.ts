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
}

/** 检查移除标记与归属写入必须在同一事务内，避免回补把刚移除的归属写回来。 */
export async function persistMessageForFilters(
  data: Prisma.MessageUncheckedCreateInput,
  matches: MessageFilterMatch[],
  mode: "automatic" | "manual" = "automatic",
): Promise<MessagePersistenceResult> {
  return withMessageMembershipTransaction(async (tx) => {
    const uniqueMatches = [...new Map(matches.map((match) => [match.filterId, match])).values()];
    const existing = await tx.message.findUnique({
      where: {
        chatId_telegramMessageId: { chatId: data.chatId, telegramMessageId: data.telegramMessageId },
      },
      select: { id: true, content: true, senderUserId: true, filterMemberships: { select: { filterId: true } } },
    });
    // 旧 senderId 未区分用户和频道，不能猜测。只在正常再次获取消息时补齐已确认的用户身份，
    // 保留已存正文、已读状态和规则归属，也不为这项元数据补齐发起额外 Telegram 请求。
    const senderUserId = existing?.senderUserId ?? data.senderUserId ?? null;
    if (existing && existing.senderUserId === null && senderUserId !== null) {
      await tx.message.update({ where: { id: existing.id }, data: { senderUserId } });
    }
    const existingFilterIds = new Set(existing?.filterMemberships.map((membership) => membership.filterId));
    const candidateIds = new Set(uniqueMatches.map((match) => match.filterId));
    // 规则可能在 Telegram 网络等待期间被修改。旧匹配结果仅提供候选 ID，
    // 必须使用同一写事务内的最新条件和最终要展示的正文重新判断。
    const filters = await tx.filter.findMany({
      where: { id: { in: [...candidateIds] } },
      select: { id: true, conditions: true, enabled: true, systemKey: true },
    });
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
    // 已存在的正文沿用原有不覆盖语义；新增规则归属也要匹配这份已保存内容。
    const content = existing?.content ?? data.content ?? "";
    const allowedMatches: MessageFilterMatch[] = [];
    for (const filter of filters) {
      if (filter.systemKey !== null || blockedIds.has(filter.id)) continue;
      const conditions = parseConditions(filter.conditions);
      // 损坏或执行失败的规则不新增归属，也不影响已经保存的消息。
      if (conditions.length === 0) continue;
      const match = matchFilterConditions({ chatId: data.chatId, content, senderUserId }, conditions);
      if (match.error) {
        appLogger.warn({ event: "filter.script.execution_failed", filterId: filter.id, err: match.error }, "Custom filter script execution failed during persistence");
        continue;
      }
      if (!match.matched) continue;
      const latestMatch = { filterId: filter.id, matchedKeyword: match.matchedKeyword };
      if (mode === "manual" || filter.enabled) allowedMatches.push(latestMatch);
    }
    // 数据库查询顺序不是规则优先级；兼容旧监听链路按调用方顺序选择首个通知规则。
    const candidateOrder = new Map(uniqueMatches.map((match, index) => [match.filterId, index]));
    allowedMatches.sort((left, right) => candidateOrder.get(left.filterId)! - candidateOrder.get(right.filterId)!);
    if (allowedMatches.length === 0) {
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
    return {
      rowId,
      created: !existing,
      addedFilterIds: addedMatches.map((match) => match.filterId),
      addedMatches,
      blockedFilterIds,
    };
  });
}
