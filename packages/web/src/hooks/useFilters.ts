import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type { Filter, FilterCreateInput, FilterHistoryScope, FilterUpdateInput } from "../types";

export function useFilters() {
  const queryClient = useQueryClient();

  const filtersQuery = useQuery({
    queryKey: queryKeys.filters.all,
    queryFn: api.filters.list,
  });

  const chatsQuery = useQuery({
    queryKey: queryKeys.chats.joined,
    queryFn: api.chats.list,
  });

  const { mutateAsync: createFilterAsync } = useMutation({
    mutationFn: api.filters.create,
    onSuccess: (created) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) => [
        created,
        ...(current ?? []),
      ]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.forwardTargets.all });
    },
  });

  const { mutateAsync: updateFilterAsync } = useMutation({
    mutationFn: (variables: {
      id: number;
      data: FilterUpdateInput;
    }) => api.filters.update(variables.id, variables.data),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).map((filter) => (filter.id === variables.id ? updated : filter)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.forwardTargets.all });
    },
  });

  const { mutateAsync: deleteFilterAsync } = useMutation({
    mutationFn: api.filters.delete,
    onSuccess: (_deleted, id) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).filter((filter) => filter.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.forwardTargets.all });
    },
  });

  const { mutateAsync: toggleFilterAsync } = useMutation({
    mutationFn: api.filters.toggle,
    onSuccess: (updated, id) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).map((filter) => (filter.id === id ? updated : filter)),
      );
    },
  });

  const { mutateAsync: backfillFilterAsync } = useMutation({
    mutationFn: (variables: { id: number; data?: FilterHistoryScope }) =>
      api.filters.backfill(variables.id, variables.data),
  });

  const createFilter = useCallback(
    async (data: FilterCreateInput) => {
      return createFilterAsync(data);
    },
    [createFilterAsync]
  );

  const updateFilter = useCallback(
    async (id: number, data: FilterUpdateInput) => {
      return updateFilterAsync({ id, data });
    },
    [updateFilterAsync]
  );

  const deleteFilter = useCallback(async (id: number) => {
    await deleteFilterAsync(id);
  }, [deleteFilterAsync]);

  const toggleFilter = useCallback(async (id: number) => {
    await toggleFilterAsync(id);
  }, [toggleFilterAsync]);

  const backfillFilter = useCallback(async (id: number, data?: FilterHistoryScope) => {
    return backfillFilterAsync({ id, data });
  }, [backfillFilterAsync]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
  }, [queryClient]);

  const refreshChats = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chats.joined });
  }, [queryClient]);

  return {
    filters: filtersQuery.data ?? [],
    chats: chatsQuery.data ?? [],
    loading: filtersQuery.isLoading,
    chatsLoading: chatsQuery.isLoading,
    error: filtersQuery.error instanceof Error ? filtersQuery.error.message : null,
    chatsError: chatsQuery.error instanceof Error ? chatsQuery.error.message : null,
    createFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
    backfillFilter,
    refresh,
    refreshChats,
  };
}
