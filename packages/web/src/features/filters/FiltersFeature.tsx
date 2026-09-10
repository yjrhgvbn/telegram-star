import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LoaderCircle,
  MoreHorizontal,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { queryKeys } from "@/shared/query/queryKeys";
import type { Filter, FilterBackfillJobCreateInput, FilterCondition, FilterConditionType } from "@/types";
import { FilterForm } from "./components/FilterForm";
import {
  FilterConfirmationDialog,
  type FilterConfirmationKind,
} from "./components/FilterConfirmationDialog";
import { FilterLibrary } from "./components/FilterLibrary";
import { HistoryBackfillDialog } from "./components/HistoryBackfillDialog";
import { PreviewPanel } from "./components/PreviewPanel";
import type { DraftCondition } from "./types";
import {
  assertValidRegexConditions,
  assertValidScriptConditions,
  assertValidSenderConditions,
  createDraftCondition,
  createInitialDraftConditions,
  deriveFilterName,
  groupDraftConditions,
  mergePersistableConditions,
  normalizeConditions,
  toDraftConditions,
} from "./utils";

import "./FiltersFeature.css";

type RuleDraft = {
  name: string;
  conditions: DraftCondition[];
  autoLocateUnreadNearRead: boolean;
  forwardTargetIds: number[];
  scrollTop: number;
};

type EditorLocation = { key: string; filterId: string | undefined };
type RuleOperation = { editor: EditorLocation };

function useRuleViewport() {
  const read = () => ({
    mobile: window.matchMedia?.("(max-width:680px)").matches ?? false,
    wide: window.matchMedia?.("(min-width:1280px)").matches ?? true,
  });
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const queries = [
      window.matchMedia?.("(max-width:680px)"),
      window.matchMedia?.("(min-width:1280px)"),
    ];
    const update = () => setViewport(read());
    queries.forEach((query) => query?.addEventListener("change", update));
    return () =>
      queries.forEach((query) => query?.removeEventListener("change", update));
  }, []);
  return viewport;
}

type CommitMode = "save" | "backfill" | "toggle" | "delete";

interface DraftPreviewRequest {
  conditions: FilterCondition[];
  signature: string;
  perChatLimit: number;
}

const PREVIEW_TOTAL_LIMIT = 50;
const PREVIEW_DIALOG_LIMIT = 20;

