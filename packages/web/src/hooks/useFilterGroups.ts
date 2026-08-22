import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type {
  FilterGroup,
  FilterGroupLayout,
  FilterGroupOrderInput,
} from "@/types";

export function useFilterGroups() {
  const queryClient = useQueryClient();
  const groupsQuery = useQuery({
    queryKey: queryKeys.filterGroups.all,
    queryFn: api.filterGroups.list,
  });
  const layoutQuery = useQuery({
    queryKey: queryKeys.filterGroups.layout,
    queryFn: api.filterGroups.layout,
  });

  const { mutateAsync: createAsync } = useMutation({
    mutationFn: api.filterGroups.create,
    onSuccess: (created) => {
      const previousGroups = queryClient.getQueryData<FilterGroup[]>(
        queryKeys.filterGroups.all,
      ) ?? [];
      const previousGroupCount = previousGroups.length;
      queryClient.setQueryData<FilterGroup[]>(queryKeys.filterGroups.all, (current) =>
        [...(current ?? []), created].sort(
          (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
        ),
      );
      queryClient.setQueryData<FilterGroupLayout>(
        queryKeys.filterGroups.layout,
        (current) => {
          const currentPosition = current?.ungroupedPosition ?? previousGroupCount;
          return {
            ungroupedPosition: currentPosition === previousGroupCount
              ? previousGroupCount + 1
              : currentPosition,
          };
        },
      );
    },
  });

  const { mutateAsync: updateAsync } = useMutation({
    mutationFn: (variables: { id: number; name: string }) =>
      api.filterGroups.update(variables.id, { name: variables.name }),
    onSuccess: (updated) => {
      queryClient.setQueryData<FilterGroup[]>(queryKeys.filterGroups.all, (current) =>
        (current ?? []).map((group) => (group.id === updated.id ? updated : group)),
      );
    },
  });

  const { mutateAsync: deleteAsync } = useMutation({
    mutationFn: api.filterGroups.delete,
    onSuccess: (_result, id) => {
      const previousGroups = [
        ...(queryClient.getQueryData<FilterGroup[]>(queryKeys.filterGroups.all) ?? []),
      ].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
      const deletedIndex = previousGroups.findIndex((group) => group.id === id);
      queryClient.setQueryData<FilterGroup[]>(queryKeys.filterGroups.all, (current) =>
        (current ?? []).filter((group) => group.id !== id),
      );
      queryClient.setQueryData<FilterGroupLayout>(
        queryKeys.filterGroups.layout,
        (current) => {
          const currentPosition = current?.ungroupedPosition ?? previousGroups.length;
          return {
            ungroupedPosition: deletedIndex >= 0 && deletedIndex < currentPosition
              ? currentPosition - 1
              : Math.min(currentPosition, Math.max(previousGroups.length - 1, 0)),
          };
        },
      );
      // 服务端会把原成员按顺序追加到“未分组”，以服务端结果为准刷新归属和排序。
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
    },
  });

  const { mutateAsync: reorderAsync } = useMutation({
    mutationFn: api.filterGroups.reorder,
    onSuccess: (_result, { ids, ungroupedPosition }) => {
      const sortOrderById = new Map(ids.map((id, sortOrder) => [id, sortOrder]));
      queryClient.setQueryData<FilterGroup[]>(queryKeys.filterGroups.all, (current) =>
        [...(current ?? [])]
          .map((group) => ({
            ...group,
            sortOrder: sortOrderById.get(group.id) ?? group.sortOrder,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
      );
      queryClient.setQueryData<FilterGroupLayout>(queryKeys.filterGroups.layout, {
        ungroupedPosition: ungroupedPosition ?? ids.length,
      });
    },
  });

  const createGroup = useCallback(
    (name: string) => createAsync({ name }),
    [createAsync],
  );
  const renameGroup = useCallback(
    (id: number, name: string) => updateAsync({ id, name }),
    [updateAsync],
  );
  const deleteGroup = useCallback((id: number) => deleteAsync(id), [deleteAsync]);
  const reorderGroups = useCallback(
    (input: FilterGroupOrderInput) => reorderAsync(input),
    [reorderAsync],
  );

  const groups = groupsQuery.data ?? [];
  const ungroupedPosition = Math.min(
    layoutQuery.data?.ungroupedPosition ?? groups.length,
    groups.length,
  );

  return {
    groups,
    ungroupedPosition,
    loading: groupsQuery.isLoading || layoutQuery.isLoading,
    error: groupsQuery.error instanceof Error
      ? groupsQuery.error.message
      : layoutQuery.error instanceof Error
        ? layoutQuery.error.message
        : null,
    createGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
  };
}
