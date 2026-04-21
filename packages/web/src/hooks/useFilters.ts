import { useCallback } from "react";
import useSWR from "swr";
import { api } from "../api/client";
import type { Filter, FilterCondition, JoinedChat } from "../types";

export function useFilters() {
  const {
    data: filters,
    error,
    isLoading,
    mutate: mutateFilters,
  } = useSWR<Filter[]>("filters", api.filters.list);

  const {
    data: chats,
    error: chatsError,
    isLoading: chatsLoading,
    mutate: mutateChats,
  } = useSWR<JoinedChat[]>("joined-chats", api.chats.list);

  const createFilter = useCallback(
    async (data: { name: string; conditions: FilterCondition[] }) => {
      const created = await api.filters.create(data);
      await mutateFilters((current) => [...(current ?? []), created], { revalidate: false });
      return created;
    },
    [mutateFilters]
  );

  const deleteFilter = useCallback(async (id: number) => {
    await api.filters.delete(id);
    await mutateFilters((current) => (current ?? []).filter((filter) => filter.id !== id), { revalidate: false });
  }, [mutateFilters]);

  const toggleFilter = useCallback(async (id: number) => {
    const updated = await api.filters.toggle(id);
    await mutateFilters(
      (current) => (current ?? []).map((filter) => (filter.id === id ? updated : filter)),
      { revalidate: false }
    );
  }, [mutateFilters]);

  const refresh = useCallback(() => {
    void mutateFilters();
  }, [mutateFilters]);

  const refreshChats = useCallback(() => {
    void mutateChats();
  }, [mutateChats]);

  return {
    filters: filters ?? [],
    chats: chats ?? [],
    loading: isLoading,
    chatsLoading,
    error: error instanceof Error ? error.message : null,
    chatsError: chatsError instanceof Error ? chatsError.message : null,
    createFilter,
    deleteFilter,
    toggleFilter,
    refresh,
    refreshChats,
  };
}
