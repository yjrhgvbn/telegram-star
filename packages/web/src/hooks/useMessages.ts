import { useCallback } from "react";
import useSWR from "swr";
import { api } from "../api/client";
import type { MessagePagination, Stats } from "../types";

interface UseMessagesOptions {
  page?: number;
  limit?: number;
  isRead?: string;
  filterId?: string;
  search?: string;
}

export function useMessages(options: UseMessagesOptions = {}) {
  const fallbackPagination: MessagePagination = {
    page: options.page ?? 1,
    limit: options.limit ?? 20,
    total: 0,
    totalPages: 0,
  };

  const swrKey = [
    "messages",
    options.page ?? 1,
    options.limit ?? 20,
    options.isRead ?? "",
    options.filterId ?? "",
    options.search ?? "",
  ] as const;

  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    () => api.messages.list(options),
    {
      keepPreviousData: true,
      refreshInterval: 10000,
    }
  );

  const toggleRead = useCallback(async (id: number) => {
    const updated = await api.messages.toggleRead(id);

    await mutate(
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          data: current.data.map((message) =>
            message.id === id ? { ...message, isRead: updated.isRead } : message
          ),
        };
      },
      { revalidate: false }
    );
  }, [mutate]);

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    messages: data?.data ?? [],
    pagination: data?.pagination ?? fallbackPagination,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    toggleRead,
    refresh,
  };
}

export function useStats() {
  const { data, isLoading, mutate } = useSWR<Stats>("message-stats", api.messages.stats, {
    refreshInterval: 15000,
  });

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    stats: data ?? { total: 0, unread: 0, today: 0 },
    loading: isLoading,
    refresh,
  };
}
