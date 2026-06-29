import { db } from "../../db/index.js";
import type {
  FilterCreateInput,
  FilterUpdateInput,
} from "@telegram-star/shared/contracts/filters";
import { serializeConditions } from "../../services/filter-matching.js";

export type FilterRow = Awaited<ReturnType<typeof findFilterRows>>[number];

const filterForwardTargetsInclude = {
  forwardTargets: { select: { id: true } },
} as const;

export async function findFilterRows() {
  return db.filter.findMany({
    include: filterForwardTargetsInclude,
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
    include: filterForwardTargetsInclude,
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
  return db.filter.update({
    where: { id },
    data: buildFilterUpdateData(input),
    include: filterForwardTargetsInclude,
  });
}

export async function toggleFilterRow(id: number, enabled: boolean): Promise<FilterRow> {
  return db.filter.update({
    where: { id },
    data: {
      enabled,
      updatedAt: new Date().toISOString(),
    },
    include: filterForwardTargetsInclude,
  });
}

export async function deleteFilterWithMessages(id: number): Promise<void> {
  // Message.matchedFilterId 代表命中来源；删除过滤器时同步删除关联消息，
  // 避免列表里留下无法解释来源的历史命中记录。
  await db.message.deleteMany({ where: { matchedFilterId: id } });
  await db.filter.delete({ where: { id } });
}
