import { Plus, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Filter, FilterCondition } from "../types";

interface Props {
  filters: Filter[];
  loading: boolean;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
}

export function FilterPanel({
  filters,
  loading,
  selectedFilterId,
  onSelectFilter,
}: Props) {
  const navigate = useNavigate();

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "keyword":
        return "🔑";
      case "chat":
      case "group":
      case "channel":
        return "💬";
      default:
        return "📌";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "keyword":
        return "bg-amber-500/15 text-amber-700";
      case "chat":
      case "group":
      case "channel":
        return "bg-sky-500/15 text-sky-700";
      default:
        return "";
    }
  };

  const getConditionSummary = (conditions: FilterCondition[]) => {
    if (!conditions.length) {
      return "无条件";
    }

    return conditions
      .map((condition) => {
        if (condition.type === "keyword") return `关键词 ${condition.values.length}`;
        return `会话 ${condition.values.length}`;
      })
      .join(" · ");
  };

  const getFilterIcon = (conditions: FilterCondition[]) => {
    if (conditions.some((condition) => condition.type === "keyword")) return "🔑";
    if (conditions.some((condition) => condition.type === "chat")) return "💬";
    return "📌";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span>🎯</span>
          <span>过滤器</span>
        </h2>
        <Button size="sm" variant="outline" onClick={() => navigate("/filters/new")}>
          <Plus data-icon="inline-start" />
          新建
        </Button>
      </div>
      <Separator />

      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <div className="space-y-1.5">
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
              <p className="mt-1 text-xs">前往维护页创建并管理</p>
            </div>
          ) : (
            filters.map((filter) => (
              <div
                key={filter.id}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2.5 transition",
                  selectedFilterId === String(filter.id) ? "border-primary/30 bg-primary/10 shadow-sm" : "border-transparent hover:bg-accent/70",
                  !filter.enabled && "opacity-55"
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  onClick={() => onSelectFilter(String(filter.id))}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background/80 ring-1 ring-border/70">
                    {getFilterIcon(filter.conditions)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold leading-none">{filter.name}</p>
                      {!filter.enabled && <Badge variant="outline">已停用</Badge>}
                    </div>
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
                <div className="pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={`配置过滤器 ${filter.name}`}
                    onClick={() => {
                      navigate(`/filters/${filter.id}`);
                    }}
                  >
                    <Settings2 />
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
