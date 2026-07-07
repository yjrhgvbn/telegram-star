import {
  clientDeviceActionResponseSchema,
  clientDeviceHeartbeatResponseSchema,
  clientDeviceListSchema,
  clientDeviceSchema,
  type ClientDeviceRegisterInput,
} from "@telegram-star/shared/contracts/clients";
import { request } from "./request";

export const clientsApi = {
  list: () => request("/clients", undefined, clientDeviceListSchema),
  register: (data: ClientDeviceRegisterInput) =>
    request(
      "/clients/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      clientDeviceSchema,
    ),
  heartbeat: (id: string) =>
    request(
      `/clients/${encodeURIComponent(id)}/heartbeat`,
      { method: "PATCH" },
      clientDeviceHeartbeatResponseSchema,
    ),
  delete: (id: string) =>
    request(
      `/clients/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      clientDeviceActionResponseSchema,
    ),
};
