import {
  messageBatchReadResponseSchema,
  messageForceSyncReadResponseSchema,
  messageListParamsSchema,
  messageListResponseSchema,
  messageReadStateResponseSchema,
  messageStatsSchema,
  readSyncLogsResponseSchema,
  type MessageListParams,
} from "@telegram-star/shared/contracts/messages";
import { request } from "./request";

function toMessageQuery(params?: MessageListParams): string {
  const parsed = messageListParamsSchema.parse(params ?? {});
  const searchParams = new URLSearchParams();

  if (parsed.cursorId !== undefined) searchParams.set("cursorId", String(parsed.cursorId));
  if (parsed.direction) searchParams.set("direction", parsed.direction);
  if (parsed.autoLocate !== undefined) searchParams.set("autoLocate", String(parsed.autoLocate));
  if (parsed.limit !== undefined) searchParams.set("limit", String(parsed.limit));
  if (parsed.isRead !== undefined) searchParams.set("isRead", String(parsed.isRead));
  if (parsed.filterId !== undefined) searchParams.set("filterId", String(parsed.filterId));
  if (parsed.search) searchParams.set("search", parsed.search);

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const messagesApi = {
  list: (params?: MessageListParams) =>
    request(`/messages${toMessageQuery(params)}`, undefined, messageListResponseSchema),
  toggleRead: (id: number) =>
    request(`/messages/${id}/read`, { method: "PATCH" }, messageReadStateResponseSchema),
  batchRead: (ids: number[]) =>
    request(
      "/messages/batch-read",
      {
        method: "PATCH",
        body: JSON.stringify({ ids }),
      },
      messageBatchReadResponseSchema,
    ),
  forceSyncRead: (ids: number[]) =>
    request(
      "/messages/force-sync-read",
      {
        method: "POST",
        body: JSON.stringify({ ids }),
      },
      messageForceSyncReadResponseSchema,
    ),
  stats: () => request("/messages/stats", undefined, messageStatsSchema),
  readSyncLogs: (limit = 100) => {
    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(limit));
    return request(
      `/messages/read-sync-logs?${searchParams.toString()}`,
      undefined,
      readSyncLogsResponseSchema,
    );
  },
};
