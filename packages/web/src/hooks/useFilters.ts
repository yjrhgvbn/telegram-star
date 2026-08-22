import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ALL_MESSAGES_SYSTEM_KEY } from "@telegram-star/shared/contracts/filters";
import { api } from "../api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type {
  Filter,
  FilterBackfillJobCreateInput,
  FilterCreateInput,
  FilterFocusInput,
  FilterHistoryScope,
  FilterManualOrderInput,
  FilterPlacementInput,
  FilterUpdateInput,
} from "../types";

function compareManualOrder(left: Filter, right: Filter): number {
  return left.manualSortOrder - right.manualSortOrder
    || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || left.id - right.id;
}

export function moveFilterInManualOrder(
  filters: Filter[],
  id: number,
  targetGroupId: number | null,
  targetIndex?: number,
): Filter[] {
  const active = filters.find((filter) => filter.id === id);
  if (!active) return filters;

  const sourceGroupId = active.manualGroupId;
  const sourceIds = filters
    .filter((filter) => filter.id !== id && filter.manualGroupId === sourceGroupId)
    .sort(compareManualOrder)
    .map((filter) => filter.id);
  const targetIds = sourceGroupId === targetGroupId
    ? [...sourceIds]
    : filters
        .filter((filter) => filter.id !== id && filter.manualGroupId === targetGroupId)
        .sort(compareManualOrder)
        .map((filter) => filter.id);
  const insertionIndex = Math.min(
    Math.max(targetIndex ?? targetIds.length, 0),
    targetIds.length,
  );
  targetIds.splice(insertionIndex, 0, id);

  const sourceOrderById = new Map(sourceIds.map((filterId, index) => [filterId, index]));
  const targetOrderById = new Map(targetIds.map((filterId, index) => [filterId, index]));

  return filters.map((filter) => {
    const nextTargetOrder = targetOrderById.get(filter.id);
    if (nextTargetOrder !== undefined) {
      return {
        ...filter,
        manualGroupId: targetGroupId,
        manualSortOrder: nextTargetOrder,
      };
    }
    const nextSourceOrder = sourceOrderById.get(filter.id);
    return nextSourceOrder === undefined
      ? filter
      : { ...filter, manualSortOrder: nextSourceOrder };
  });
}

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
      // 更新规则会清理不再命中的历史消息，统计数据需要同步刷新。
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    },
  });

  const { mutateAsync: deleteFilterAsync } = useMutation({
    mutationFn: api.filters.delete,
    onSuccess: (_deleted, id) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).filter((filter) => filter.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.forwardTargets.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.filterGroups.all });
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

  const { mutateAsync: setFilterFocusedAsync } = useMutation({
    mutationFn: (variables: { id: number; data: FilterFocusInput }) =>
      api.filters.setFocused(variables.id, variables.data),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).map((filter) => (filter.id === variables.id ? updated : filter)),
      );
    },
  });

  const { mutateAsync: setFilterPlacementAsync } = useMutation({
    mutationFn: (variables: { id: number; data: FilterPlacementInput }) =>
      api.filters.setPlacement(variables.id, variables.data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.filters.all });
      const previous = queryClient.getQueryData<Filter[]>(queryKeys.filters.all);
      queryClient.setQueryData<Filter[]>(
        queryKeys.filters.all,
        moveFilterInManualOrder(
          previous ?? [],
          id,
          data.manualGroupId,
          data.targetIndex,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.filters.all, context.previous);
      }
    },
    onSuccess: (updated, { id }) => {
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).map((filter) => (filter.id === id ? updated : filter)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.filterGroups.all });
    },
  });

  const { mutateAsync: reorderManualAsync } = useMutation({
    mutationFn: (data: FilterManualOrderInput) => api.filters.reorderManual(data),
    onSuccess: (_result, { filterIds }) => {
      const sortOrderById = new Map(filterIds.map((id, sortOrder) => [id, sortOrder]));
      queryClient.setQueryData<Filter[]>(queryKeys.filters.all, (current) =>
        (current ?? []).map((filter) => ({
          ...filter,
          manualSortOrder: sortOrderById.get(filter.id) ?? filter.manualSortOrder,
        })),
      );
    },
  });

  const { mutateAsync: backfillFilterAsync } = useMutation({
    mutationFn: (variables: { id: number; data?: FilterHistoryScope }) =>
      api.filters.backfill(variables.id, variables.data),
    onSuccess: () => {
      // 历史回填会新增命中消息，侧栏活动时间需要重新聚合。
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    },
  });

  const { mutateAsync: startBackfillJobAsync } = useMutation({
    mutationFn: (variables: { id: number; data: FilterBackfillJobCreateInput }) =>
      api.filters.startBackfillJob(variables.id, variables.data),
    onSuccess: (job) => {
      queryClient.setQueryData(queryKeys.filters.latestBackfill(job.filterId), job);
    },
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

  const setFilterFocused = useCallback(
    async (id: number, isFocused: boolean) => {
      return setFilterFocusedAsync({ id, data: { isFocused } });
    },
    [setFilterFocusedAsync],
  );

  const setFilterPlacement = useCallback(
    (id: number, manualGroupId: number | null, targetIndex?: number) =>
      setFilterPlacementAsync({
        id,
        data: targetIndex === undefined
          ? { manualGroupId }
          : { manualGroupId, targetIndex },
      }),
    [setFilterPlacementAsync],
  );

  const reorderManualFilters = useCallback(
    (data: FilterManualOrderInput) => reorderManualAsync(data),
    [reorderManualAsync],
  );

  const backfillFilter = useCallback(async (id: number, data?: FilterHistoryScope) => {
    return backfillFilterAsync({ id, data });
  }, [backfillFilterAsync]);

  const startBackfillJob = useCallback(
    async (id: number, data: FilterBackfillJobCreateInput) => {
      return startBackfillJobAsync({ id, data });
    },
    [startBackfillJobAsync],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
  }, [queryClient]);

  const refreshChats = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.chats.joined });
  }, [queryClient]);

  const messageGroups = filtersQuery.data ?? [];
  const filters = messageGroups.filter((filter) => filter.systemKey !== ALL_MESSAGES_SYSTEM_KEY);

  return {
    filters,
    messageGroups,
    chats: chatsQuery.data ?? [],
    loading: filtersQuery.isLoading,
    chatsLoading: chatsQuery.isLoading,
    error: filtersQuery.error instanceof Error ? filtersQuery.error.message : null,
    chatsError: chatsQuery.error instanceof Error ? chatsQuery.error.message : null,
    createFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
    setFilterFocused,
    setFilterPlacement,
    reorderManualFilters,
    backfillFilter,
    startBackfillJob,
    refresh,
    refreshChats,
  };
}
