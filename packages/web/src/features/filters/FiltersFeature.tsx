import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  ListFilter,
  LoaderCircle,
  Plus,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { queryKeys } from "@/shared/query/queryKeys";
import type { HistoricalFilterPreviewSample } from "@/types";
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

export function FiltersFeature() {
  const { filterId: routeFilterId } = useParams<{ filterId?: string }>();
  const navigate = useNavigate();
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
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [previewSamples, setPreviewSamples] = useState<HistoricalFilterPreviewSample[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    scannedChats: number;
    total: number;
  } | null>(null);
  const [previewConditionSignature, setPreviewConditionSignature] = useState<string | null>(null);
  const [previewLimit, setPreviewLimit] = useState("200");
  const [backfillSummary, setBackfillSummary] = useState("");

  const isEditorSelected = routeFilterId !== undefined;
  const selectedFilter =
    routeFilterId && routeFilterId !== "new"
      ? filters.find((filter) => String(filter.id) === routeFilterId) ?? null
      : null;
  const enabledFilters = filters.filter((filter) => filter.enabled).length;
  const forwardTargets = forwardTargetsQuery.data ?? [];
  const persistedConditions = useMemo(
    () => mergePersistableConditions(normalizeConditions(conditions)),
    [conditions],
  );
  const currentConditionSignature = useMemo(
    () => JSON.stringify(persistedConditions),
    [persistedConditions],
  );
  const previewStale =
    previewConditionSignature !== null &&
    previewConditionSignature !== currentConditionSignature;
  const draftReady = Boolean(name.trim()) && persistedConditions.length > 0;
  const previewReady = previewSummary !== null && !previewStale;
  const readinessCount = Number(draftReady) + 1 + Number(previewReady);
  const readinessLabel = previewReady
    ? `准备度 ${readinessCount} / 3 · 已验证`
    : previewStale
      ? `准备度 ${readinessCount} / 3 · 需要重新验证`
      : `准备度 ${readinessCount} / 3 · 尚未验证`;

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
    setPreviewSamples([]);
    setPreviewSummary(null);
    setPreviewConditionSignature(null);
    setBackfillSummary("");
    // Only reset when the route resolves to a different rule. Cache updates for
    // the current rule must not wipe an unsaved draft.
  }, [routeFilterId, selectedFilter?.id]);

  useEffect(() => {
    if (
      !routeFilterId ||
      routeFilterId === "new" ||
      loading ||
      selectedFilter
    ) {
      return;
    }

    navigate("/filters", { replace: true });
  }, [loading, navigate, routeFilterId, selectedFilter]);

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
    setIsDirty(true);
  };

  const addCondition = () => {
    setConditions((current) => [...current, createDraftCondition()]);
    setIsDirty(true);
  };

  const removeCondition = (id: string) => {
    setConditions((current) =>
      current.length === 1
        ? [createDraftCondition()]
        : current.filter((condition) => condition.id !== id),
    );
    setIsDirty(true);
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
    setIsDirty(true);
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    setIsDirty(true);
  };

  const handleAutoLocateChange = (value: boolean) => {
    setAutoLocateUnreadNearRead(value);
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      const payload = buildPayload();
      const saved = selectedFilter
        ? await updateFilter(selectedFilter.id, payload)
        : await createFilter(payload);

      setIsDirty(false);
      setBackfillSummary("");
      if (!selectedFilter) {
        navigate(`/filters/${saved.id}`, { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      setError("");
      const nextConditions = buildConditions();
      const result = await api.filters.preview({
        conditions: nextConditions,
        perChatLimit: Number(previewLimit) || 200,
      });

      setPreviewSamples(result.samples);
      setPreviewSummary({
        scannedChats: result.scannedChats,
        total: result.total,
      });
      setPreviewConditionSignature(JSON.stringify(nextConditions));
      setBackfillSummary("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "测试失败");
      setPreviewSamples([]);
      setPreviewSummary(null);
      setPreviewConditionSignature(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBackfill = async () => {
    if (!selectedFilter) {
      setError("请先保存规则，再执行历史回拉");
      return;
    }

    if (isDirty) {
      setError("当前修改尚未保存，请先保存后再回拉历史消息");
      return;
    }

    try {
      setBackfillLoading(true);
      setError("");
      const result = await api.filters.backfill(selectedFilter.id, {
        perChatLimit: Number(previewLimit) || 200,
      });
      setBackfillSummary(
        `扫描 ${result.scannedChats} 个会话，命中 ${result.matchedCount} 条，新增 ${result.savedCount} 条，跳过已存在 ${result.skippedExistingCount} 条。`,
      );
      setPreviewSamples([]);
      setPreviewSummary(null);
      setPreviewConditionSignature(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "历史回拉失败");
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!selectedFilter) return;

    try {
      setSaving(true);
      setError("");
      await toggleFilter(selectedFilter.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "更新规则状态失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFilter) return;

    try {
      setSaving(true);
      setError("");
      await deleteFilter(selectedFilter.id);
      navigate("/filters", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setSaving(false);
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
        <div className="flex min-h-0 flex-1 flex-col bg-background/72">
          <WorkspaceHeader
            title="过滤器"
            description={`${filters.length} 个规则 · ${enabledFilters} 个正在监听`}
            actions={
              <>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  <ListFilter data-icon="inline-start" />
                  {filters.length}
                </Badge>
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  <CheckCircle2 data-icon="inline-start" />
                  {enabledFilters} 启用
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => navigate("/filters/new")}
                >
                  <Plus data-icon="inline-start" />
                  新建
                </Button>
              </>
            }
          />
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

  return (
    <AppShell
      activeTab="filters"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-background/84">
        <WorkspaceHeader
          className="min-h-16 bg-card/78 px-4 py-2"
          title={
            <span className="flex min-w-0 items-center gap-2">
              <Input
                id="filter-name"
                name="filter-name"
                aria-label="过滤器名称"
                placeholder="未命名规则"
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                className="h-7 w-auto min-w-20 max-w-64 border-transparent bg-transparent px-0 text-base font-semibold shadow-none [field-sizing:content] focus-visible:border-input focus-visible:bg-card focus-visible:px-2"
              />
              <Badge
                variant="secondary"
                className={previewReady
                  ? "hidden shrink-0 bg-success/10 text-success sm:inline-flex"
                  : "hidden shrink-0 bg-warning/16 text-warning-foreground sm:inline-flex"}
              >
                {readinessLabel}
              </Badge>
            </span>
          }
          description={
            selectedFilter
              ? `${selectedFilter.enabled ? "正在监听" : "已停用"} · ${persistedConditions.length} 个条件`
              : "尚未保存 · 可直接测试当前草稿"
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
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="hidden md:inline-flex xl:hidden"
                onClick={handlePreview}
                disabled={previewLoading}
                aria-label={previewLoading ? "正在测试当前草稿" : "立即测试当前草稿"}
                title="测试当前草稿"
              >
                {previewLoading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FlaskConical />
                )}
              </Button>
              {selectedFilter ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleToggle}
                  disabled={saving}
                >
                  {selectedFilter.enabled ? "停用监听" : "启用监听"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                {selectedFilter ? "保存修改" : "创建并启用"}
              </Button>
            </>
          }
        />

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto xl:grid xl:grid-cols-[minmax(460px,1fr)_372px] xl:overflow-hidden">
            <section className="min-w-0 shrink-0 bg-card/26 pb-20 md:pb-0 xl:min-h-0 xl:overflow-y-auto">
              <FilterForm
                selectedFilter={selectedFilter}
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
                saving={saving}
                onUpdateCondition={updateCondition}
                onRemoveCondition={removeCondition}
                onAppendValues={appendConditionValues}
                onAddCondition={addCondition}
                onDelete={handleDelete}
              />
            </section>

            <PreviewPanel
              className="mx-3 mb-4 flex shrink-0 rounded-xl border border-border sm:mx-4 sm:mb-4 xl:m-0 xl:rounded-none xl:border-y-0 xl:border-r-0"
              selectedFilter={selectedFilter}
              conditions={conditions}
              chats={chats}
              draftDirty={isDirty || !selectedFilter}
              previewStale={previewStale}
              previewLoading={previewLoading}
              backfillLoading={backfillLoading}
              previewSamples={previewSamples}
              previewSummary={previewSummary}
              backfillSummary={backfillSummary}
              previewLimit={previewLimit}
              onPreviewLimitChange={setPreviewLimit}
              onPreview={handlePreview}
              onBackfill={handleBackfill}
            />
          </div>
        </main>

        <button
          type="button"
          className="fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-30 flex h-11 items-center justify-between rounded-xl border border-primary/28 bg-accent/92 px-3 text-xs font-semibold text-primary shadow-[0_10px_26px_rgba(35,76,64,0.13)] md:hidden"
          onClick={handlePreview}
          disabled={previewLoading}
        >
          <span>
            {previewReady
              ? `草稿已验证 · ${previewSummary?.total ?? 0} 条命中`
              : previewStale
                ? "当前草稿需要重新验证"
                : "当前草稿待验证"}
          </span>
          <span>{previewLoading ? "测试中…" : "运行测试 →"}</span>
        </button>
      </div>
    </AppShell>
  );
}
