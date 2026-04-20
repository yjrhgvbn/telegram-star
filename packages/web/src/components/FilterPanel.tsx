import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectPicker } from "@/components/MultiSelectPicker";
import { cn } from "@/lib/utils";
import type { Filter, FilterCondition, JoinedChat } from "../types";

interface Props {
  filters: Filter[];
  chats: JoinedChat[];
  loading: boolean;
  chatsLoading: boolean;
  onCreateFilter: (data: { name: string; conditions: FilterCondition[] }) => Promise<void>;
  onDeleteFilter: (id: number) => Promise<void>;
  onToggleFilter: (id: number) => Promise<void>;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
}

export function FilterPanel({
  filters,
  chats,
  loading,
  chatsLoading,
  onCreateFilter,
  onDeleteFilter,
  onToggleFilter,
  selectedFilterId,
  onSelectFilter,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const groups = chats.filter((chat) => chat.type === "group");
  const channels = chats.filter((chat) => chat.type === "channel");

  const addKeywords = () => {
    const next = keywordInput
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (next.length === 0) {
      return;
    }

    setKeywords((prev) => {
      const merged = new Set([...prev, ...next]);
      return Array.from(merged);
    });
    setKeywordInput("");
  };

  const removeKeyword = (keyword: string) => {
    setKeywords((prev) => prev.filter((item) => item !== keyword));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const conditions: FilterCondition[] = [];
    if (keywords.length > 0) {
      conditions.push({ type: "keyword", values: keywords });
    }
    if (selectedGroups.length > 0) {
      conditions.push({ type: "group", values: selectedGroups });
    }
    if (selectedChannels.length > 0) {
      conditions.push({ type: "channel", values: selectedChannels });
    }

    if (!name.trim()) {
      setError("过滤器名称不能为空");
      return;
    }

    if (conditions.length === 0) {
      setError("至少添加一种条件（关键词、群组、频道）");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await onCreateFilter({ name: name.trim(), conditions });
      setName("");
      setKeywordInput("");
      setKeywords([]);
      setGroupPickerOpen(false);
      setChannelPickerOpen(false);
      setSelectedGroups([]);
      setSelectedChannels([]);
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const getTypeIcon = (t: string) => {
    switch (t) {
      case "keyword": return "🔑";
      case "group": return "👥";
      case "channel": return "📢";
      default: return "📌";
    }
  };

  const getTypeBadge = (t: string) => {
    switch (t) {
      case "keyword": return "bg-amber-500/15 text-amber-700";
      case "group": return "bg-sky-500/15 text-sky-700";
      case "channel": return "bg-indigo-500/15 text-indigo-700";
      default: return "";
    }
  };

  const getConditionSummary = (conditions: FilterCondition[]) => {
    if (!conditions.length) return "无条件";
    return conditions
      .map((condition) => {
        if (condition.type === "keyword") return `关键词 ${condition.values.length}`;
        if (condition.type === "group") return `群组 ${condition.values.length}`;
        return `频道 ${condition.values.length}`;
      })
      .join(" · ");
  };

  const getFilterIcon = (conditions: FilterCondition[]) => {
    if (conditions.some((condition) => condition.type === "keyword")) return "🔑";
    if (conditions.some((condition) => condition.type === "group")) return "👥";
    if (conditions.some((condition) => condition.type === "channel")) return "📢";
    return "📌";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span>🎯</span>
          <span>过滤器</span>
        </h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "收起" : "新建"}
        </Button>
      </div>
      <Separator />

      {showForm && (
        <form className="animate-in fade-in zoom-in-95 space-y-3 border-b border-border/70 bg-background/60 px-4 py-4" onSubmit={handleSubmit}>
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <div className="rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-xs text-primary">
            条件组合关系固定为 AND：消息需同时满足所有已添加条件。
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">名称</label>
            <Input
              placeholder="例如：BTC 讨论"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">关键词（可多选）</label>
            <div className="flex gap-2">
              <Input
                placeholder="输入关键词，多个请用逗号分隔"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeywords();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addKeywords}>添加</Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="gap-1">
                    {keyword}
                    <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => removeKeyword(keyword)}>
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">群组（已加入，可多选）</label>
            <MultiSelectPicker
              label="已选"
              items={groups}
              selected={selectedGroups}
              searchPlaceholder="搜索群组名称或 ID"
              emptyText="没有可选群组"
              loading={chatsLoading}
              open={groupPickerOpen}
              onOpenChange={setGroupPickerOpen}
              onSelectionChange={setSelectedGroups}
              searchFields={["title", "id"]}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">频道（已加入，可多选）</label>
            <MultiSelectPicker
              label="已选"
              items={channels}
              selected={selectedChannels}
              searchPlaceholder="搜索频道名称或 ID"
              emptyText="没有可选频道"
              loading={chatsLoading}
              open={channelPickerOpen}
              onOpenChange={setChannelPickerOpen}
              onSelectionChange={setSelectedChannels}
              searchFields={["title", "id"]}
            />
          </div>

          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? "创建中..." : "创建过滤器"}
          </Button>
        </form>
      )}

      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <div className="space-y-1.5">
        {/* "All" option */}
          <button
            className={cn(
              "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition",
              selectedFilterId === "" ? "border-primary/30 bg-primary/10 shadow-sm" : "border-transparent hover:bg-accent"
            )}
            onClick={() => onSelectFilter("")}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">📋</span>
              <span className="truncate text-sm font-medium">全部消息</span>
            </div>
          </button>

          {loading ? (
            <div className="space-y-2 px-1 py-3">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          ) : filters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-8 text-center text-sm text-muted-foreground">
              <p>暂无过滤器</p>
              <p className="mt-1 text-xs">点击上方按钮创建</p>
            </div>
          ) : (
            filters.map((filter) => (
              <div
                key={filter.id}
                className={cn(
                  "group flex items-start gap-2 rounded-xl border px-2.5 py-2.5 transition",
                  selectedFilterId === String(filter.id) ? "border-primary/30 bg-primary/10 shadow-sm" : "border-transparent hover:bg-accent/70",
                  !filter.enabled && "opacity-55"
                )}
              >
                <button
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  onClick={() => onSelectFilter(String(filter.id))}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background/80 ring-1 ring-border/70">
                    {getFilterIcon(filter.conditions)}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold leading-none">{filter.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{getConditionSummary(filter.conditions)}</p>
                    <div className="flex flex-wrap gap-1">
                      {filter.conditions.map((condition, index) => (
                        <Badge
                          key={`${filter.id}-${condition.type}-${index}`}
                          variant="outline"
                          className={cn("max-w-full rounded-md px-1.5 py-0 text-[11px] font-medium", getTypeBadge(condition.type))}
                        >
                          {getTypeIcon(condition.type)} {condition.values.length}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </button>

                <div className="mt-0.5 flex shrink-0 items-center gap-1 opacity-65 transition group-hover:opacity-100">
                  <Button
                    variant={filter.enabled ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => onToggleFilter(filter.id)}
                    title={filter.enabled ? "禁用" : "启用"}
                  >
                    {filter.enabled ? "🟢" : "⚪"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDeleteFilter(filter.id)}
                    title="删除"
                    className="hover:text-destructive"
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
