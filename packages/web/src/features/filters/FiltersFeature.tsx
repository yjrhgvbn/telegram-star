import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ListFilter, Plus, SlidersHorizontal } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/shared/query/queryKeys";
import type { HistoricalFilterPreviewMessage } from "@/types";
import { FilterForm } from "./components/FilterForm";
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
  const { filters, createFilter, updateFilter, deleteFilter, toggleFilter } = useFilters();
  const forwardTargetsQuery = useQuery({
    queryKey: queryKeys.forwardTargets.all,
    queryFn: api.forwardTargets.list,
  });

  const [selectedFilterId, setSelectedFilterId] = useState<string>("new");
  const [name, setName] = useState("");
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);
  const [forwardTargetIds, setForwardTargetIds] = useState<number[]>([]);
  const [conditions, setConditions] = useState<DraftCondition[]>([createDraftCondition()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<HistoricalFilterPreviewMessage[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{ scannedChats: number; total: number } | null>(null);
  const [previewLimit, setPreviewLimit] = useState("200");
  const [backfillSummary, setBackfillSummary] = useState<string>("");

  const selectedFilter = filters.find((filter) => String(filter.id) === selectedFilterId) ?? null;
  const enabledFilters = filters.filter((filter) => filter.enabled).length;
  const forwardTargets = forwardTargetsQuery.data ?? [];

  // 路由参数变化时同步选中的过滤器
  useEffect(() => {
    if (!routeFilterId || routeFilterId === "new") {
      setSelectedFilterId("new");
      return;
    }
    setSelectedFilterId(routeFilterId);
  }, [routeFilterId]);

  // 选中过滤器变化时重置表单状态
  useEffect(() => {
    if (selectedFilterId === "new") {
      setName("");
      setAutoLocateUnreadNearRead(true);
      setForwardTargetIds([]);
      setConditions([createDraftCondition()]);
      setError("");
      setPreviewMessages([]);
      setPreviewSummary(null);
      setBackfillSummary("");
      return;
    }

    if (!selectedFilter) return;

    setName(selectedFilter.name);
    setAutoLocateUnreadNearRead(selectedFilter.autoLocateUnreadNearRead);
    setForwardTargetIds(selectedFilter.forwardTargetIds);
    setConditions(toDraftConditions(selectedFilter.conditions));
    setError("");
    setPreviewMessages([]);
    setPreviewSummary(null);
    setBackfillSummary("");
  }, [selectedFilterId, selectedFilter]);

  // ---- 条件编辑操作 ----

  const updateCondition = (id: string, updater: (condition: DraftCondition) => DraftCondition) => {
    setConditions((current) =>
      current.map((condition) => (condition.id === id ? updater(condition) : condition)),
    );
  };

  const addCondition = () => {
    setConditions((current) => [...current, createDraftCondition()]);
  };

  const removeCondition = (id: string) => {
    setConditions((current) =>
      current.length === 1 ? [createDraftCondition()] : current.filter((c) => c.id !== id),
    );
  };

  const appendConditionValues = (id: string) => {
    updateCondition(id, (condition) => {
      const separator = condition.type === "regex" ? /\n/ : /[,，\n]/;
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

  // ---- 构建提交 payload，验证基本字段 ----

  const buildPayload = () => {
    const normalized = normalizeConditions(conditions);
    const mergedConditions = mergePersistableConditions(normalized);

    if (!name.trim()) throw new Error("过滤器名称不能为空");
    if (mergedConditions.length === 0) throw new Error("至少添加一个有效条件");
    assertValidRegexConditions(mergedConditions);

    return {
      name: name.trim(),
      conditions: mergedConditions,
      autoLocateUnreadNearRead,
      forwardTargetIds,
    };
  };

  const toggleForwardTarget = (targetId: number) => {
    setForwardTargetIds((current) =>
      current.includes(targetId)
        ? current.filter((id) => id !== targetId)
        : [...current, targetId],
    );
  };

  // ---- 事件处理 ----

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      const payload = buildPayload();
      const saved = selectedFilter
        ? await updateFilter(selectedFilter.id, payload)
        : await createFilter(payload);
      setSelectedFilterId(String(saved.id));
      if (!selectedFilter) {
        navigate(`/filters/${saved.id}`, { replace: true });
      }
      setBackfillSummary("");
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      setError("");
      const payload = buildPayload();
      const result = await api.filters.preview({
        conditions: payload.conditions,
        perChatLimit: Number(previewLimit) || 200,
      });
      setPreviewMessages(result.messages);
      setPreviewSummary({ scannedChats: result.scannedChats, total: result.total });
      setBackfillSummary("");
    } catch (err: any) {
      setError(err.message || "预览失败");
      setPreviewMessages([]);
      setPreviewSummary(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleBackfill = async () => {
    if (!selectedFilter) {
      setError("请先保存过滤器，再执行历史拉取");
      return;
    }

    try {
      setBackfillLoading(true);
      setError("");
      buildPayload();
      const result = await api.filters.backfill(selectedFilter.id, {
        perChatLimit: Number(previewLimit) || 200,
      });
      setBackfillSummary(
        `扫描 ${result.scannedChats} 个会话，命中 ${result.matchedCount} 条，新增 ${result.savedCount} 条，跳过已存在 ${result.skippedExistingCount} 条`,
      );
      setPreviewMessages([]);
      setPreviewSummary(null);
    } catch (err: any) {
      setError(err.message || "历史拉取失败");
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFilter) return;

    try {
      setSaving(true);
      setError("");
      await deleteFilter(selectedFilter.id);
      setSelectedFilterId("new");
      navigate("/filters", { replace: true });
    } catch (err: any) {
      setError(err.message || "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      activeTab="filters"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto px-3 py-3 sm:px-4 lg:px-5">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
            <header className="rounded-lg bg-card/80 p-4 shadow-sm ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <SlidersHorizontal className="size-4" />
                    过滤器规则
                  </div>
                  <h1 className="mt-1 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
                    {selectedFilter ? selectedFilter.name : "新建过滤器"}
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <ListFilter className="size-3.5" />
                    {filters.length} 个规则
                  </Badge>
                  <Badge variant="secondary" className="h-7 gap-1.5 rounded-lg px-2.5">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {enabledFilters} 个启用
                  </Badge>
                  <Button type="button" size="sm" onClick={() => navigate("/filters/new")}>
                    <Plus data-icon="inline-start" />
                    新建
                  </Button>
                </div>
              </div>
            </header>

            <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_430px]">
              <aside className="min-w-0 lg:row-span-2 2xl:row-span-1">
                <section className="rounded-lg bg-card/80 p-2 shadow-sm ring-1 ring-foreground/10">
                  <div className="flex items-center justify-between px-2 py-2">
                    <div className="text-sm font-semibold">已保存规则</div>
                    <Badge variant="outline" className="rounded-md">
                      {filters.length}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition",
                        selectedFilterId === "new"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-foreground hover:bg-muted/65",
                      )}
                      onClick={() => navigate("/filters/new")}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">新建过滤器</span>
                      <Plus className="size-4 shrink-0" />
                    </button>

                    {filters.length === 0 ? (
                      <div className="rounded-lg bg-muted/45 px-3 py-5 text-center text-sm text-muted-foreground">
                        暂无已保存规则
                      </div>
                    ) : (
                      filters.map((filter) => {
                        const active = String(filter.id) === selectedFilterId;
                        const keywordCount = filter.conditions
                          .filter((condition) => condition.type === "keyword")
                          .reduce((count, condition) => count + condition.values.length, 0);
                        const chatCount = filter.conditions
                          .filter((condition) => condition.type === "chat")
                          .reduce((count, condition) => count + condition.values.length, 0);
                        const regexCount = filter.conditions
                          .filter((condition) => condition.type === "regex")
                          .reduce((count, condition) => count + condition.values.length, 0);

                        return (
                          <button
                            key={filter.id}
                            type="button"
                            className={cn(
                              "flex w-full flex-col gap-2 rounded-lg px-3 py-2.5 text-left transition",
                              active
                                ? "bg-accent/75 text-accent-foreground shadow-sm"
                                : "hover:bg-muted/65",
                            )}
                            onClick={() => navigate(`/filters/${filter.id}`)}
                          >
                            <div className="flex w-full items-center justify-between gap-3">
                              <span className="min-w-0 truncate text-sm font-medium">{filter.name}</span>
                              <span
                                className={cn(
                                  "size-2 shrink-0 rounded-full",
                                  filter.enabled ? "bg-success" : "bg-muted-foreground/35",
                                )}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                              <span>{keywordCount} 关键词</span>
                              <span>{regexCount} 正则</span>
                              <span>{chatCount} 会话</span>
                              <span>{filter.forwardTargetIds.length} 转发</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              </aside>

              <div className="min-w-0">
                <FilterForm
                  selectedFilter={selectedFilter}
                  name={name}
                  onNameChange={setName}
                  autoLocateUnreadNearRead={autoLocateUnreadNearRead}
                  onAutoLocateChange={setAutoLocateUnreadNearRead}
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
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onToggle={() => {
                    if (selectedFilter) void toggleFilter(selectedFilter.id);
                  }}
                />
              </div>

              <div className="min-w-0 lg:col-start-2 2xl:col-start-auto">
                <PreviewPanel
                  selectedFilter={selectedFilter}
                  previewLoading={previewLoading}
                  backfillLoading={backfillLoading}
                  previewMessages={previewMessages}
                  previewSummary={previewSummary}
                  backfillSummary={backfillSummary}
                  previewLimit={previewLimit}
                  onPreviewLimitChange={setPreviewLimit}
                  onPreview={handlePreview}
                  onBackfill={handleBackfill}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
