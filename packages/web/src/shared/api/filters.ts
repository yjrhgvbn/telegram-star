import {
  filterBackfillJobSchema,
  filterBackfillResponseSchema,
  filterDeleteResponseSchema,
  filterListSchema,
  nullableFilterBackfillJobSchema,
  filterPreviewResponseSchema,
  filterSchema,
  type FilterBackfillJobCreateInput,
  type FilterCreateInput,
  type FilterHistoryScope,
  type FilterPreviewInput,
  type FilterUpdateInput,
} from "@telegram-star/shared/contracts/filters";
import { request } from "./request";

export const filtersApi = {
  list: () => request("/filters", undefined, filterListSchema),
  create: (data: FilterCreateInput) =>
    request(
      "/filters",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      filterSchema,
    ),
  update: (id: number, data: FilterUpdateInput) =>
    request(
      `/filters/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
      filterSchema,
    ),
  preview: (data: FilterPreviewInput, signal?: AbortSignal) =>
    request(
      "/filters/preview",
      {
        method: "POST",
        body: JSON.stringify(data),
        signal,
      },
      filterPreviewResponseSchema,
    ),
  delete: (id: number) =>
    request(`/filters/${id}`, { method: "DELETE" }, filterDeleteResponseSchema),
  toggle: (id: number) =>
    request(`/filters/${id}/toggle`, { method: "PATCH" }, filterSchema),
  backfill: (id: number, data?: FilterHistoryScope) =>
    request(
      `/filters/${id}/backfill`,
      {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      },
      filterBackfillResponseSchema,
    ),
  startBackfillJob: (id: number, data: FilterBackfillJobCreateInput) =>
    request(
      `/filters/${id}/backfill-jobs`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      filterBackfillJobSchema,
    ),
  latestBackfillJob: (id: number) =>
    request(
      `/filters/${id}/backfill-jobs/latest`,
      undefined,
      nullableFilterBackfillJobSchema,
    ),
};
