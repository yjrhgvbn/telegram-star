import {
  chatDiscoveryResponseSchema,
  joinedChatListSchema,
} from "@telegram-star/shared/contracts/chats";
import type { LiveChatMessage } from "@telegram-star/shared/contracts/filters";
import { request } from "./request";

export const chatsApi = {
  list: () => request("/chats", undefined, joinedChatListSchema),

  discover: (
    params: { query: string; limit?: number },
    signal?: AbortSignal,
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.query);
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return request(
      `/chats/discover?${searchParams.toString()}`,
      { signal },
      chatDiscoveryResponseSchema,
    );
  },

  messagesByChat: (params: { chatId: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("chatId", params.chatId);
    if (params.limit) searchParams.set("limit", params.limit.toString());

    return request<{ chatId: string; messages: LiveChatMessage[] }>(
      `/chats/messages?${searchParams.toString()}`,
    );
  },
};