export function FiltersFeature() {
  const { filterId: routeFilterId } = useParams<{ filterId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mobile, wide } = useRuleViewport();
  const [detailView, setDetailView] = useState("edit");
  const viewId = useId();
  const editorRef = useRef<HTMLElement>(null);
  const addedGroupToFocus = useRef<string | null>(null);
  const draftCache = useRef(new Map<string, RuleDraft>());
  const loadedRuleKey = useRef<string | null>(null);
  const defaultFilterId = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const activeOperation = useRef<RuleOperation | null>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const pendingFeedback = useRef<{ filterId: string; error: string; message: string } | null>(null);
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const {
    filters,
    chats,
    loading,
    chatsLoading,
    error: filtersError,
    refresh: refreshFilters,
    createFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
    startBackfillJob,
  } = useFilters();
  const forwardTargetsQuery = useQuery({
    queryKey: queryKeys.forwardTargets.all,
    queryFn: api.forwardTargets.list,
  });

  const [name, setName] = useState("");
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);
  const [forwardTargetIds, setForwardTargetIds] = useState<number[]>([]);
  const [conditions, setConditions] = useState<DraftCondition[]>(
    createInitialDraftConditions,
  );
  useEffect(() => {
    if (!addedGroupToFocus.current) return;
    const group = [
      ...(editorRef.current?.querySelectorAll<HTMLElement>("[data-rule-group-id]") ?? []),
    ].find((element) => element.dataset.ruleGroupId === addedGroupToFocus.current);
    // Base UI Select has a hidden input; focus the actual editable field instead.
    group
      ?.querySelector<HTMLElement>("input[data-slot='input'], textarea")
      ?.focus();
    addedGroupToFocus.current = null;
  }, [conditions]);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");
  const [operation, setOperation] = useState<CommitMode | null>(null);
  const [operationMessage, setOperationMessage] = useState("");
  const [confirmationKind, setConfirmationKind] =
    useState<FilterConfirmationKind | null>(null);
  const [confirmedNavigation, setConfirmedNavigation] = useState<{ action: () => void } | null>(null);
  const [previewLimit, setPreviewLimit] = useState("200");
  const [startedBackfillJobId, setStartedBackfillJobId] =
    useState<string | null>(null);
  const [debouncedPreviewRequest, setDebouncedPreviewRequest] =
    useState<DraftPreviewRequest | null>(null);

  // A refetch may reorder the library. Keep the root's selected rule until it is removed.
  if (!loading && !filtersError && !filters.some((filter) => String(filter.id) === defaultFilterId.current)) {
    defaultFilterId.current = filters[0] ? String(filters[0].id) : undefined;
  }
  const effectiveFilterId =
    routeFilterId ?? (!mobile ? defaultFilterId.current : undefined);
  const selectedFilter =
    effectiveFilterId && effectiveFilterId !== "new"
      ? filters.find((filter) => String(filter.id) === effectiveFilterId) ?? null
      : null;
  const isEditorSelected = effectiveFilterId === "new" || selectedFilter !== null;
  const editorLocation = useRef<EditorLocation>({ key: location.key, filterId: effectiveFilterId });
  if (editorLocation.current.key !== location.key || editorLocation.current.filterId !== effectiveFilterId) {
    editorLocation.current = { key: location.key, filterId: effectiveFilterId };
  }
  const hasUnsavedChanges = isDirty || draftCache.current.size > 0;
  const unsavedChangesRef = useRef(hasUnsavedChanges);
  unsavedChangesRef.current = hasUnsavedChanges;
  const busy = operation !== null;

  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!unsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!confirmedNavigation) return;
    // AppShell registers the cleared-draft guard in its layout effect first.
    setConfirmedNavigation(null);
    confirmedNavigation.action();
  }, [confirmedNavigation]);

  const clearNavigationRequest = useCallback(() => {
    pendingNavigation.current = null;
    setConfirmationKind(null);
    setConfirmedNavigation(null);
  }, []);

  useEffect(() => {
    // A history switch supersedes a dialog opened for the previous location.
    clearNavigationRequest();
  }, [clearNavigationRequest, location.key]);
  const forwardTargets = forwardTargetsQuery.data ?? [];
  const persistedConditions = useMemo(
    () => mergePersistableConditions(normalizeConditions(conditions)),
    [conditions],
  );
  const hasIncompleteScriptCondition = conditions.some(
    (condition) => condition.type === "script" && !condition.input.trim(),
  );
  const hasIncompleteSenderCondition = conditions.some(
    (condition) => condition.type === "sender" && normalizeConditions([condition]).length === 0,
  );
  const suggestedName = useMemo(
    () => deriveFilterName(persistedConditions, chats),
    [chats, persistedConditions],
  );
  const currentConditionSignature = useMemo(
    () => JSON.stringify(persistedConditions),
    [persistedConditions],
  );
  const previewPerChatLimit = Number(previewLimit) || 200;
  const selectedChatCount = useMemo(
    () =>
      new Set(
        persistedConditions
          .filter((condition) => condition.type === "chat")
          .flatMap((condition) => condition.values),
      ).size,
    [persistedConditions],
  );

  const latestBackfillQuery = useQuery({
    queryKey: queryKeys.filters.latestBackfill(selectedFilter?.id ?? 0),
    queryFn: () => {
      if (!selectedFilter) throw new Error("规则尚未保存");
      return api.filters.latestBackfillJob(selectedFilter.id);
    },
    enabled: Boolean(selectedFilter && authStatus.authorized),
    refetchInterval: (query) => {
      const job = query.state.data;
      return job && ["queued", "running"].includes(job.status) ? 1_500 : false;
    },
    staleTime: 1_000,
  });
  const latestBackfillJob = latestBackfillQuery.data ?? null;

  const previewCandidate = useMemo<{
    request: DraftPreviewRequest | null;
    error: string;
  }>(() => {
    if (!isEditorSelected) {
      return { request: null, error: "" };
    }

    if (hasIncompleteScriptCondition) {
      return { request: null, error: "请填写自定义 JavaScript 代码" };
    }
    if (hasIncompleteSenderCondition) {
      return { request: null, error: "请填写发送者用户 ID" };
    }

    if (persistedConditions.length === 0) return { request: null, error: "" };

    try {
      assertValidRegexConditions(persistedConditions);
      assertValidScriptConditions(persistedConditions);
      assertValidSenderConditions(persistedConditions);
      return {
        request: {
          conditions: persistedConditions,
          signature: currentConditionSignature,
          perChatLimit: previewPerChatLimit,
        },
        error: "",
      };
    } catch (candidateError: unknown) {
      return {
        request: null,
        error: candidateError instanceof Error ? candidateError.message : "条件无效",
      };
    }
  }, [
    currentConditionSignature,
    hasIncompleteScriptCondition,
    hasIncompleteSenderCondition,
    isEditorSelected,
    persistedConditions,
    previewPerChatLimit,
  ]);

  // 输入停顿后再切换查询键，避免每个按键都触发 Telegram 历史请求。
  useEffect(() => {
    if (!previewCandidate.request) {
      setDebouncedPreviewRequest(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedPreviewRequest(previewCandidate.request);
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [previewCandidate.request]);

  const previewQuery = useQuery({
    queryKey: [
      ...queryKeys.filters.preview,
      debouncedPreviewRequest?.signature ?? "idle",
      debouncedPreviewRequest?.perChatLimit ?? 0,
    ],
    queryFn: ({ signal }) => {
      if (!debouncedPreviewRequest) {
        throw new Error("没有可预览的条件");
      }

      return api.filters.preview(
        {
          conditions: debouncedPreviewRequest.conditions,
          perChatLimit: debouncedPreviewRequest.perChatLimit,
          totalLimit: PREVIEW_TOTAL_LIMIT,
          pageSize: PREVIEW_DIALOG_LIMIT,
        },
        signal,
      );
    },
    enabled: Boolean(
      isEditorSelected && authStatus.authorized && debouncedPreviewRequest,
    ),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const previewSettling = Boolean(
    authStatus.authorized &&
      previewCandidate.request &&
      (previewCandidate.request.signature !== debouncedPreviewRequest?.signature ||
        previewCandidate.request.perChatLimit !== debouncedPreviewRequest?.perChatLimit),
  );
  const previewMessages = previewCandidate.request
    ? previewQuery.data?.messages ?? []
    : [];
  const previewSamples = previewCandidate.request
    ? previewQuery.data?.samples ?? []
    : [];
  const previewSummary =
    previewCandidate.request && previewQuery.data
      ? {
          scannedChats: previewQuery.data.scannedChats,
          total: previewQuery.data.total,
        }
      : null;
  const previewError =
    previewCandidate.error ||
    (previewQuery.error instanceof Error ? previewQuery.error.message : "");
  const previewLoading = previewSettling || previewQuery.isFetching;
  const previewStale = previewSettling || previewQuery.isPlaceholderData;

  useEffect(() => {
    if (loadedRuleKey.current === (effectiveFilterId ?? null)) return;
    if (effectiveFilterId && effectiveFilterId !== "new" && !selectedFilter) return;

    // Drafts live in this workspace and are restored when switching back to a rule.
    if (loadedRuleKey.current && isDirty) {
      draftCache.current.set(loadedRuleKey.current, {
        name,
        conditions,
        autoLocateUnreadNearRead,
        forwardTargetIds,
        scrollTop: editorRef.current?.scrollTop ?? 0,
      });
    }
    loadedRuleKey.current = effectiveFilterId ?? null;
    setConfirmationKind(null);
    setDebouncedPreviewRequest(null);
    if (!effectiveFilterId) {
      setIsDirty(false);
      return;
    }
    const draft = draftCache.current.get(effectiveFilterId);
    setName(draft?.name ?? selectedFilter?.name ?? "");
    setConditions(
      draft?.conditions ??
        (selectedFilter
          ? toDraftConditions(selectedFilter.conditions)
          : createInitialDraftConditions()),
    );
    setAutoLocateUnreadNearRead(
      draft?.autoLocateUnreadNearRead ??
        selectedFilter?.autoLocateUnreadNearRead ??
        true,
    );
    setForwardTargetIds(
      draft?.forwardTargetIds ?? selectedFilter?.forwardTargetIds ?? [],
    );
    setIsNameEditing(false);
    setIsDirty(Boolean(draft));
    const feedback = pendingFeedback.current?.filterId === effectiveFilterId
      ? pendingFeedback.current : null;
    setError(feedback?.error ?? "");
    setOperationMessage(feedback?.message ?? "");
    if (feedback) pendingFeedback.current = null;
    setDetailView("edit");
    const frame = window.requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.scrollTop = draft?.scrollTop ?? 0;
    });
    return () => window.cancelAnimationFrame(frame);
    // Cache refreshes for this rule must not reset the user's current edits.
  }, [effectiveFilterId, selectedFilter?.id]);

  useEffect(() => {
    if (!routeFilterId || routeFilterId === "new" || loading || filtersError || selectedFilter) {
      return;
    }

    navigate("/filters", { replace: true });
  }, [filtersError, loading, navigate, routeFilterId, selectedFilter]);

  useEffect(() => {
    if (!latestBackfillJob || latestBackfillJob.id !== startedBackfillJobId) return;

    if (latestBackfillJob.status === "completed") {
      setOperationMessage(
        `补录完成：命中 ${latestBackfillJob.matchedCount} 条，新增 ${latestBackfillJob.savedCount} 条，跳过 ${latestBackfillJob.skippedExistingCount} 条。`,
      );
      setStartedBackfillJobId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.preview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    } else if (latestBackfillJob.status === "failed") {
      setError(`历史补录失败：${latestBackfillJob.error || "未知错误"}`);
      setStartedBackfillJobId(null);
    }
  }, [latestBackfillJob, queryClient, startedBackfillJobId]);

  const markDirty = () => {
    setIsDirty(true);
    setError("");
    setOperationMessage("");
  };

  const buildConditions = () => {
    if (hasIncompleteScriptCondition) {
      throw new Error("请填写自定义 JavaScript 代码");
    }
    if (hasIncompleteSenderCondition) {
      throw new Error("请填写发送者用户 ID");
    }

    if (persistedConditions.length === 0) {
      throw new Error("至少添加一个有效条件");
    }

    assertValidRegexConditions(persistedConditions);
    assertValidScriptConditions(persistedConditions);
    assertValidSenderConditions(persistedConditions);
    return persistedConditions;
  };

  const buildPayload = () => {
    const nextConditions = buildConditions();

    return {
      name: name.trim() || deriveFilterName(nextConditions, chats),
      conditions: nextConditions,
      autoLocateUnreadNearRead,
      forwardTargetIds,
    };
  };

  const updateCondition = (
    id: string,
    updater: (condition: DraftCondition) => DraftCondition,
  ) => {
    setConditions((current) =>
      current.map((condition) =>
        condition.id === id ? updater(condition) : condition,
      ),
    );
    markDirty();
  };

  const addCondition = (effect: "require" | "exclude" = "require", type: FilterConditionType = "keyword") => {
    // A new sender constraint gets its own AND group; OR is an explicit group action.
    const condition = createDraftCondition(type, undefined, effect);
    addedGroupToFocus.current = condition.groupId ?? condition.id;
    setConditions((current) => [...current, condition]);
    markDirty();
  };

  const addAlternative = (groupId: string) => {
    setConditions((current) => {
      const group = groupDraftConditions(current).find(
        (item) => item.id === groupId,
      );
      if (!group || group.conditions.some((condition) => condition.type === "chat")) {
        return current;
      }

      return [
        ...current,
        createDraftCondition("keyword", groupId, group.effect),
      ];
    });
    markDirty();
  };

  const toggleGroupEffect = (groupId: string) => {
    setConditions((current) => {
      const group = groupDraftConditions(current).find(
        (item) => item.id === groupId,
      );
      if (!group || group.conditions.some((condition) => condition.type === "chat")) {
        return current;
      }

      const nextEffect = group.effect === "exclude" ? "require" : "exclude";
      return current.map((condition) =>
        (condition.groupId ?? condition.id) === groupId
          ? { ...condition, effect: nextEffect }
          : condition,
      );
    });
    markDirty();
  };

  const removeConditionGroup = (groupId: string) => {
    setConditions((current) => {
      const remaining = current.filter(
        (condition) => (condition.groupId ?? condition.id) !== groupId,
      );
      return remaining.length > 0 ? remaining : [createDraftCondition()];
    });
    markDirty();
  };

  const removeCondition = (id: string) => {
    setConditions((current) =>
      current.length === 1
        ? [createDraftCondition()]
        : current.filter((condition) => condition.id !== id),
    );
    markDirty();
  };

  const appendConditionValues = (id: string) => {
    const draft = conditions.find((condition) => condition.id === id);
    if (draft?.type === "script") return;
    const separator = draft?.type === "regex" ? /\n/ : /[,，\n]/;
    if (
      !draft ||
      draft.input
        .split(separator)
        .map((item) => item.trim())
        .every((item) => !item)
    ) {
      return;
    }

    updateCondition(id, (condition) => {
      const nextValues = condition.input
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean);

      if (nextValues.length === 0) return condition;

      return {
        ...condition,
        values: Array.from(new Set([...condition.values, ...nextValues])),
        input: "",
      };
    });
  };

  const toggleForwardTarget = (targetId: number) => {
    setForwardTargetIds((current) =>
      current.includes(targetId)
        ? current.filter((id) => id !== targetId)
        : [...current, targetId],
    );
    markDirty();
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    markDirty();
  };

  const handleAutoLocateChange = (value: boolean) => {
    setAutoLocateUnreadNearRead(value);
    markDirty();
  };

  const beginOperation = (mode: CommitMode): RuleOperation | null => {
    if (activeOperation.current) return null;
    const request = { editor: editorLocation.current };
    activeOperation.current = request;
    setOperation(mode);
    setError("");
    setOperationMessage("");
    return request;
  };

  const isCurrentEditor = (request: RuleOperation) =>
    mounted.current && editorLocation.current === request.editor;

  const finishOperation = (request: RuleOperation) => {
    if (activeOperation.current !== request) return;
    activeOperation.current = null;
    if (mounted.current) setOperation(null);
  };

  const persistDraft = async (request: RuleOperation) => {
    const submittedRuleKey = request.editor.filterId;
    const submittedDraft = { name, conditions, autoLocateUnreadNearRead, forwardTargetIds };
    const payload = buildPayload();
    const saved = selectedFilter
      ? await updateFilter(selectedFilter.id, payload)
      : await createFilter(payload);

    if (mounted.current && submittedRuleKey) {
      const cached = draftCache.current.get(submittedRuleKey);
      // A hidden root may cache this submitted draft during a resize. Clear only
      // that snapshot; a later visit can have a different draft for the same ID.
      if (cached && JSON.stringify({
        name: cached.name,
        conditions: cached.conditions,
        autoLocateUnreadNearRead: cached.autoLocateUnreadNearRead,
        forwardTargetIds: cached.forwardTargetIds,
      }) === JSON.stringify(submittedDraft)) {
        draftCache.current.delete(submittedRuleKey);
      }
    }
    if (isCurrentEditor(request)) {
      if (submittedRuleKey) draftCache.current.delete(submittedRuleKey);
      setName(saved.name);
      setIsDirty(false);
    }
    return saved;
  };

  const handleSave = async () => {
    if (selectedFilter && !isDirty) return;
    const request = beginOperation("save");
    if (!request) return;
    try {
      const savedFilter = await persistDraft(request);
      if (!isCurrentEditor(request)) return;
      setOperationMessage("规则已保存");
      if (!selectedFilter) {
        pendingFeedback.current = {
          filterId: String(savedFilter.id), error: "", message: "规则已保存",
        };
        navigate(`/filters/${savedFilter.id}`, { replace: true });
      }
    } catch (commitError: unknown) {
      if (isCurrentEditor(request))
        setError(commitError instanceof Error ? commitError.message : "保存失败");
    } finally {
      finishOperation(request);
    }
  };

  const handleStartBackfill = async (input: FilterBackfillJobCreateInput) => {
    const request = beginOperation("backfill");
    if (!request) return;
    let savedFilter: Filter | null = null;
    let failureMessage = "";
    const successMessage = "历史补录已在后台开始，可以离开当前页面";
    try {
      savedFilter = await persistDraft(request);
      const job = await startBackfillJob(savedFilter.id, input);
      if (isCurrentEditor(request)) {
        setStartedBackfillJobId(job.id);
        setOperationMessage(successMessage);
      }
    } catch (backfillError: unknown) {
      const message = backfillError instanceof Error ? backfillError.message : "操作失败";
      failureMessage = savedFilter ? `规则已保存，但无法开始历史补录：${message}` : message;
      if (isCurrentEditor(request)) setError(failureMessage);
      throw backfillError;
    } finally {
      if (savedFilter && !selectedFilter && isCurrentEditor(request)) {
        pendingFeedback.current = {
          filterId: String(savedFilter.id),
          error: failureMessage,
          message: failureMessage ? "" : successMessage,
        };
        navigate(`/filters/${savedFilter.id}`, { replace: true });
      }
      finishOperation(request);
    }
  };

  const handleToggle = async () => {
    if (!selectedFilter) return;
    const request = beginOperation("toggle");
    if (!request) return;
    try {
      await toggleFilter(selectedFilter.id);
      if (isCurrentEditor(request))
        setOperationMessage(selectedFilter.enabled ? "监听已停用" : "监听已启用");
    } catch (toggleError: unknown) {
      if (isCurrentEditor(request))
        setError(toggleError instanceof Error ? toggleError.message : "更新规则状态失败");
    } finally {
      finishOperation(request);
    }
  };

  const handleDelete = () => {
    if (!selectedFilter || activeOperation.current) return;
    setConfirmationKind("delete");
  };

  const deleteSelectedFilter = async () => {
    if (!selectedFilter) return;
    const request = beginOperation("delete");
    if (!request) return;
    try {
      await deleteFilter(selectedFilter.id);
      if (mounted.current) draftCache.current.delete(String(selectedFilter.id));
      if (!isCurrentEditor(request)) return;
      if (loadedRuleKey.current === String(selectedFilter.id)) {
        loadedRuleKey.current = null;
        setIsDirty(false);
      }
      if (routeFilterId) navigate("/filters", { replace: true });
    } catch (deleteError: unknown) {
      if (isCurrentEditor(request))
        setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      finishOperation(request);
    }
  };

  const requestNavigation = (action: () => void, destination?: string) => {
    if (activeOperation.current) return;
    // Returning to this workspace's list keeps all drafts mounted or cached.
    if (destination === "/filters" || !hasUnsavedChanges) {
      action();
      return;
    }
    pendingNavigation.current = action;
    setConfirmationKind("discard");
  };

  // Preserve the true opener, including editors opened from a message group.
  const handleBack = () => requestNavigation(() => navigate(-1));

  const handleConfirm = () => {
    const confirmedKind = confirmationKind;
    setConfirmationKind(null);
    if (confirmedKind === "delete") {
      void deleteSelectedFilter();
      return;
    }
    if (confirmedKind === "discard") {
      const action = pendingNavigation.current;
      pendingNavigation.current = null;
      draftCache.current.clear();
      // Returning to the root can keep the same effective rule. Restore here,
      // since the rule-initialization effect would not run for that transition.
      loadedRuleKey.current = effectiveFilterId ?? null;
      setName(selectedFilter?.name ?? "");
      setConditions(selectedFilter
        ? toDraftConditions(selectedFilter.conditions)
        : createInitialDraftConditions());
      setAutoLocateUnreadNearRead(selectedFilter?.autoLocateUnreadNearRead ?? true);
      setForwardTargetIds(selectedFilter?.forwardTargetIds ?? []);
      setIsNameEditing(false);
      setError("");
      setOperationMessage("");
      unsavedChangesRef.current = false;
      setIsDirty(false);
      if (action) setConfirmedNavigation({ action });
    }
  };

  const displayedName = selectedFilter
    ? name.trim() || suggestedName
    : name.trim() || "新建规则";
  const draftNames: Record<string, string> = {};
  draftCache.current.forEach((draft, key) => {
    draftNames[key] = draft.name || "新规则";
  });
  if (isDirty && effectiveFilterId)
    draftNames[effectiveFilterId] = name.trim() || displayedName;
  else if (effectiveFilterId) delete draftNames[effectiveFilterId];
  const selectRule = (id: number | "new") => {
    if (busy) return;
    navigate(`/filters/${id}`, { replace: routeFilterId !== undefined && !mobile });
  };
  const library = (
    <FilterLibrary
      filters={filters}
      chats={chats}
      loading={loading}
      error={filtersError}
      selectedFilterId={selectedFilter?.id}
      draftNames={draftNames}
      disabled={busy}
      onCreate={() => selectRule("new")}
      onSelect={selectRule}
    />
  );

  const locateCondition = (groupId: string) => {
    setDetailView("edit");
    window.requestAnimationFrame(() => {
      const target = [
        ...(editorRef.current?.querySelectorAll<HTMLElement>("[data-rule-group-id]") ?? []),
      ].find((element) => element.dataset.ruleGroupId === groupId);
      target?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      target?.focus({ preventScroll: true });
    });
  };

  return (
    <AppShell
      activeTab="filters"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
      onNavigateRequest={requestNavigation}
      navigationGuard={{
        dirty: hasUnsavedChanges,
        busy,
        preserveWithin: "/filters",
        onHistoryBlock: clearNavigationRequest,
      }}
    >
      {filtersError ? (
        <div className="rules-load-error" role="alert">
          <span>规则加载失败：{filtersError}</span>
          <Button variant="ghost" size="sm" onClick={refreshFilters} disabled={loading}>
            重试
          </Button>
        </div>
      ) : null}
      <div
        className="rules-workspace"
        data-detail={isEditorSelected || routeFilterId !== undefined || undefined}
      >
        <div className="rules-sidebar">{library}</div>
        {isEditorSelected ? (
          <main className="rules-detail">
            <header className="rules-toolbar">
              <Button
                variant="ghost"
                size="icon-lg"
                className="rules-toolbar__back"
                onClick={handleBack}
                disabled={busy}
                aria-label="返回上一页"
              >
                <ArrowLeft />
              </Button>
              <div className="rules-title">
                {isNameEditing ? (
                  <Input
                    aria-label="自定义规则名称"
                    placeholder={suggestedName}
                    value={name}
                    autoFocus
                    disabled={busy}
                    onChange={(event) => handleNameChange(event.target.value)}
                    onBlur={() => setIsNameEditing(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <h1>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setIsNameEditing(true)}
                      aria-label="编辑规则名称"
                    >
                      {displayedName}
                    </button>
                  </h1>
                )}
              </div>
              {isDirty ? <span className="rules-draft">未保存</span> : null}
              <div className="rules-toolbar__actions">
                {selectedFilter ? (
                  <label className="rules-enabled">
                    <Switch
                      checked={selectedFilter.enabled}
                      onCheckedChange={() => void handleToggle()}
                      disabled={busy}
                      aria-label="启用监听"
                    />
                    <span className="rules-enabled__label">{selectedFilter.enabled ? "已启用" : "已停用"}</span>
                  </label>
                ) : null}
                <Button
                  size="lg"
                  onClick={() => void handleSave()}
                  disabled={busy || Boolean(selectedFilter && !isDirty)}
                  className="rules-save"
                >
                  {operation === "save" ? (
                    <LoaderCircle
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : null}
                  保存
                </Button>
                {selectedFilter ? (
                  <Menu.Root>
                    <Menu.Trigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          disabled={busy}
                          aria-label="更多规则操作"
                        />
                      }
                    >
                      <MoreHorizontal />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Positioner
                        className="rules-theme rules-menu-positioner"
                        align="end"
                        sideOffset={6}
                      >
                        <Menu.Popup className="rules-menu">
                          <Menu.Group>
                            <Menu.Item onClick={() => setIsNameEditing(true)}>
                              修改名称
                            </Menu.Item>
                            <Menu.Item onClick={() => void handleToggle()}>
                              {selectedFilter.enabled ? "停用监听" : "启用监听"}
                            </Menu.Item>
                            <Menu.Item
                              onClick={handleDelete}
                              className="rules-menu__danger"
                            >
                              删除规则
                            </Menu.Item>
                          </Menu.Group>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.Root>
                ) : null}
              </div>
            </header>
            {error || operationMessage ? (
              <div className="rules-feedback" data-error={Boolean(error) || undefined} role={error ? "alert" : "status"}>
                {error || operationMessage}
              </div>
            ) : null}
            {!wide ? (
              <Tabs
                value={detailView}
                onValueChange={(value) => setDetailView(String(value))}
                className="rules-view-tabs"
              >
                <TabsList variant="line" aria-label="规则视图">
                  <TabsTrigger
                    id={`${viewId}-edit-tab`}
                    aria-controls={`${viewId}-edit`}
                    value="edit"
                  >
                    编辑条件
                  </TabsTrigger>
                  <TabsTrigger
                    id={`${viewId}-preview-tab`}
                    aria-controls={`${viewId}-preview`}
                    value="preview"
                  >
                    预览样本
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            <div className="rules-columns">
              {/* Keep the submitted draft stable until persistence completes. */}
              <section
                id={`${viewId}-edit`}
                className="rules-editor"
                ref={editorRef}
                inert={busy}
                aria-busy={busy}
                hidden={!wide && detailView !== "edit"}
                role={!wide ? "tabpanel" : undefined}
                aria-labelledby={!wide ? `${viewId}-edit-tab` : undefined}
                aria-label={!wide ? undefined : "编辑规则"}
              >
                <FilterForm
                  autoLocateUnreadNearRead={autoLocateUnreadNearRead}
                  onAutoLocateChange={handleAutoLocateChange}
                  chats={chats}
                  chatsLoading={chatsLoading}
                  forwardTargets={forwardTargets}
                  selectedForwardTargetIds={forwardTargetIds}
                  forwardTargetsLoading={forwardTargetsQuery.isLoading}
                  onToggleForwardTarget={toggleForwardTarget}
                  onCreateForwardTarget={() => requestNavigation(() => navigate("/notifications"), "/notifications")}
                  conditions={conditions}
                  onUpdateCondition={updateCondition}
                  onRemoveCondition={removeCondition}
                  onRemoveGroup={removeConditionGroup}
                  onToggleGroupEffect={toggleGroupEffect}
                  onAppendValues={appendConditionValues}
                  onAddAlternative={addAlternative}
                  onAddCondition={() => addCondition()}
                  onAddSenderCondition={() => addCondition("require", "sender")}
                  onAddExclusion={() => addCondition("exclude")}
                  historyBackfill={
                    <HistoryBackfillDialog
                      key={effectiveFilterId}
                      inline
                      hasUnsavedChanges={isDirty || !selectedFilter}
                      selectedChatCount={selectedChatCount}
                      latestJob={latestBackfillJob}
                      starting={operation === "backfill"}
                      disabled={busy || !authStatus.authorized}
                      onStart={handleStartBackfill}
                    />
                  }
                />
              </section>
              <div
                id={`${viewId}-preview`}
                className="rules-preview-pane"
                hidden={!wide && detailView !== "preview"}
                role={!wide ? "tabpanel" : undefined}
                aria-labelledby={!wide ? `${viewId}-preview-tab` : undefined}
              >
                <PreviewPanel
                  previewEnabled={persistedConditions.length > 0}
                  previewLoading={previewLoading}
                  previewStale={previewStale}
                  previewError={previewError}
                  previewMessages={previewMessages}
                  previewSamples={previewSamples}
                  previewSummary={previewSummary}
                  previewLimit={previewLimit}
                  onPreviewLimitChange={setPreviewLimit}
                  onLocateCondition={locateCondition}
                />
              </div>
            </div>
          </main>
        ) : (
          <div className="rules-no-selection">
            <p>{loading ? "读取规则中…" : filtersError ? "暂时无法读取规则" : "选择规则或新建规则"}</p>
          </div>
        )}
      </div>
      <FilterConfirmationDialog
        kind={confirmationKind}
        filterName={selectedFilter?.name ?? name.trim()}
        onCancel={() => {
          pendingNavigation.current = null;
          setConfirmationKind(null);
        }}
        onConfirm={handleConfirm}
      />
    </AppShell>
  );
}
