import { useCallback, useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { SWRInfiniteKeyLoader } from "swr/infinite";
import useSWR from "swr";
import { api } from "../api/client";
import type { MessageResponse, Stats } from "../types";

interface UseMessagesOptions {
  limit?: number;
  isRead?: string;
  filterId?: string;
  search?: string;
}

export function useMessages(options: UseMessagesOptions = {}) {
  const limit = options.limit ?? 20;

  // SWR Infinite key：依赖过滤条件变化时自动重置到第 1 页
  const getKey: SWRInfiniteKeyLoader<MessageResponse> = useCallback(
    (pageIndex, previousPageData) => {
      // 已到最后一页时停止请求
      if (previousPageData && pageIndex + 1 > previousPageData.pagination.totalPages) {
        return null;
      }
      return [
        "messages-inf",
        pageIndex + 1,
        limit,
        options.isRead ?? "",
        options.filterId ?? "",
        options.search ?? "",
      ] as const;
    },
    [limit, options.isRead, options.filterId, options.search],
  );

  const { data, error, isLoading, isValidating, mutate, size, setSize } = useSWRInfinite(
    getKey,
    ([, page, lim, isRead, filterId, search]: readonly [string, number, number, string, string, string]) =>
      api.messages.list({ page, limit: lim, isRead, filterId, search }),
    { revalidateFirstPage: false },
  );

  // 过滤条件变化时重置到第 1 页
  const prevFiltersRef = useRef({ isRead: options.isRead, filterId: options.filterId, search: options.search });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.isRead !== options.isRead ||
      prev.filterId !== options.filterId ||
      prev.search !== options.search
    ) {
      prevFiltersRef.current = { isRead: options.isRead, filterId: options.filterId, search: options.search };
      void setSize(1);
    }
  }, [options.isRead, options.filterId, options.search, setSize]);

  // 开发时直连后端，绕过 Vite dev proxy 的响应缓冲问题。
  // 生产环境前端与后端同源，使用相对路径即可。
  const sseUrl = import.meta.env.DEV
    ? "http://localhost:3000/api/messages/events"
    : "/api/messages/events";

  useEffect(() => {
    const es = new EventSource(sseUrl);
    // 新消息到达时，仅重新验证已加载的所有分页
    es.onmessage = () => { void mutate(); };
    return () => es.close();
  }, [mutate, sseUrl]);

  const toggleRead = useCallback(
    async (id: number) => {
      const updated = await api.messages.toggleRead(id);

      // 乐观更新：在所有已加载的分页数据中找到该消息并更新
      await mutate(
        (pages) => {
          if (!pages) return pages;
          return pages.map((page) => ({
            ...page,
            data: page.data.map((msg) => (msg.id === id ? { ...msg, isRead: updated.isRead } : msg)),
          }));
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const loadMore = useCallback(() => {
    void setSize((s) => s + 1);
  }, [setSize]);

  // 将所有分页数据展平
  const messages = data ? data.flatMap((page) => page.data) : [];
  const lastPage = data?.[data.length - 1];
  const hasMore = lastPage ? lastPage.pagination.page < lastPage.pagination.totalPages : false;
  const isLoadingMore = isValidating && !isLoading && size > 1;

  return {
    messages,
    hasMore,
    isLoadingMore,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    toggleRead,
    refresh,
    loadMore,
  };
}

export function useStats() {
  const { data, isLoading, mutate } = useSWR<Stats>("message-stats", api.messages.stats);

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    stats: data ?? { total: 0, unread: 0, today: 0 },
    loading: isLoading,
    refresh,
  };
}
