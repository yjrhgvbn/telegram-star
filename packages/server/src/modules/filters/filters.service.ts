import {
  filterBackfillResponseSchema,
  filterDeleteResponseSchema,
  filterListSchema,
  filterPreviewResponseSchema,
  filterSchema,
  type Filter,
  type FilterBackfillResponse,
  type FilterCreateInput,
  type FilterDeleteResponse,
  type FilterHistoryScope,
  type FilterPreviewInput,
  type FilterPreviewResponse,
  type FilterUpdateInput,
} from "@telegram-star/shared/contracts/filters";
import {
  parseConditions,
  validateConditions,
} from "../../services/filter-matching.js";
import { backfillFilterHistory, previewHistoricalFilterMessages } from "../../services/telegram.js";
import {
  createFilterRow,
  deleteFilterWithMessages,
  findFilterById,
  findFilterRows,
  type FilterRow,
  toggleFilterRow,
  updateFilterRow,
} from "./filters.repository.js";

export class FilterNotFoundError extends Error {
  constructor() {
    super("Filter not found");
  }
}

function assertValidFilterConditions(conditions: FilterCreateInput["conditions"]): void {
  const validation = validateConditions(conditions);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid filter conditions");
  }
}

export function normalizeHistoryScope(scope?: FilterHistoryScope): FilterHistoryScope {
  // service 只透传用户指定的范围；默认值由 Telegram history 层统一 clamp，
  // 这样预览、回填和后续新增入口不会出现三套默认扫描策略。
  return {
    perChatLimit: scope?.perChatLimit,
    totalLimit: scope?.totalLimit,
    page: scope?.page,
    pageSize: scope?.pageSize,
  };
}

export function toApiFilter(row: FilterRow): Filter {
  const { messages, forwardTargets, ...filter } = row;

  return filterSchema.parse({
    ...filter,
    conditions: parseConditions(filter.conditions),
    forwardTargetIds: forwardTargets.map((target) => target.id),
    latestMessageAt: messages[0]?.messageDate ?? null,
  });
}

export async function previewFilterHistory(input: FilterPreviewInput): Promise<FilterPreviewResponse> {
  assertValidFilterConditions(input.conditions);
  const scope = normalizeHistoryScope(input);

  // 预览接口与回拉接口共用同一套范围参数，避免两边行为不一致。
  const result = await previewHistoricalFilterMessages({
    conditions: input.conditions,
    perChatLimit: scope.perChatLimit,
    totalLimit: scope.totalLimit,
    page: scope.page,
    pageSize: scope.pageSize,
    sampleLimit: 0,
  });

  return filterPreviewResponseSchema.parse({
    messages: result.messages,
    samples: result.samples,
    scannedChats: result.scannedChats,
    total: result.messages.length,
    nextPage: result.nextPage,
  });
}

export async function listFilters(): Promise<Filter[]> {
  const rows = await findFilterRows();
  return filterListSchema.parse(rows.map(toApiFilter));
}

export async function createFilter(input: FilterCreateInput): Promise<Filter> {
  assertValidFilterConditions(input.conditions);
  return toApiFilter(await createFilterRow(input));
}

export async function updateFilter(id: number, input: FilterUpdateInput): Promise<Filter> {
  const existing = await findFilterById(id);
  if (!existing) throw new FilterNotFoundError();

  if (input.conditions) assertValidFilterConditions(input.conditions);

  return toApiFilter(await updateFilterRow(id, input));
}

export async function deleteFilter(id: number): Promise<FilterDeleteResponse> {
  const existing = await findFilterById(id);
  if (!existing) throw new FilterNotFoundError();

  await deleteFilterWithMessages(id);
  return filterDeleteResponseSchema.parse({ success: true });
}

export async function toggleFilter(id: number): Promise<Filter> {
  const existing = await findFilterById(id);
  if (!existing) throw new FilterNotFoundError();

  return toApiFilter(await toggleFilterRow(id, !existing.enabled));
}

export async function backfillFilter(id: number, scope: FilterHistoryScope): Promise<FilterBackfillResponse> {
  const existing = await findFilterById(id);
  if (!existing) throw new FilterNotFoundError();

  const conditions = parseConditions(existing.conditions);
  assertValidFilterConditions(conditions);

  // 回填必须使用数据库里已保存的条件，而不是请求体传来的条件。
  // 这样用户点击“回拉历史”时，扫描规则始终等于当前持久化过滤器。
  return filterBackfillResponseSchema.parse(
    await backfillFilterHistory({
      filterId: existing.id,
      conditions,
      perChatLimit: scope.perChatLimit,
    }),
  );
}
