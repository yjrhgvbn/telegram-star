import {
  filterGroupActionResponseSchema,
  type FilterManualOrderInput,
  type FilterPlacementInput,
} from "@telegram-star/shared/contracts/filter-groups";
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
  type FilterFocusInput,
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
  setFocused: (id: number, data: FilterFocusInput) =>
    request(
      `/filters/${id}/focus`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
      filterSchema,
    ),
  setPlacement: (id: number, data: FilterPlacementInput) =>
    request(
      `/filters/${id}/placement`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
      filterSchema,
    ),
  reorderManual: (data: FilterManualOrderInput) =>
    request(
      "/filters/manual-order",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
      filterGroupActionResponseSchema,
    ),
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
