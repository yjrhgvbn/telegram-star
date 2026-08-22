import {
  filterGroupActionResponseSchema,
  filterGroupLayoutSchema,
  filterGroupListSchema,
  filterGroupSchema,
  type FilterGroupCreateInput,
  type FilterGroupOrderInput,
  type FilterGroupUpdateInput,
} from "@telegram-star/shared/contracts/filter-groups";
import { request } from "./request";

export const filterGroupsApi = {
  list: () => request("/filter-groups", undefined, filterGroupListSchema),
  layout: () => request("/filter-groups/layout", undefined, filterGroupLayoutSchema),
  create: (data: FilterGroupCreateInput) =>
    request(
      "/filter-groups",
      { method: "POST", body: JSON.stringify(data) },
      filterGroupSchema,
    ),
  update: (id: number, data: FilterGroupUpdateInput) =>
    request(
      `/filter-groups/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
      filterGroupSchema,
    ),
  delete: (id: number) =>
    request(
      `/filter-groups/${id}`,
      { method: "DELETE" },
      filterGroupActionResponseSchema,
    ),
  reorder: (data: FilterGroupOrderInput) =>
    request(
      "/filter-groups/order",
      { method: "PUT", body: JSON.stringify(data) },
      filterGroupActionResponseSchema,
    ),
};
