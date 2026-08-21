import type { AuthStatus } from "../types";
import { chatsApi } from "@/shared/api/chats";
import { clientsApi } from "@/shared/api/clients";
import { configApi } from "@/shared/api/config";
import { filtersApi } from "@/shared/api/filters";
import { forwardTargetsApi } from "@/shared/api/forward-targets";
import { messagesApi } from "@/shared/api/messages";
import { request } from "@/shared/api/request";

export type {
  AppConfigStatus,
  AppConfigUpdate,
  MediaConfigStatus,
  TelegramConfigStatus,
} from "@telegram-star/shared/contracts/config";

// Auth
export const api = {
  clients: clientsApi,

  config: configApi,

  auth: {
    status: () => request<AuthStatus>("/auth/status"),
    sendCode: (phone: string) =>
      request<{ status: string }>("/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ phone }),
      }),
    login: (phone: string, code: string, password?: string) =>
      request<{ status: string; error?: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, code, password }),
      }),
    logout: () =>
      request<{ status: string }>("/auth/logout", { method: "POST" }),
  },

  filters: filtersApi,

  chats: chatsApi,

  messages: messagesApi,

  forwardTargets: forwardTargetsApi,
};
