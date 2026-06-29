import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { queryKeys } from "@/shared/query/queryKeys";
import type { ForwardTarget, ForwardTargetCreateInput, ForwardTargetTestInput } from "@/types";
import {
  createDraftTarget,
  isDraftTarget,
  NEW_FORWARD_TARGET_ID,
  type EditableForwardTarget,
} from "../types";

export function useForwardTargets() {
  const queryClient = useQueryClient();
  const [draftTarget, setDraftTarget] = useState<EditableForwardTarget | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const targetsQuery = useQuery({
    queryKey: queryKeys.forwardTargets.all,
    queryFn: api.forwardTargets.list,
  });

  const targets = targetsQuery.data ?? [];

  const {
    mutateAsync: createTargetAsync,
    isPending: createTargetPending,
  } = useMutation({
    mutationFn: api.forwardTargets.create,
    onSuccess: (saved) => {
      queryClient.setQueryData<ForwardTarget[]>(queryKeys.forwardTargets.all, (current) => [
        saved,
        ...(current ?? []),
      ]);
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
    },
  });

  const {
    mutateAsync: updateTargetAsync,
    isPending: updateTargetPending,
  } = useMutation({
    mutationFn: (variables: { id: number; data: ForwardTargetCreateInput }) =>
      api.forwardTargets.update(variables.id, variables.data),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<ForwardTarget[]>(queryKeys.forwardTargets.all, (current) =>
        (current ?? []).map((target) => (target.id === variables.id ? saved : target)),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
    },
  });

  const {
    mutateAsync: deleteTargetAsync,
    isPending: deleteTargetPending,
  } = useMutation({
    mutationFn: api.forwardTargets.delete,
    onSuccess: (_deleted, id) => {
      queryClient.setQueryData<ForwardTarget[]>(queryKeys.forwardTargets.all, (current) =>
        (current ?? []).filter((target) => target.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
    },
  });

  const { mutateAsync: testTargetAsync } = useMutation({
    mutationFn: api.forwardTargets.test,
  });

  const loadTargets = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.forwardTargets.all });
  }, [queryClient]);

  useEffect(() => {
    if (selectedTargetId === NEW_FORWARD_TARGET_ID && draftTarget) return;
    if (selectedTargetId && targets.some((target) => String(target.id) === selectedTargetId)) return;
    if (draftTarget) {
      setSelectedTargetId(NEW_FORWARD_TARGET_ID);
      return;
    }
    setSelectedTargetId(targets[0] ? String(targets[0].id) : null);
  }, [draftTarget, selectedTargetId, targets]);

  const visibleTargets = useMemo(
    () => (draftTarget ? [draftTarget, ...targets] : targets),
    [draftTarget, targets],
  );

  const selectedTarget = useMemo(
    () =>
      selectedTargetId === NEW_FORWARD_TARGET_ID
        ? draftTarget
        : targets.find((target) => String(target.id) === selectedTargetId) ?? null,
    [draftTarget, selectedTargetId, targets],
  );

  const enabledTargets = useMemo(
    () => targets.filter((target) => target.enabled).length,
    [targets],
  );

  const subscribedRules = useMemo(
    () => new Set(targets.flatMap((target) => target.filterIds)).size,
    [targets],
  );

  const addTarget = useCallback(() => {
    setDraftTarget((current) => current ?? createDraftTarget());
    setSelectedTargetId(NEW_FORWARD_TARGET_ID);
  }, []);

  const saveTarget = useCallback(
    async (target: EditableForwardTarget, data: ForwardTargetCreateInput) => {
      const saved = isDraftTarget(target)
        ? await createTargetAsync(data)
        : await updateTargetAsync({ id: target.id, data });

      setDraftTarget(null);
      setSelectedTargetId(String(saved.id));
      return saved;
    },
    [createTargetAsync, updateTargetAsync],
  );

  const deleteTarget = useCallback(
    async (target: EditableForwardTarget) => {
      if (isDraftTarget(target)) {
        setDraftTarget(null);
        setSelectedTargetId(targets[0] ? String(targets[0].id) : null);
        return;
      }

      await deleteTargetAsync(target.id);
      setSelectedTargetId(null);
    },
    [deleteTargetAsync, targets],
  );

  const testTarget = useCallback((data: ForwardTargetTestInput) => {
    return testTargetAsync(data);
  }, [testTargetAsync]);

  const loading =
    targetsQuery.isLoading ||
    createTargetPending ||
    updateTargetPending ||
    deleteTargetPending;

  const error = targetsQuery.error instanceof Error ? targetsQuery.error.message : null;

  return {
    targets,
    visibleTargets,
    selectedTarget,
    selectedTargetId,
    enabledTargets,
    subscribedRules,
    loading,
    error,
    refresh: loadTargets,
    addTarget,
    saveTarget,
    deleteTarget,
    testTarget,
    setDraftTarget,
    setSelectedTargetId,
  };
}
