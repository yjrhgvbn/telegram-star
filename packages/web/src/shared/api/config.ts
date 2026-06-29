import {
  appConfigStatusSchema,
  type AppConfigUpdate,
} from "@telegram-star/shared/contracts/config";
import { request } from "./request";

export const configApi = {
  get: () => request("/config", undefined, appConfigStatusSchema),
  update: (data: AppConfigUpdate) =>
    request(
      "/config",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
      appConfigStatusSchema,
    ),
};
