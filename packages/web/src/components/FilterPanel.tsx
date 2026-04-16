import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Filter } from "../types";

interface Props {
  filters: Filter[];
  loading: boolean;
  onCreateFilter: (data: { name: string; type: string; value: string }) => Promise<void>;
  onDeleteFilter: (id: number) => Promise<void>;
  onToggleFilter: (id: number) => Promise<void>;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
}

export function FilterPanel({
  filters,
  loading,
  onCreateFilter,
  onDeleteFilter,
  onToggleFilter,
  selectedFilterId,
  onSelectFilter,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("keyword");
  const [value, setValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !value.trim()) {
      setError("名称和值不能为空");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await onCreateFilter({ name: name.trim(), type, value: value.trim() });
      setName("");
      setValue("");
      setType("keyword");
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
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">名称</label>
            <Input
              placeholder="例如：BTC 讨论"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">类型</label>
            <Select value={type} onValueChange={(nextValue) => setType(nextValue ?? "keyword")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择过滤器类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="keyword">🔑 关键词</SelectItem>
                  <SelectItem value="group">👥 群组</SelectItem>
                  <SelectItem value="channel">📢 频道</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {type === "keyword" ? "关键词" : type === "group" ? "群组名称/ID" : "频道名称/ID"}
            </label>
            <Input
              placeholder={
                type === "keyword" ? "例如：bitcoin" :
                type === "group" ? "群组名或 Chat ID" :
                "频道名或 Chat ID"
              }
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
              selectedFilterId === "" ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-accent"
            )}
            onClick={() => onSelectFilter("")}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span>📋</span>
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
                  "group flex items-center gap-2 rounded-lg border px-2 py-2 transition",
                  selectedFilterId === String(filter.id) ? "border-primary/30 bg-primary/10" : "border-transparent hover:bg-accent",
                  !filter.enabled && "opacity-55"
                )}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => onSelectFilter(String(filter.id))}
                >
                  <span>{getTypeIcon(filter.type)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{filter.name}</p>
                    <Badge variant="outline" className={cn("mt-1 max-w-full truncate", getTypeBadge(filter.type))}>
                      {filter.value}
                    </Badge>
                  </div>
                </button>

                <div className="flex items-center gap-1 opacity-60 transition group-hover:opacity-100">
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
