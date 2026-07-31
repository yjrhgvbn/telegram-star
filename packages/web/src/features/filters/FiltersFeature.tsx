import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Database,
  LoaderCircle,
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
import type { FilterCondition } from "@/types";
import { FilterForm } from "./components/FilterForm";
import { FilterLibrary } from "./components/FilterLibrary";
import { PreviewPanel } from "./components/PreviewPanel";
import type { DraftCondition } from "./types";
import {
  assertValidRegexConditions,
  createDraftCondition,
  mergePersistableConditions,
  normalizeConditions,
  toDraftConditions,
} from "./utils";

type CommitMode = "save" | "sync" | "toggle" | "delete";

interface DraftPreviewRequest {
  conditions: FilterCondition[];
  signature: string;
  perChatLimit: number;
}

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
    backfillFilter,
  } = useFilters();
  const forwardTargetsQuery = useQuery({
    queryKey: queryKeys.forwardTargets.all,
    queryFn: api.forwardTargets.list,
  });

  const [name, setName] = useState("");
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);
  const [forwardTargetIds, setForwardTargetIds] = useState<number[]>([]);
  const [conditions, setConditions] = useState<DraftCondition[]>([createDraftCondition()]);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");
  const [operation, setOperation] = useState<CommitMode | null>(null);
  const [previewLimit, setPreviewLimit] = useState("200");
  const [operationMessage, setOperationMessage] = useState("");
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
  const currentConditionSignature = useMemo(
    () => JSON.stringify(persistedConditions),
    [persistedConditions],
  );
  const previewPerChatLimit = Number(previewLimit) || 200;

  const previewCandidate = useMemo<{
    request: DraftPreviewRequest | null;
    error: string;
  }>(() => {
    if (!isEditorSelected || persistedConditions.length === 0) {
      return { request: null, error: "" };
    }

    try {
      assertValidRegexConditions(persistedConditions);
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
  }, [currentConditionSignature, isEditorSelected, persistedConditions, previewPerChatLimit]);

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
          totalLimit: 1000,
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
      setAutoLocateUnreadNearRead(true);
      setForwardTargetIds([]);
      setConditions([createDraftCondition()]);
    } else if (selectedFilter) {
      setName(selectedFilter.name);
      setAutoLocateUnreadNearRead(selectedFilter.autoLocateUnreadNearRead);
      setForwardTargetIds(selectedFilter.forwardTargetIds);
      setConditions(toDraftConditions(selectedFilter.conditions));
    } else {
      return;
    }

    setIsDirty(false);
    setError("");
    setOperationMessage("");
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

  const markDirty = () => {
    setIsDirty(true);
    setError("");
    setOperationMessage("");
  };

  const buildConditions = () => {
    if (persistedConditions.length === 0) {
      throw new Error("至少添加一个有效条件");
    }

    assertValidRegexConditions(persistedConditions);
    return persistedConditions;
  };

  const buildPayload = () => {
    const nextConditions = buildConditions();
    if (!name.trim()) throw new Error("请为规则填写名称");

    return {
      name: name.trim(),
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

    setIsDirty(false);
    return saved;
  };

  const handleCommit = async (mode: "save" | "sync") => {
    let saved = false;

    try {
      setOperation(mode);
      setError("");
      setOperationMessage("");

      const savedFilter = await persistDraft();
      saved = true;

      if (!selectedFilter) {
        navigate(`/filters/${savedFilter.id}`, { replace: true });
      }

      if (mode === "save") {
        setOperationMessage("规则已保存");
        return;
      }

      const result = await backfillFilter(savedFilter.id, {
        perChatLimit: previewPerChatLimit,
      });
      setOperationMessage(
        `同步完成：命中 ${result.matchedCount} 条，新增 ${result.savedCount} 条，跳过 ${result.skippedExistingCount} 条。`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.filters.preview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages.stats });
    } catch (commitError: unknown) {
      const message = commitError instanceof Error ? commitError.message : "操作失败";
      setError(
        saved && mode === "sync"
          ? `规则已保存，但历史同步失败：${message}`
          : message,
      );
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

  const handleDelete = async () => {
    if (!selectedFilter) return;
    if (!window.confirm(`确定删除规则“${selectedFilter.name}”吗？此操作无法撤销。`)) {
      return;
    }

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

  const handleBackToList = () => {
    if (isDirty && !window.confirm("当前修改尚未保存，确定返回规则列表吗？")) {
      return;
    }

    navigate("/filters");
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
            <Input
              id="filter-name"
              name="filter-name"
              aria-label="过滤器名称"
              placeholder="未命名规则"
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              className="h-7 w-auto min-w-20 max-w-44 border-transparent bg-transparent px-0 text-base font-semibold shadow-none [field-sizing:content] focus-visible:border-input focus-visible:bg-card focus-visible:px-2 sm:max-w-64"
            />
          }
          description={
            selectedFilter
              ? `${selectedFilter.enabled ? "正在监听" : "已停用"} · ${persistedConditions.length} 个条件`
              : "尚未保存 · 修改条件后自动预览"
          }
          leading={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleBackToList}
              aria-label="返回规则列表"
            >
              <ArrowLeft />
            </Button>
          }
          actions={
            selectedFilter ? (
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
            ) : null
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
                onClick={() => void handleCommit("save")}
                disabled={busy}
              >
                {operation === "save" ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                保存
              </Button>
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto sm:min-w-64 lg:h-[46px] lg:min-w-[300px] lg:px-4"
                onClick={() => void handleCommit("sync")}
                disabled={busy}
              >
                {operation === "sync" ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Database data-icon="inline-start" />
                )}
                <span className="sm:hidden">保存并同步 · {previewLimit}</span>
                <span className="hidden sm:inline">
                  保存并同步最近 {previewLimit} 条/会话
                </span>
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
