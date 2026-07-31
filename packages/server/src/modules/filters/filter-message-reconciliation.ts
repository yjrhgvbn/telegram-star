import type { FilterCondition } from "@telegram-star/shared/contracts/filters";
import { matchFilterConditions } from "../../services/filter-matching.js";

export interface FilterMessageCandidate {
  id: number;
  chatId: string;
  content: string;
  matchedKeyword: string | null;
}

export interface FilterMessageKeywordUpdate {
  messageIds: number[];
  matchedKeyword: string | null;
}

export interface FilterMessageReconciliationPlan {
  messageIdsToDelete: number[];
  keywordUpdates: FilterMessageKeywordUpdate[];
}

/**
 * 重新按过滤器的新条件评估历史归属：不再命中的消息删除，仍命中的消息同步关键词。
 * 该函数保持纯计算，数据库写入由 repository 在同一事务中执行。
 */
export function planFilterMessageReconciliation(
  messages: FilterMessageCandidate[],
  conditions: FilterCondition[],
): FilterMessageReconciliationPlan {
  const messageIdsToDelete: number[] = [];
  const messageIdsByKeyword = new Map<string | null, number[]>();

  for (const message of messages) {
    const match = matchFilterConditions(
      { chatId: message.chatId, content: message.content },
      conditions,
    );

    if (!match.matched) {
      messageIdsToDelete.push(message.id);
      continue;
    }

    if (match.matchedKeyword === message.matchedKeyword) continue;

    const messageIds = messageIdsByKeyword.get(match.matchedKeyword) ?? [];
    messageIds.push(message.id);
    messageIdsByKeyword.set(match.matchedKeyword, messageIds);
  }

  return {
    messageIdsToDelete,
    keywordUpdates: Array.from(messageIdsByKeyword, ([matchedKeyword, messageIds]) => ({
      messageIds,
      matchedKeyword,
    })),
  };
}
