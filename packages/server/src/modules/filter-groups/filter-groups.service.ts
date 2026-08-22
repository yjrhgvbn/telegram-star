import {
  filterGroupActionResponseSchema,
  filterGroupLayoutSchema,
  filterGroupListSchema,
  filterGroupSchema,
  type FilterGroup,
  type FilterGroupActionResponse,
  type FilterGroupCreateInput,
  type FilterGroupLayout,
  type FilterGroupOrderInput,
  type FilterGroupUpdateInput,
} from "@telegram-star/shared/contracts/filter-groups";
import {
  createFilterGroupRow,
  deleteFilterGroupAndReleaseFilters,
  findFilterGroupById,
  findFilterGroupLayoutPosition,
  findFilterGroupByName,
  findFilterGroupRows,
  reorderFilterGroupRows,
  type FilterGroupRow,
  updateFilterGroupRow,
} from "./filter-groups.repository.js";

export class FilterGroupNotFoundError extends Error {
  constructor() {
    super("Filter group not found");
  }
}

export class FilterGroupNameConflictError extends Error {
  constructor() {
    super("Filter group name already exists");
  }
}

export class FilterGroupOrderMismatchError extends Error {
  constructor() {
    super("Filter group order must contain every group exactly once");
  }
}

function haveSameIds(currentIds: number[], nextIds: number[]): boolean {
  if (currentIds.length !== nextIds.length) return false;
  const current = new Set(currentIds);
  return nextIds.every((id) => current.has(id));
}

export function toApiFilterGroup(row: FilterGroupRow): FilterGroup {
  const { _count, ...group } = row;
  return filterGroupSchema.parse({
    ...group,
    filterCount: _count.filters,
  });
}

export async function listFilterGroups(): Promise<FilterGroup[]> {
  const rows = await findFilterGroupRows();
  return filterGroupListSchema.parse(rows.map(toApiFilterGroup));
}

export async function getFilterGroupLayout(): Promise<FilterGroupLayout> {
  const groupCount = (await findFilterGroupRows()).length;
  return filterGroupLayoutSchema.parse({
    ungroupedPosition: await findFilterGroupLayoutPosition(groupCount),
  });
}

export async function createFilterGroup(input: FilterGroupCreateInput): Promise<FilterGroup> {
  if (await findFilterGroupByName(input.name)) {
    throw new FilterGroupNameConflictError();
  }
  return toApiFilterGroup(await createFilterGroupRow(input));
}

export async function updateFilterGroup(
  id: number,
  input: FilterGroupUpdateInput,
): Promise<FilterGroup> {
  if (!(await findFilterGroupById(id))) throw new FilterGroupNotFoundError();
  if (await findFilterGroupByName(input.name, id)) {
    throw new FilterGroupNameConflictError();
  }
  return toApiFilterGroup(await updateFilterGroupRow(id, input));
}

export async function deleteFilterGroup(id: number): Promise<FilterGroupActionResponse> {
  if (!(await findFilterGroupById(id))) throw new FilterGroupNotFoundError();
  await deleteFilterGroupAndReleaseFilters(id);
  return filterGroupActionResponseSchema.parse({ success: true });
}

export async function reorderFilterGroups(
  input: FilterGroupOrderInput,
): Promise<FilterGroupActionResponse> {
  const currentIds = (await findFilterGroupRows()).map((group) => group.id);
  if (!haveSameIds(currentIds, input.ids)) throw new FilterGroupOrderMismatchError();
  const ungroupedPosition = input.ungroupedPosition ?? input.ids.length;
  if (ungroupedPosition > input.ids.length) throw new FilterGroupOrderMismatchError();
  await reorderFilterGroupRows({ ...input, ungroupedPosition });
  return filterGroupActionResponseSchema.parse({ success: true });
}
