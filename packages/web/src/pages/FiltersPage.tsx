import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { JoinedChatPicker } from "@/components/JoinedChatPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/api/client";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import type {
  FilterCondition,
  FilterConditionType,
  HistoricalFilterPreviewMessage,
} from "@/types";

type DraftCondition = {
  id: string;
  type: FilterConditionType;
  values: string[];
  input: string;
};

const conditionTypeOptions: Array<{ value: FilterConditionType; label: string }> = [
  { value: "keyword", label: "关键词" },
  { value: "chat", label: "会话" },
];

function createDraftCondition(type: FilterConditionType = "keyword"): DraftCondition {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    values: [],
    input: "",
  };
}

function toDraftConditions(conditions: FilterCondition[]): DraftCondition[] {
  if (conditions.length === 0) {
    return [createDraftCondition()];
  }

  return conditions.map((condition, index) => ({
    id: `${condition.type}-${index}-${Math.random().toString(36).slice(2, 10)}`,
    type: condition.type,
    values: [...condition.values],
    input: "",
  }));
}

function normalizeConditions(conditions: DraftCondition[]): FilterCondition[] {
  return conditions
    .map((condition) => ({
      type: condition.type,
      values: (
        // 关键词条件允许“输入框未点添加就直接保存”，这里会把暂存输入一并并入最终值。
        condition.type === "keyword"
          ? [
              ...condition.values,
              ...condition.input
                .split(/[,，\n]/)
                .map((item) => item.trim())
                .filter(Boolean),
            ]
          : condition.values
      )
        .map((value) => value.trim())
        .filter(Boolean),
    }))
    .filter((condition) => condition.values.length > 0);
}

