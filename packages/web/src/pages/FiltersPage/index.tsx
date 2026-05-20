import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { api } from "@/api/client";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import type { HistoricalFilterPreviewMessage } from "@/types";
import { FilterForm } from "./FilterForm";
import { PreviewPanel } from "./PreviewPanel";
import type { DraftCondition } from "./types";
import { createDraftCondition, normalizeConditions, toDraftConditions } from "./utils";

export function FiltersPage() {
  const { filterId: routeFilterId } = useParams<{ filterId?: string }>();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const { filters, createFilter, updateFilter, deleteFilter, toggleFilter } = useFilters();

  const [selectedFilterId, setSelectedFilterId] = useState<string>("new");
  const [name, setName] = useState("");
  const [autoLocateUnreadNearRead, setAutoLocateUnreadNearRead] = useState(true);
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

  const appendKeywordValues = (id: string) => {
    updateCondition(id, (condition) => {
      const nextValues = condition.input
        .split(/[,，\n]/)
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
    const keywordConditions = normalized.filter((c) => c.type === "keyword");
    const chatValues = Array.from(
      new Set(
        normalized
          .filter((c) => c.type === "chat")
          .flatMap((c) => c.values),
      ),
    );
    const mergedConditions =
      chatValues.length > 0
        ? [...keywordConditions, { type: "chat" as const, values: chatValues }]
        : keywordConditions;

    if (!name.trim()) throw new Error("过滤器名称不能为空");
    if (mergedConditions.length === 0) throw new Error("至少添加一个有效条件");

    return { name: name.trim(), conditions: mergedConditions, autoLocateUnreadNearRead };
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
    } catch (err: any) {
      setError(err.message || "删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      activeTab="filtered"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 overflow-auto p-2 sm:p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)]">
            <div className="space-y-2.5">
              <FilterForm
                selectedFilter={selectedFilter}
                name={name}
                onNameChange={setName}
                autoLocateUnreadNearRead={autoLocateUnreadNearRead}
                onAutoLocateChange={setAutoLocateUnreadNearRead}
                conditions={conditions}
                error={error}
                saving={saving}
                onUpdateCondition={updateCondition}
                onRemoveCondition={removeCondition}
                onAppendKeywords={appendKeywordValues}
                onAddCondition={addCondition}
                onSave={handleSave}
                onDelete={handleDelete}
                onToggle={() => void toggleFilter(selectedFilter!.id)}
              />
            </div>

            <div className="space-y-2.5">
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
        </main>
      </div>
    </AppShell>
  );
}
