import { db } from "../../db/index.js";
import type {
  FilterCreateInput,
  FilterUpdateInput,
} from "@telegram-star/shared/contracts/filters";
import { serializeConditions } from "../../services/filter-matching.js";
import { planFilterMessageReconciliation } from "./filter-message-reconciliation.js";

export type FilterRow = Awaited<ReturnType<typeof findFilterRows>>[number];

const filterApiInclude = {
  forwardTargets: { select: { id: true } },
  messages: {
    orderBy: [
      { messageDate: "desc" },
      { telegramMessageId: "desc" },
    ],
    take: 1,
    select: { messageDate: true },
  },
} as const;

const MESSAGE_WRITE_BATCH_SIZE = 500;

function toMessageIdBatches(messageIds: number[]): number[][] {
  const batches: number[][] = [];
  for (let index = 0; index < messageIds.length; index += MESSAGE_WRITE_BATCH_SIZE) {
    batches.push(messageIds.slice(index, index + MESSAGE_WRITE_BATCH_SIZE));
  }
  return batches;
}

export async function findFilterRows() {
  return db.filter.findMany({
    include: filterApiInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function findFilterById(id: number) {
  return db.filter.findUnique({ where: { id } });
}

export async function createFilterRow(input: FilterCreateInput): Promise<FilterRow> {
  const now = new Date().toISOString();
  return db.filter.create({
    data: {
      name: input.name,
      conditions: serializeConditions(input.conditions),
      autoLocateUnreadNearRead: input.autoLocateUnreadNearRead ?? true,
      ...(input.forwardTargetIds !== undefined
        ? { forwardTargets: { connect: input.forwardTargetIds.map((id) => ({ id })) } }
        : {}),
      createdAt: now,
      updatedAt: now,
    },
    include: filterApiInclude,
  });
}

export function buildFilterUpdateData(input: FilterUpdateInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.conditions !== undefined
      ? {
          conditions: serializeConditions(input.conditions),
        }
      : {}),
    ...(input.autoLocateUnreadNearRead !== undefined
      ? { autoLocateUnreadNearRead: input.autoLocateUnreadNearRead }
      : {}),
    ...(input.forwardTargetIds !== undefined
      ? {
          forwardTargets: {
            set: input.forwardTargetIds.map((id) => ({ id })),
          },
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateFilterRow(id: number, input: FilterUpdateInput): Promise<FilterRow> {
  if (input.conditions === undefined) {
    return db.filter.update({
      where: { id },
      data: buildFilterUpdateData(input),
      include: filterApiInclude,
    });
  }

  // 规则与历史归属必须原子更新，避免新规则生效后仍短暂展示旧规则命中的消息。
  return db.$transaction(async (transaction) => {
    await transaction.filter.update({
      where: { id },
      data: buildFilterUpdateData(input),
    });
    const messages = await transaction.message.findMany({
      where: { matchedFilterId: id },
      select: {
        id: true,
        chatId: true,
        content: true,
        matchedKeyword: true,
      },
    });
    const reconciliation = planFilterMessageReconciliation(messages, input.conditions);

    for (const messageIds of toMessageIdBatches(reconciliation.messageIdsToDelete)) {
      await transaction.message.deleteMany({
        where: {
          id: { in: messageIds },
          matchedFilterId: id,
        },
      });
    }

    for (const keywordUpdate of reconciliation.keywordUpdates) {
      for (const messageIds of toMessageIdBatches(keywordUpdate.messageIds)) {
        await transaction.message.updateMany({
          where: {
            id: { in: messageIds },
            matchedFilterId: id,
          },
          data: { matchedKeyword: keywordUpdate.matchedKeyword },
        });
      }
    }

    // 规则变更可能删除历史命中，必须在清理完成后再读取活动摘要。
    return transaction.filter.findUniqueOrThrow({
      where: { id },
      include: filterApiInclude,
    });
  });
}

export async function toggleFilterRow(id: number, enabled: boolean): Promise<FilterRow> {
  return db.filter.update({
    where: { id },
    data: {
      enabled,
      updatedAt: new Date().toISOString(),
    },
    include: filterApiInclude,
  });
}

export async function deleteFilterWithMessages(id: number): Promise<void> {
  // Message.matchedFilterId 代表命中来源；删除过滤器时同步删除关联消息，
  // 避免列表里留下无法解释来源的历史命中记录。
  await db.message.deleteMany({ where: { matchedFilterId: id } });
  await db.filter.delete({ where: { id } });
}
