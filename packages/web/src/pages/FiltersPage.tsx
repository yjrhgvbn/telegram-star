import { useEffect, useMemo, useState } from "react";
import { Eye, LoaderCircle, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MultiSelectPicker } from "@/components/MultiSelectPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useFilters } from "@/hooks/useFilters";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";
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
  pickerOpen: boolean;
};

const conditionTypeOptions: Array<{ value: FilterConditionType; label: string }> = [
  { value: "keyword", label: "关键词" },
  { value: "group", label: "群组" },
  { value: "channel", label: "频道" },
];

function createDraftCondition(type: FilterConditionType = "keyword"): DraftCondition {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    values: [],
    input: "",
    pickerOpen: false,
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
    pickerOpen: false,
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
    refresh,
    refreshChats,
  } = useFilters();

  const [selectedFilterId, setSelectedFilterId] = useState<string>("new");
  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<DraftCondition[]>([createDraftCondition()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<HistoricalFilterPreviewMessage[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{ scannedChats: number; total: number } | null>(null);
  const [previewLimit, setPreviewLimit] = useState("50");
  const [historyChatPickerOpen, setHistoryChatPickerOpen] = useState(false);
  const [historyChatIds, setHistoryChatIds] = useState<string[]>([]);
  const [historySince, setHistorySince] = useState("");
  const [historyUntil, setHistoryUntil] = useState("");
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillSummary, setBackfillSummary] = useState<string>("");

  const groups = useMemo(() => chats.filter((chat) => chat.type === "group"), [chats]);
  const channels = useMemo(() => chats.filter((chat) => chat.type === "channel"), [chats]);
  const selectedFilter = filters.find((filter) => String(filter.id) === selectedFilterId) ?? null;

  useEffect(() => {
    if (selectedFilterId === "new") {
      setName("");
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

  const toIsoOrUndefined = (datetimeLocal: string): string | undefined => {
    if (!datetimeLocal) {
      return undefined;
    }

    // datetime-local 是本地时间，统一转成 ISO 后再交给后端，避免时区解释不一致。
    const ts = Date.parse(datetimeLocal);
    if (Number.isNaN(ts)) {
      throw new Error("时间格式无效，请重新选择时间");
    }

    return new Date(ts).toISOString();
  };

  const buildHistoryScope = () => {
    const since = toIsoOrUndefined(historySince);
    const until = toIsoOrUndefined(historyUntil);
    if (since && until && Date.parse(since) > Date.parse(until)) {
      throw new Error("开始时间不能晚于结束时间");
    }

    // 预览与回拉都复用同一份范围参数，确保用户看到的预览和实际写入结果一致。
    return {
      perChatLimit: Number(previewLimit) || 50,
      chatIds: historyChatIds,
      since,
      until,
    };
  };

  const buildPayload = () => {
    const normalized = normalizeConditions(conditions);
    if (!name.trim()) {
      throw new Error("过滤器名称不能为空");
    }
    if (normalized.length === 0) {
      throw new Error("至少添加一个有效条件");
    }
    return {
      name: name.trim(),
      conditions: normalized,
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
      const scope = buildHistoryScope();
      const result = await api.filters.preview({
        conditions: payload.conditions,
        perChatLimit: scope.perChatLimit,
        totalLimit: 30,
        chatIds: scope.chatIds,
        since: scope.since,
        until: scope.until,
      });
      setPreviewMessages(result.messages);
      setPreviewSummary({ scannedChats: result.scannedChats, total: result.total });
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
      const scope = buildHistoryScope();
      const result = await backfillFilter(selectedFilter.id, {
        perChatLimit: scope.perChatLimit,
        chatIds: scope.chatIds,
        since: scope.since,
        until: scope.until,
      });
      setBackfillSummary(`扫描 ${result.scannedChats} 个会话，命中 ${result.matchedCount} 条，新增 ${result.savedCount} 条，跳过已存在 ${result.skippedExistingCount} 条`);
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

  const renderConditionEditor = (condition: DraftCondition, index: number) => {
    const typeLabel = conditionTypeOptions.find((option) => option.value === condition.type)?.label ?? "条件";
    const items = condition.type === "group" ? groups : channels;

    return (
      <Card key={condition.id} className="border border-border/70 bg-background/60" size="sm">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>条件 {index + 1}</CardTitle>
              <CardDescription>当前条件与其他条件之间固定为 AND 关系</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeCondition(condition.id)}>
              <Trash2 />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">条件类型</label>
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
                <Button type="button" variant="secondary" onClick={() => appendKeywordValues(condition.id)}>
                  添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {condition.values.length === 0 ? (
                  <span className="text-xs text-muted-foreground">尚未添加 {typeLabel}</span>
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
              <label className="text-xs text-muted-foreground">选择 {typeLabel}</label>
              <MultiSelectPicker
                label="已选"
                items={items}
                selected={condition.values}
                searchPlaceholder={`搜索${typeLabel}名称或 ID`}
                emptyText={`没有可选${typeLabel}`}
                loading={chatsLoading}
                open={condition.pickerOpen}
                onOpenChange={(open) => updateCondition(condition.id, (current) => ({ ...current, pickerOpen: open }))}
                onSelectionChange={(values) => updateCondition(condition.id, (current) => ({ ...current, values }))}
                searchFields={["title", "id"]}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <AppShell
      activeTab="filters"
      authStatus={authStatus}
      authLoading={authLoading}
      onLoginSuccess={handleLoginSuccess}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full border-r border-border/60 bg-card/80 lg:w-[320px]">
          <div className="border-b border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">过滤器列表</p>
                <p className="mt-1 text-xs text-muted-foreground">创建、编辑、删除和主动拉取历史消息</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => { void refresh(); void refreshChats(); }}>
                <RefreshCw data-icon="inline-start" className={cn((loading || chatsLoading) && "animate-spin")} />
                刷新
              </Button>
            </div>
          </div>

          <div className="space-y-2 p-2">
            <Button type="button" className="w-full justify-start" onClick={() => setSelectedFilterId("new")}>
              <Plus data-icon="inline-start" />
              新建过滤器
            </Button>

            <div className="max-h-[calc(100vh-220px)] space-y-1 overflow-auto pr-1">
              {filters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition",
                    selectedFilterId === String(filter.id)
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/50 bg-background/70 hover:bg-muted/60"
                  )}
                  onClick={() => setSelectedFilterId(String(filter.id))}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{filter.name}</p>
                    <Badge variant={filter.enabled ? "secondary" : "outline"}>{filter.enabled ? "启用中" : "已停用"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{filter.conditions.length} 个条件</p>
                </button>
              ))}

              {filters.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background/60 px-3 py-8 text-center text-sm text-muted-foreground">
                  暂无过滤器
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="space-y-4">
              <Card className="border border-border/70 bg-card/70">
                <CardHeader>
                  <CardTitle>{selectedFilter ? `编辑过滤器：${selectedFilter.name}` : "新建过滤器"}</CardTitle>
                  <CardDescription>你可以自由增加或删除条件，系统会将所有条件按 AND 关系组合匹配。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">过滤器名称</label>
                    <Input placeholder="例如：BTC 讨论 / Solana 频道观察" value={name} onChange={(event) => setName(event.target.value)} />
                  </div>

                  <div className="space-y-3">{conditions.map(renderConditionEditor)}</div>

                  <Button type="button" variant="outline" className="w-full" onClick={addCondition}>
                    <Plus data-icon="inline-start" />
                    增加一个条件
                  </Button>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button type="button" onClick={handleSave} disabled={saving}>
                      {saving ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      {selectedFilter ? "保存修改" : "创建过滤器"}
                    </Button>
                    {selectedFilter && (
                      <>
                        <Button type="button" variant="outline" onClick={() => void toggleFilter(selectedFilter.id)}>
                          {selectedFilter.enabled ? "停用过滤器" : "启用过滤器"}
                        </Button>
                        <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
                          <Trash2 data-icon="inline-start" />
                          删除
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border border-border/70 bg-card/70">
                <CardHeader>
                  <CardTitle>历史消息预览与回拉</CardTitle>
                  <CardDescription>先按当前条件预览部分历史消息，再决定是否把命中内容写入消息库。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">每个会话扫描深度（分段）</label>
                    <Input value={previewLimit} onChange={(event) => setPreviewLimit(event.target.value.replace(/[^0-9]/g, ""))} />
                    <p className="text-[11px] text-muted-foreground">如果需要更早消息，可适当调大，例如 1000 或 2000。</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">指定会话（可选）</label>
                    <MultiSelectPicker
                      label="已选"
                      items={chats}
                      selected={historyChatIds}
                      searchPlaceholder="搜索会话名称或 ID"
                      emptyText="没有可选会话"
                      loading={chatsLoading}
                      open={historyChatPickerOpen}
                      onOpenChange={setHistoryChatPickerOpen}
                      onSelectionChange={setHistoryChatIds}
                      searchFields={["title", "id"]}
                    />
                    <p className="text-[11px] text-muted-foreground">不选择时默认扫描所有可访问会话。</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">开始时间（可选）</label>
                      <Input type="datetime-local" value={historySince} onChange={(event) => setHistorySince(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">结束时间（可选）</label>
                      <Input type="datetime-local" value={historyUntil} onChange={(event) => setHistoryUntil(event.target.value)} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handlePreview} disabled={previewLoading}>
                      {previewLoading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
                      预览历史消息
                    </Button>
                    <Button type="button" onClick={handleBackfill} disabled={backfillLoading || !selectedFilter}>
                      {backfillLoading ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                      主动拉取并过滤
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

                  <div className="space-y-3">
                    {previewMessages.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                        暂无预览结果。可先点击“预览历史消息”。
                      </div>
                    ) : (
                      previewMessages.map((message) => (
                        <div key={`${message.chatId}-${message.id}`} className="rounded-xl border border-border/70 bg-background/65 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{message.chatType === "group" ? "群组" : "频道"}</Badge>
                            <span>{message.chatTitle}</span>
                            <span>·</span>
                            <span>{message.senderName || "Unknown"}</span>
                            {message.matchedKeyword && <Badge variant="secondary">命中 {message.matchedKeyword}</Badge>}
                            <Badge variant={message.inDatabase ? "secondary" : "outline"} className="ml-auto">
                              {message.inDatabase ? "已入库" : "未入库"}
                            </Badge>
                          </div>
                          <p className="text-sm leading-6 text-foreground/95">{message.content}</p>
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
