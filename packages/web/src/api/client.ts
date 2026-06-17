import type {
  Filter,
  FilterCondition,
  JoinedChat,
  MessageResponse,
  Stats,
  AuthStatus,
  NotificationSettings,
  NotificationSource,
  FilterPreviewResponse,
  FilterBackfillResponse,
  FilterHistoryScope,
  ReadSyncLog,
} from "../types";

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined && options?.body !== null;
  const res = await fetch(`${BASE}${url}`, {
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export const api = {
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

  filters: {
    list: () => request<Filter[]>("/filters"),
    create: (data: { name: string; conditions: FilterCondition[]; autoLocateUnreadNearRead?: boolean }) =>
      request<Filter>("/filters", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name?: string; conditions?: FilterCondition[]; autoLocateUnreadNearRead?: boolean }) =>
      request<Filter>(`/filters/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    preview: (data: { conditions: FilterCondition[] } & FilterHistoryScope) =>
      request<FilterPreviewResponse>("/filters/preview", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ success: boolean }>(`/filters/${id}`, { method: "DELETE" }),
    toggle: (id: number) =>
      request<Filter>(`/filters/${id}/toggle`, { method: "PATCH" }),
    backfill: (id: number, data?: FilterHistoryScope) =>
      request<FilterBackfillResponse>(`/filters/${id}/backfill`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
  },

  chats: {
    list: () => request<JoinedChat[]>("/chats"),
    messagesByChat: (params: { chatId: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      searchParams.set("chatId", params.chatId);
      if (params.limit) searchParams.set("limit", params.limit.toString());
      return request<{ chatId: string; messages: import("../types").LiveChatMessage[] }>(`/chats/messages?${searchParams.toString()}`);
    },
  },

  messages: {
    /**
     * 游标分页加载消息，data 返回 ASC（旧→新）顺序。
     * - 无 cursorId：返回最新 limit 条
     * - direction=before：加载比 cursorId 更旧的消息（prepend）
     * - direction=after：加载比 cursorId 更新的消息（append）
     * - direction=around：游标两侧各 limit/2（锚点加载）
     * - autoLocate=true：服务端自动计算锚点并以 around 模式加载，响应附带 anchorId
     */
    list: (params?: {
      cursorId?: number;
      direction?: "before" | "after" | "around";
      autoLocate?: boolean;
      limit?: number;
      isRead?: string;
      filterId?: string;
      search?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.cursorId !== undefined) searchParams.set("cursorId", params.cursorId.toString());
      if (params?.direction) searchParams.set("direction", params.direction);
      if (params?.autoLocate) searchParams.set("autoLocate", "true");
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      if (params?.isRead !== undefined && params.isRead !== "") searchParams.set("isRead", params.isRead);
      if (params?.filterId) searchParams.set("filterId", params.filterId);
      if (params?.search) searchParams.set("search", params.search);
      const qs = searchParams.toString();
      return request<MessageResponse>(`/messages${qs ? `?${qs}` : ""}`);
    },
    toggleRead: (id: number) =>
      request<{ id: number; isRead: boolean }>(`/messages/${id}/read`, {
        method: "PATCH",
      }),
    batchRead: (ids: number[]) =>
      request<{ success: boolean }>("/messages/batch-read", {
        method: "PATCH",
        body: JSON.stringify({ ids }),
      }),
    forceSyncRead: (ids: number[]) =>
      request<{ markedIds: number[] }>("/messages/force-sync-read", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    stats: () => request<Stats>("/messages/stats"),
    readSyncLogs: (limit = 100) => {
      const searchParams = new URLSearchParams();
      searchParams.set("limit", String(limit));
      return request<{ data: ReadSyncLog[] }>(`/messages/read-sync-logs?${searchParams.toString()}`);
    },
  },

  forwardTargets: {
    list: () => request<any[]>("/forward-targets"),
    create: (data: { name: string; appriseUrl: string; enabled: boolean; filterIds: number[] }) =>
      request<any>("/forward-targets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name: string; appriseUrl: string; enabled: boolean; filterIds: number[] }) =>
      request<any>(`/forward-targets/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ success: boolean }>(`/forward-targets/${id}`, { method: "DELETE" }),
    test: (appriseUrl: string) =>
      request<{ success: boolean }>("/forward-targets/test", {
        method: "POST",
        body: JSON.stringify({ appriseUrl }),
      }),
  },
};