export function FiltersPage() {
  const { filterId: routeFilterId } = useParams<{ filterId?: string }>();
  const { authStatus, authLoading, handleLoginSuccess } = useAuthStatus();
  const {
    filters,
    createFilter,
    updateFilter,
    deleteFilter,
    toggleFilter,
  } = useFilters();

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

  useEffect(() => {
    if (!routeFilterId || routeFilterId === "new") {
      setSelectedFilterId("new");
      return;
    }

    setSelectedFilterId(routeFilterId);
  }, [routeFilterId]);

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

    if (!selectedFilter) {
      return;
    }

    setName(selectedFilter.name);
    setAutoLocateUnreadNearRead(selectedFilter.autoLocateUnreadNearRead);
    setConditions(toDraftConditions(selectedFilter.conditions));
    setError("");
    setPreviewMessages([]);
    setPreviewSummary(null);
    setBackfillSummary("");
  }, [selectedFilterId, selectedFilter]);

  const updateCondition = (id: string, updater: (condition: DraftCondition) => DraftCondition) => {
    setConditions((current) => current.map((condition) => (condition.id === id ? updater(condition) : condition)));
  };

  const addCondition = () => {
    setConditions((current) => [...current, createDraftCondition()]);
  };

  const removeCondition = (id: string) => {
    setConditions((current) => (current.length === 1 ? [createDraftCondition()] : current.filter((condition) => condition.id !== id)));
  };

  const appendKeywordValues = (id: string) => {
    updateCondition(id, (condition) => {
      const nextValues = condition.input
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

      if (nextValues.length === 0) {
        return condition;
      }

      return {
        ...condition,
        values: Array.from(new Set([...condition.values, ...nextValues])),
        input: "",
      };
    });
  };

  const buildPayload = () => {
    const normalized = normalizeConditions(conditions);
    const keywordConditions = normalized.filter((condition) => condition.type === "keyword");
    const chatValues = Array.from(
      new Set(normalized.filter((condition) => condition.type === "chat").flatMap((condition) => condition.values)),
    );
    const mergedConditions = chatValues.length > 0
      ? [...keywordConditions, { type: "chat" as const, values: chatValues }]
      : keywordConditions;

    if (!name.trim()) {
      throw new Error("过滤器名称不能为空");
    }
    if (mergedConditions.length === 0) {
      throw new Error("至少添加一个有效条件");
    }
    return {
      name: name.trim(),
      conditions: mergedConditions,
      autoLocateUnreadNearRead,
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      const payload = buildPayload();
      const saved = selectedFilter ? await updateFilter(selectedFilter.id, payload) : await createFilter(payload);
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
    if (!selectedFilter) {
      return;
    }

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


  const renderConditionEditor = (condition: DraftCondition) => {
    const typeLabel = conditionTypeOptions.find((option) => option.value === condition.type)?.label ?? "条件";

    return (
      <Card key={condition.id} className="border border-border/70 bg-background/60" size="sm">
        <CardContent className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs text-muted-foreground">条件类型</label>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCondition(condition.id)}>
                <Trash2 />
              </Button>
            </div>
            <Select
              value={condition.type}
              onValueChange={(value) =>
                updateCondition(condition.id, () => ({
                  ...createDraftCondition(value as FilterConditionType),
                  id: condition.id,
                }))
              }
            >
              <SelectTrigger className="w-full justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {conditionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {condition.type === "keyword" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">关键词值</label>
              <div className="flex gap-2">
                <Input
                  placeholder="输入关键词，多个请用逗号分隔"
                  value={condition.input}
                  onChange={(event) => updateCondition(condition.id, (current) => ({ ...current, input: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      appendKeywordValues(condition.id);
                    }
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => appendKeywordValues(condition.id)}>
                  添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {condition.values.length === 0 ? (
                  <span className="text-xs text-muted-foreground">尚未添加{typeLabel}</span>
                ) : (
                  condition.values.map((value) => (
                    <Badge key={value} variant="secondary" className="gap-1">
                      {value}
                      <button
                        type="button"
                        className="text-xs opacity-70 hover:opacity-100"
                        onClick={() => updateCondition(condition.id, (current) => ({ ...current, values: current.values.filter((item) => item !== value) }))}
                      >
                        ×
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">选择{typeLabel}</label>
              <JoinedChatPicker
                label="已选"
                selected={condition.values}
                searchPlaceholder={`搜索${typeLabel}名称或 ID`}
                emptyText={`没有可选${typeLabel}`}
                onSelectionChange={(values) => updateCondition(condition.id, (current) => ({ ...current, values }))}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
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
              <Card className="border border-border/70 bg-card/70" size="sm">
                <CardHeader className="pt-2 pb-2">
                  <CardTitle>{selectedFilter ? `编辑过滤器：${selectedFilter.name}` : "新建过滤器"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</div>}

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">过滤器名称</label>
                    <Input placeholder="例如：BTC 讨论 / Solana 频道观察" value={name} onChange={(event) => setName(event.target.value)} />
                  </div>

                  <label className="flex items-center gap-2 text-xs sm:text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={autoLocateUnreadNearRead}
                      onChange={(event) => setAutoLocateUnreadNearRead(event.target.checked)}
                    />
                    自动定位到最近已读相邻的未读消息
                  </label>

                  <div className="space-y-1.5">{conditions.map((condition) => renderConditionEditor(condition))}</div>

                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={addCondition}>
                    <Plus data-icon="inline-start" />
                    增加一个条件
                  </Button>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      {selectedFilter ? "保存修改" : "创建过滤器"}
                    </Button>
                    {selectedFilter && (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => void toggleFilter(selectedFilter.id)}>
                          {selectedFilter.enabled ? "停用过滤器" : "启用过滤器"}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                          <Trash2 data-icon="inline-start" />
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2.5">
              <Card className="border border-border/70 bg-card/70" size="sm">
                <CardHeader className="pt-2 pb-2">
                  <CardTitle>历史预览与回拉</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">每个会话扫描深度（条数）</label>
                    <Input
                      value={previewLimit}
                      onChange={(event) => setPreviewLimit(event.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button type="button" size="sm" onClick={handlePreview} disabled={previewLoading}>
                      {previewLoading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : "预览历史消息"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleBackfill} disabled={backfillLoading || !selectedFilter}>
                      {backfillLoading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : "主动拉取并过滤"}
                    </Button>
                  </div>

                  {previewSummary && (
                    <div className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                      已扫描 {previewSummary.scannedChats} 个会话，预览到 {previewSummary.total} 条命中消息。
                    </div>
                  )}

                  {backfillSummary && (
                    <div className="rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">
                      {backfillSummary}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {previewMessages.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-background/60 px-3 py-4 text-center text-sm text-muted-foreground">
                        暂无预览结果
                      </div>
                    ) : (
                      previewMessages.map((message) => (
                        <div key={`${message.chatId}-${message.id}`} className="rounded-xl border border-border/70 bg-background/65 p-2.5">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{message.chatTitle}</span>
                            <span>·</span>
                            <span>{message.senderName || "Unknown"}</span>
                            {message.matchedKeyword && <Badge variant="secondary">命中 {message.matchedKeyword}</Badge>}
                            <Badge variant={message.inDatabase ? "secondary" : "outline"} className="ml-auto">
                              {message.inDatabase ? "已入库" : "未入库"}
                            </Badge>
                          </div>
                          <p className="text-sm leading-5 text-foreground/95">{message.content}</p>
                          {message.telegramLink && (
                            <a href={message.telegramLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-primary underline-offset-4 hover:underline">
                              打开原消息
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
