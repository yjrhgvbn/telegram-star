import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type { Filter, Message, MessageStats } from "@/types";
import { useMessageEvents } from "./useMessageEvents";
import {
  useMessagePagination,
  type UseMessagePaginationOptions,
} from "./useMessagePagination";

type UseMessagesOptions = UseMessagePaginationOptions;

export interface UseMessagesReturn {
  messages: Message[];         // ASC 顺序（旧→新），与页面渲染顺序一致
  hasOlder: boolean;           // 是否有更旧的消息可加载
  hasNewer: boolean;           // 是否有更新的消息可加载
  loading: boolean;            // 初始加载中
  loadingOlder: boolean;       // 向上加载更旧消息中
  loadingNewer: boolean;       // 向下加载更新消息中
  anchorId: number | null;     // 初始定位锚点消息 ID（null 时默认滚底）
  hasPendingNew: boolean;      // SSE 推送了新消息但用户不在底部，需显示 badge
  loadOlder: () => void;       // 触发加载更旧消息（prepend）
  loadNewer: () => void;       // 触发加载更新消息（append）
  flushPending: () => void;    // 用户点击 badge 时：清除 pending 状态并触发 loadNewer
  setAtBottom: (v: boolean) => void; // MessageList 通知当前是否在底部
  toggleRead: (id: number) => Promise<void>;
  recordTelegramOpen: (id: number) => void;
  markAsReadLocal: (ids: number[]) => void;
  refresh: () => void;
}

export function useMessages(options: UseMessagesOptions = {}): UseMessagesReturn {
  const queryClient = useQueryClient();
  const {
    messages,
    hasOlder,
    hasNewer,
    loading,
    loadingOlder,
    loadingNewer,
    anchorId,
    hasPendingNew,
    loadOlder,
    loadNewer,
    flushPending,
    setAtBottom,
    markAsReadLocal,
    setMessageReadState,
    refresh,
  } = useMessagePagination(options);

  const loadNewerRef = useRef(loadNewer);
  loadNewerRef.current = loadNewer;

  const invalidateFilterActivity = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
  }, [queryClient]);

  const handleNewMessageEvent = useCallback(() => {
    void loadNewerRef.current({ announceWhenAwayFromBottom: true });
    invalidateFilterActivity();
  }, [invalidateFilterActivity]);

  useMessageEvents({
    onNewMessage: handleNewMessageEvent,
    onReadMessages: markAsReadLocal,
  });

  const toggleRead = useCallback(async (id: number) => {
    const updated = await api.messages.toggleRead(id);
    setMessageReadState(id, updated.isRead);
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    if (updated.isRead) invalidateFilterActivity();
  }, [invalidateFilterActivity, queryClient, setMessageReadState]);

  const recordTelegramOpen = useCallback((id: number) => {
    void api.messages
      .recordEngagement(id, { type: "opened_telegram" })
      .then((engagement) => {
        if (!engagement.recorded || engagement.filterId === null) return;

        queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
          (current ?? []).map((filter) =>
            filter.id === engagement.filterId
              ? {
                  ...filter,
                  lastEngagedAt: engagement.lastEngagedAt,
                  lastEngagementType: engagement.lastEngagementType,
                  lastEngagedMessageId: engagement.lastEngagedMessageId,
                }
              : filter,
          ),
        );
      })
      .catch((error: unknown) => {
        console.error("[MessageEngagement] failed to record Telegram open", error);
      });
  }, [queryClient]);

  const refreshMessages = useCallback(() => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    invalidateFilterActivity();
  }, [invalidateFilterActivity, queryClient, refresh]);

  return {
    messages,
    hasOlder,
    hasNewer,
    loading,
    loadingOlder,
    loadingNewer,
    anchorId,
    hasPendingNew,
    loadOlder,
    loadNewer,
    flushPending,
    setAtBottom,
    toggleRead,
    recordTelegramOpen,
    markAsReadLocal,
    refresh: refreshMessages,
  };
}

export function useStats() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<MessageStats>({
    queryKey: queryKeys.messages.stats,
    queryFn: api.messages.stats,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
  }, [queryClient]);

  return {
    stats: data ?? { total: 0, unread: 0, today: 0 },
    loading: isLoading,
    refresh,
  };
}
