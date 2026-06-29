import {
  filterBackfillResponseSchema,
  filterDeleteResponseSchema,
  filterListSchema,
  filterPreviewResponseSchema,
  filterSchema,
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
  preview: (data: FilterPreviewInput) =>
    request(
      "/filters/preview",
      {
        method: "POST",
        body: JSON.stringify(data),
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
};
