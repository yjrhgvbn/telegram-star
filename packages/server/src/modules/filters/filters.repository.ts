import { db } from "../../db/index.js";
import type {
  FilterManualOrderInput,
  FilterPlacementInput,
} from "@telegram-star/shared/contracts/filter-groups";
import type {
  FilterCreateInput,
  FilterFocusInput,
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
  return db.$transaction(async (transaction) => {
    const { _max } = await transaction.filter.aggregate({
      where: { manualGroupId: null },
      _max: { manualSortOrder: true },
    });

    return transaction.filter.create({
      data: {
        name: input.name,
        conditions: serializeConditions(input.conditions),
        autoLocateUnreadNearRead: input.autoLocateUnreadNearRead ?? true,
        manualSortOrder: (_max.manualSortOrder ?? -1) + 1,
        ...(input.forwardTargetIds !== undefined
          ? { forwardTargets: { connect: input.forwardTargetIds.map((id) => ({ id })) } }
          : {}),
        createdAt: now,
        updatedAt: now,
      },
      include: filterApiInclude,
    });
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

export async function setFilterFocusedRow(
  id: number,
  input: FilterFocusInput,
): Promise<FilterRow> {
  return db.filter.update({
    where: { id },
    data: {
      isFocused: input.isFocused,
      updatedAt: new Date().toISOString(),
    },
    include: filterApiInclude,
  });
}

export async function setFilterPlacementRow(
  id: number,
  input: FilterPlacementInput,
): Promise<FilterRow> {
  // 跨分组移动会同时改变源分组和目标分组的连续顺序，必须作为一次原子操作提交。
  return db.$transaction(async (transaction) => {
    const current = await transaction.filter.findUniqueOrThrow({
      where: { id },
      select: { manualGroupId: true },
    });
    const sourceGroupId = current.manualGroupId;
    const targetGroupId = input.manualGroupId;
    const sourceRows = await transaction.filter.findMany({
      where: { manualGroupId: sourceGroupId, id: { not: id } },
      orderBy: [
        { manualSortOrder: "asc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      select: { id: true },
    });
    const targetRows = sourceGroupId === targetGroupId
      ? sourceRows
      : await transaction.filter.findMany({
          where: { manualGroupId: targetGroupId, id: { not: id } },
          orderBy: [
            { manualSortOrder: "asc" },
            { createdAt: "desc" },
            { id: "asc" },
          ],
          select: { id: true },
        });
    const targetIds = targetRows.map((filter) => filter.id);
    const targetIndex = Math.min(input.targetIndex ?? targetIds.length, targetIds.length);
    targetIds.splice(targetIndex, 0, id);
    const now = new Date().toISOString();

    if (sourceGroupId !== targetGroupId) {
      for (const [manualSortOrder, filter] of sourceRows.entries()) {
        await transaction.filter.update({
          where: { id: filter.id },
          data: { manualSortOrder, updatedAt: now },
        });
      }
    }

    for (const [manualSortOrder, filterId] of targetIds.entries()) {
      await transaction.filter.update({
        where: { id: filterId },
        data: {
          manualGroupId: targetGroupId,
          manualSortOrder,
          updatedAt: now,
        },
      });
    }

    return transaction.filter.findUniqueOrThrow({
      where: { id },
      include: filterApiInclude,
    });
  });
}

export async function findManualFilterIds(manualGroupId: number | null): Promise<number[]> {
  const filters = await db.filter.findMany({
    where: { manualGroupId },
    orderBy: [
      { manualSortOrder: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    select: { id: true },
  });
  return filters.map((filter) => filter.id);
}

export async function reorderManualFilterRows(input: FilterManualOrderInput): Promise<void> {
  if (input.filterIds.length === 0) return;
  const now = new Date().toISOString();
  await db.$transaction(
    input.filterIds.map((id, manualSortOrder) =>
      db.filter.update({
        where: { id },
        data: { manualSortOrder, updatedAt: now },
      }),
    ),
  );
}

export async function deleteFilterWithMessages(id: number): Promise<void> {
  // Message.matchedFilterId 代表命中来源；删除过滤器时同步删除关联消息，
  // 避免列表里留下无法解释来源的历史命中记录。
  await db.$transaction([
    db.message.deleteMany({ where: { matchedFilterId: id } }),
    db.filter.delete({ where: { id } }),
  ]);
}
