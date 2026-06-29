import { Inbox, KeyRound, ListFilter, MessageCircle, Plus, Settings2, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Filter, FilterCondition } from "@/types";

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
        return KeyRound;
      case "chat":
      case "group":
      case "channel":
        return MessageCircle;
      default:
        return ListFilter;
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
    if (conditions.some((condition) => condition.type === "keyword")) return KeyRound;
    if (conditions.some((condition) => condition.type === "chat")) return MessageCircle;
    return ListFilter;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-16 items-center justify-between px-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4 text-primary" />
          <span>过滤器</span>
        </h2>
        <Button size="sm" variant="ghost" className="bg-card/72 shadow-sm ring-1 ring-border/30" onClick={() => navigate("/filters/new")}>
          <Plus data-icon="inline-start" />
          新建
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="space-y-1">
          <button
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition",
              selectedFilterId === "" ? "bg-primary/9 shadow-sm" : "hover:bg-background/70"
            )}
            onClick={() => onSelectFilter("")}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Inbox className="size-4" />
              </span>
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
            <div className="rounded-lg bg-card/46 px-3 py-8 text-center text-sm text-muted-foreground ring-1 ring-border/25">
              <p>暂无过滤器</p>
              <p className="mt-1 text-xs">前往维护页创建并管理</p>
            </div>
          ) : (
            filters.map((filter) => {
              const FilterIcon = getFilterIcon(filter.conditions);

              return (
                <div
                  key={filter.id}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg px-2.5 py-2.5 transition",
                    selectedFilterId === String(filter.id) ? "bg-primary/9 shadow-sm" : "hover:bg-background/70",
                    !filter.enabled && "opacity-55"
                  )}
                >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  onClick={() => onSelectFilter(String(filter.id))}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-background/78 text-muted-foreground shadow-sm ring-1 ring-border/30">
                    <FilterIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold leading-none">{filter.name}</p>
                      {!filter.enabled && <Badge variant="outline">已停用</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{getConditionSummary(filter.conditions)}</p>
                    <div className="flex flex-wrap gap-1">
                      {filter.conditions.map((condition, index) => (
                        (() => {
                          const TypeIcon = getTypeIcon(condition.type);

                          return (
                            <Badge
                              key={`${filter.id}-${condition.type}-${index}`}
                              variant="outline"
                              className={cn("max-w-full rounded-md border-transparent px-1.5 py-0 text-[11px] font-medium", getTypeBadge(condition.type))}
                            >
                              <TypeIcon className="size-3" /> {condition.values.length}
                            </Badge>
                          );
                        })()
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
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
