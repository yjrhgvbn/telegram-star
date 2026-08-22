import type {
  FilterGroupCreateInput,
  FilterGroupOrderInput,
  FilterGroupUpdateInput,
} from "@telegram-star/shared/contracts/filter-groups";
import { db } from "../../db/index.js";

const filterGroupApiInclude = {
  _count: { select: { filters: true } },
} as const;

const FILTER_GROUP_LAYOUT_KEY = "filter_group_layout";

function parseUngroupedPosition(valueJson: string, groupCount: number): number {
  try {
    const value = JSON.parse(valueJson) as { ungroupedPosition?: unknown };
    if (typeof value.ungroupedPosition !== "number" || !Number.isInteger(value.ungroupedPosition)) {
      return groupCount;
    }
    return Math.min(Math.max(value.ungroupedPosition, 0), groupCount);
  } catch {
    return groupCount;
  }
}

function serializeUngroupedPosition(ungroupedPosition: number): string {
  return JSON.stringify({ ungroupedPosition });
}

export type FilterGroupRow = Awaited<ReturnType<typeof findFilterGroupRows>>[number];

export async function findFilterGroupRows() {
  return db.filterGroup.findMany({
    include: filterGroupApiInclude,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function findFilterGroupById(id: number) {
  return db.filterGroup.findUnique({ where: { id } });
}

export async function findFilterGroupByName(name: string, exceptId?: number) {
  return db.filterGroup.findFirst({
    where: {
      name,
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
  });
}

export async function findFilterGroupLayoutPosition(groupCount: number): Promise<number> {
  const record = await db.appConfig.findUnique({
    where: { key: FILTER_GROUP_LAYOUT_KEY },
    select: { valueJson: true },
  });
  return record ? parseUngroupedPosition(record.valueJson, groupCount) : groupCount;
}

export async function createFilterGroupRow(
  input: FilterGroupCreateInput,
): Promise<FilterGroupRow> {
  const now = new Date().toISOString();
  return db.$transaction(async (transaction) => {
    const { _max } = await transaction.filterGroup.aggregate({
      _max: { sortOrder: true },
    });
    const existingGroupCount = await transaction.filterGroup.count();
    const layoutRecord = await transaction.appConfig.findUnique({
      where: { key: FILTER_GROUP_LAYOUT_KEY },
      select: { valueJson: true },
    });

    const created = await transaction.filterGroup.create({
      data: {
        name: input.name,
        sortOrder: (_max.sortOrder ?? -1) + 1,
        createdAt: now,
        updatedAt: now,
      },
      include: filterGroupApiInclude,
    });

    // 用户把“未分组”留在末尾时，新建分组仍应插在它前面。
    if (
      layoutRecord &&
      parseUngroupedPosition(layoutRecord.valueJson, existingGroupCount) === existingGroupCount
    ) {
      await transaction.appConfig.update({
        where: { key: FILTER_GROUP_LAYOUT_KEY },
        data: {
          valueJson: serializeUngroupedPosition(existingGroupCount + 1),
          updatedAt: now,
        },
      });
    }

    return created;
  });
}

export async function updateFilterGroupRow(
  id: number,
  input: FilterGroupUpdateInput,
): Promise<FilterGroupRow> {
  return db.filterGroup.update({
    where: { id },
    data: {
      name: input.name,
      updatedAt: new Date().toISOString(),
    },
    include: filterGroupApiInclude,
  });
}

export async function deleteFilterGroupAndReleaseFilters(id: number): Promise<void> {
  await db.$transaction(async (transaction) => {
    const orderedGroups = await transaction.filterGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const deletedGroupIndex = orderedGroups.findIndex((group) => group.id === id);
    const layoutRecord = await transaction.appConfig.findUnique({
      where: { key: FILTER_GROUP_LAYOUT_KEY },
      select: { valueJson: true },
    });
    const filters = await transaction.filter.findMany({
      where: { manualGroupId: id },
      orderBy: [
        { manualSortOrder: "asc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      select: { id: true },
    });
    const { _max } = await transaction.filter.aggregate({
      where: { manualGroupId: null },
      _max: { manualSortOrder: true },
    });
    const firstSortOrder = (_max.manualSortOrder ?? -1) + 1;
    const now = new Date().toISOString();

    // 删除的只是组织层级；其中的消息组按原顺序追加到“未分组”。
    for (const [index, filter] of filters.entries()) {
      await transaction.filter.update({
        where: { id: filter.id },
        data: {
          manualGroupId: null,
          manualSortOrder: firstSortOrder + index,
          updatedAt: now,
        },
      });
    }

    await transaction.filterGroup.delete({ where: { id } });

    if (layoutRecord && deletedGroupIndex >= 0) {
      const currentPosition = parseUngroupedPosition(
        layoutRecord.valueJson,
        orderedGroups.length,
      );
      const nextPosition = currentPosition - (deletedGroupIndex < currentPosition ? 1 : 0);
      await transaction.appConfig.update({
        where: { key: FILTER_GROUP_LAYOUT_KEY },
        data: {
          valueJson: serializeUngroupedPosition(nextPosition),
          updatedAt: now,
        },
      });
    }
  });
}

export async function reorderFilterGroupRows(input: FilterGroupOrderInput): Promise<void> {
  const now = new Date().toISOString();
  const ungroupedPosition = input.ungroupedPosition ?? input.ids.length;
  await db.$transaction(async (transaction) => {
    for (const [sortOrder, id] of input.ids.entries()) {
      await transaction.filterGroup.update({
        where: { id },
        data: { sortOrder, updatedAt: now },
      });
    }

    await transaction.appConfig.upsert({
      where: { key: FILTER_GROUP_LAYOUT_KEY },
      create: {
        key: FILTER_GROUP_LAYOUT_KEY,
        valueJson: serializeUngroupedPosition(ungroupedPosition),
        createdAt: now,
        updatedAt: now,
      },
      update: {
        valueJson: serializeUngroupedPosition(ungroupedPosition),
        updatedAt: now,
      },
    });
  });
}
