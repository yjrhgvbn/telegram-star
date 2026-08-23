import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LoaderCircle,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/shared/query/queryKeys";
import type { FilterBackfillJobCreateInput, FilterCondition } from "@/types";
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
  createDraftCondition,
  createInitialDraftConditions,
  deriveFilterName,
  mergePersistableConditions,
  normalizeConditions,
  toDraftConditions,
} from "./utils";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const {
    filters,
    chats,
    loading,
    chatsLoading,
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
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");
  const [operation, setOperation] = useState<CommitMode | null>(null);
  const [operationMessage, setOperationMessage] = useState("");
  const [confirmationKind, setConfirmationKind] =
    useState<FilterConfirmationKind | null>(null);
  const [previewLimit, setPreviewLimit] = useState("200");
  const [startedBackfillJobId, setStartedBackfillJobId] = useState<string | null>(null);
  const [debouncedPreviewRequest, setDebouncedPreviewRequest] =
    useState<DraftPreviewRequest | null>(null);

  const isEditorSelected = routeFilterId !== undefined;
  const selectedFilter =
    routeFilterId && routeFilterId !== "new"
      ? filters.find((filter) => String(filter.id) === routeFilterId) ?? null
      : null;
  const forwardTargets = forwardTargetsQuery.data ?? [];
  const persistedConditions = useMemo(
    () => mergePersistableConditions(normalizeConditions(conditions)),
    [conditions],
  );
  const hasIncompleteScriptCondition = conditions.some(
    (condition) => condition.type === "script" && !condition.input.trim(),
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
    () => new Set(
      persistedConditions
        .filter((condition) => condition.type === "chat")
        .flatMap((condition) => condition.values),
    ).size,
    [persistedConditions],
  );

  const latestBackfillQuery = useQuery({
    queryKey: queryKeys.filters.latestBackfill(selectedFilter?.id ?? 0),
    queryFn: () => {
      if (!selectedFilter) throw new Error("过滤器尚未保存");
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

    if (persistedConditions.length === 0) return { request: null, error: "" };

    try {
      assertValidRegexConditions(persistedConditions);
      assertValidScriptConditions(persistedConditions);
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
  const previewMessages = previewQuery.data?.messages ?? [];
  const previewSummary = previewQuery.data
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

  // 路由是列表 / 新建 / 编辑三种工作模式的唯一来源，避免未来增加子面板时状态互相漂移。
  useEffect(() => {
    if (!routeFilterId) return;

    if (routeFilterId === "new") {
      setName("");
      setIsNameEditing(false);
      setAutoLocateUnreadNearRead(true);
      setForwardTargetIds([]);
      setConditions(createInitialDraftConditions());
    } else if (selectedFilter) {
      setName(selectedFilter.name);
      setIsNameEditing(false);
      setAutoLocateUnreadNearRead(selectedFilter.autoLocateUnreadNearRead);
      setForwardTargetIds(selectedFilter.forwardTargetIds);
      setConditions(toDraftConditions(selectedFilter.conditions));
    } else {
      return;
    }

    setIsDirty(false);
    setError("");
    setOperationMessage("");
    setConfirmationKind(null);
    setDebouncedPreviewRequest(null);
    // Only reset when the route resolves to a different rule. Cache updates for
    // the current rule must not wipe an unsaved draft.
  }, [routeFilterId, selectedFilter?.id]);

  useEffect(() => {
    if (!routeFilterId || routeFilterId === "new" || loading || selectedFilter) {
      return;
    }

    navigate("/filters", { replace: true });
  }, [loading, navigate, routeFilterId, selectedFilter]);

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

    if (persistedConditions.length === 0) {
      throw new Error("至少添加一个有效条件");
    }

    assertValidRegexConditions(persistedConditions);
    assertValidScriptConditions(persistedConditions);
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

  const addCondition = () => {
    setConditions((current) => [...current, createDraftCondition()]);
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

  const persistDraft = async () => {
    const payload = buildPayload();
    const saved = selectedFilter
      ? await updateFilter(selectedFilter.id, payload)
      : await createFilter(payload);

    setName(saved.name);
    setIsDirty(false);
    return saved;
  };

  const handleSave = async () => {
    try {
      setOperation("save");
      setError("");
      setOperationMessage("");

      const savedFilter = await persistDraft();

      if (!selectedFilter) {
        navigate(`/filters/${savedFilter.id}`, { replace: true });
      }

      setOperationMessage("规则已保存");
    } catch (commitError: unknown) {
      setError(commitError instanceof Error ? commitError.message : "保存失败");
    } finally {
      setOperation(null);
    }
  };

  const handleStartBackfill = async (input: FilterBackfillJobCreateInput) => {
    let saved = false;

    try {
      setOperation("backfill");
      setError("");
      setOperationMessage("");
      const savedFilter = await persistDraft();
      saved = true;

      if (!selectedFilter) {
        navigate(`/filters/${savedFilter.id}`, { replace: true });
      }

      const job = await startBackfillJob(savedFilter.id, input);
      setStartedBackfillJobId(job.id);
      setOperationMessage("历史补录已在后台开始，可以离开当前页面");
    } catch (backfillError: unknown) {
      const message = backfillError instanceof Error ? backfillError.message : "操作失败";
      setError(saved ? `规则已保存，但无法开始历史补录：${message}` : message);
      throw backfillError;
    } finally {
      setOperation(null);
    }
  };

  const handleToggle = async () => {
    if (!selectedFilter) return;

    try {
      setOperation("toggle");
      setError("");
      await toggleFilter(selectedFilter.id);
    } catch (toggleError: unknown) {
      setError(toggleError instanceof Error ? toggleError.message : "更新规则状态失败");
    } finally {
      setOperation(null);
    }
  };

  const handleDelete = () => {
    if (!selectedFilter) return;
    setConfirmationKind("delete");
  };

  const deleteSelectedFilter = async () => {
    if (!selectedFilter) return;

    try {
      setOperation("delete");
      setError("");
      await deleteFilter(selectedFilter.id);
      navigate("/filters", { replace: true });
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setOperation(null);
    }
  };

  // 编辑器可从规则列表或消息上下文进入，返回时应保留真实入口。
  const navigateBack = () => {
    navigate(-1);
  };

  const handleBack = () => {
    if (isDirty) {
      setConfirmationKind("discard");
      return;
    }

    navigateBack();
  };

  const handleConfirm = () => {
    const confirmedKind = confirmationKind;
    setConfirmationKind(null);

    if (confirmedKind === "delete") {
      void deleteSelectedFilter();
      return;
    }

    if (confirmedKind === "discard") {
      navigateBack();
    }
  };

  if (!isEditorSelected) {
    return (
      <AppShell
        activeTab="filters"
        authStatus={authStatus}
        authLoading={authLoading}
        onLoginSuccess={handleLoginSuccess}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <FilterLibrary
            filters={filters}
            chats={chats}
            loading={loading}
            onCreate={() => navigate("/filters/new")}
            onSelect={(id) => navigate(`/filters/${id}`)}
          />
        </div>
      </AppShell>
    );
  }

  const busy = operation !== null;
  const desktopPreviewStatus = previewError
    ? "自动预览暂不可用"
    : previewLoading
      ? "正在更新预览…"
      : previewSummary
        ? `自动预览已更新 · ${previewSummary.total} 条命中`
        : "填写条件后自动预览";
  const displayedName = selectedFilter
    ? name.trim() || suggestedName
    : name.trim() || "新建过滤器";
  const automaticNameDescription = persistedConditions.length > 0
    ? `将自动命名为「${suggestedName}」`
    : "名称将自动使用首个关键词或正则";

  return (
    <AppShell
      activeTab="filters"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <WorkspaceHeader
          className="min-h-16 bg-card/78 px-3 py-2 sm:px-4"
          title={
            isNameEditing ? (
              <Input
                id="filter-name"
                name="filter-name"
                aria-label="自定义过滤器名称"
                placeholder={suggestedName}
                value={name}
                autoFocus
                onChange={(event) => handleNameChange(event.target.value)}
                onBlur={() => setIsNameEditing(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                className="h-7 w-auto min-w-24 max-w-48 rounded-none border-x-0 border-t-0 border-b-input bg-transparent px-0 text-base font-semibold shadow-none [field-sizing:content] focus-visible:border-b-primary focus-visible:ring-0 sm:max-w-72"
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-ml-1 max-w-full justify-start px-1 font-semibold"
                aria-label="编辑过滤器名称"
                title="点击编辑名称"
                onClick={() => setIsNameEditing(true)}
              >
                <span className="truncate">{displayedName}</span>
              </Button>
            )
          }
          description={
            selectedFilter
              ? `${selectedFilter.enabled ? "正在监听" : "已停用"} · ${persistedConditions.length} 个条件`
              : name.trim()
                ? "使用自定义名称 · 修改条件后自动预览"
                : `${automaticNameDescription}，也可自定义`
          }
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleBack}
              aria-label="返回上一页"
            >
              <ArrowLeft />
            </Button>
          }
          actions={
            <>
              {!isNameEditing ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsNameEditing(true)}
                >
                  <Pencil data-icon="inline-start" />
                  {name.trim() ? "修改名称" : "自定义名称"}
                </Button>
              ) : null}
              {selectedFilter ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleToggle}
                    disabled={busy}
                  >
                    {operation === "toggle" ? (
                      <LoaderCircle className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    {selectedFilter.enabled ? "停用监听" : "启用监听"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    onClick={handleDelete}
                    disabled={busy}
                    aria-label="删除规则"
                    title="删除规则"
                  >
                    {operation === "delete" ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </>
              ) : null}
            </>
          }
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:grid xl:grid-cols-[minmax(460px,1fr)_372px] xl:gap-3 xl:p-3">
          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <FilterForm
              autoLocateUnreadNearRead={autoLocateUnreadNearRead}
              onAutoLocateChange={handleAutoLocateChange}
              chats={chats}
              chatsLoading={chatsLoading}
              forwardTargets={forwardTargets}
              selectedForwardTargetIds={forwardTargetIds}
              forwardTargetsLoading={forwardTargetsQuery.isLoading}
              onToggleForwardTarget={toggleForwardTarget}
              onCreateForwardTarget={() => navigate("/notifications")}
              conditions={conditions}
              error={error}
              onUpdateCondition={updateCondition}
              onRemoveCondition={removeCondition}
              onAppendValues={appendConditionValues}
              onAddCondition={addCondition}
            />
          </section>

          <PreviewPanel
            className="xl:h-full"
            previewEnabled={persistedConditions.length > 0}
            previewLoading={previewLoading}
            previewStale={previewStale}
            previewError={previewError}
            previewMessages={previewMessages}
            previewSummary={previewSummary}
            previewLimit={previewLimit}
            onPreviewLimitChange={setPreviewLimit}
          />
        </main>

        <footer
          aria-label="保存规则"
          className="shrink-0 border-t border-border bg-card/96 p-2 shadow-[0_-8px_24px_color-mix(in_oklab,var(--foreground)_5%,transparent)] backdrop-blur-md lg:min-h-[78px] lg:px-6 lg:py-4"
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-1.5 sm:flex-row sm:items-center">
            <p
              className={cn(
                "min-w-0 flex-1 truncate px-1 text-[11px]",
                operationMessage ? "text-success" : "hidden text-muted-foreground sm:block",
              )}
              title={operationMessage || desktopPreviewStatus}
            >
              {operationMessage || desktopPreviewStatus}
            </p>

            <div className="grid shrink-0 grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full sm:w-auto sm:min-w-32 lg:h-[46px] lg:min-w-[152px] lg:px-4"
                onClick={() => void handleSave()}
                disabled={busy}
              >
                {operation === "save" ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                保存
              </Button>
              <HistoryBackfillDialog
                selectedChatCount={selectedChatCount}
                latestJob={latestBackfillJob}
                starting={operation === "backfill"}
                disabled={busy || !authStatus.authorized}
                onStart={handleStartBackfill}
              />
            </div>
          </div>
        </footer>

        <FilterConfirmationDialog
          kind={confirmationKind}
          filterName={selectedFilter?.name ?? name.trim()}
          onCancel={() => setConfirmationKind(null)}
          onConfirm={handleConfirm}
        />
      </div>
    </AppShell>
  );
}
