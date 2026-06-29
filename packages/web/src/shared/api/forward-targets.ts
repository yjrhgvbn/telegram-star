import {
  forwardTargetActionResponseSchema,
  forwardTargetListSchema,
  forwardTargetSchema,
  type ForwardTargetCreateInput,
  type ForwardTargetTestInput,
  type ForwardTargetUpdateInput,
} from "@telegram-star/shared/contracts/forward-targets";
import { request } from "./request";

export const forwardTargetsApi = {
  list: () => request("/forward-targets", undefined, forwardTargetListSchema),
  create: (data: ForwardTargetCreateInput) =>
    request(
      "/forward-targets",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      forwardTargetSchema,
    ),
  update: (id: number, data: ForwardTargetUpdateInput) =>
    request(
      `/forward-targets/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
      forwardTargetSchema,
    ),
  delete: (id: number) =>
    request(
      `/forward-targets/${id}`,
      { method: "DELETE" },
      forwardTargetActionResponseSchema,
    ),
  test: (appriseUrl: string) => {
    const data: ForwardTargetTestInput = { appriseUrl };
    return request(
      "/forward-targets/test",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      forwardTargetActionResponseSchema,
    );
  },
};
