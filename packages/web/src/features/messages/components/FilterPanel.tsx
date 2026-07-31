import { useMemo, useState } from "react";
import { Inbox, KeyRound, ListFilter, MessageCircle, Plus, Regex, Search, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function getConditionSummary(conditions: FilterCondition[]) {
  if (!conditions.length) return "无有效条件";

  return conditions
    .map((condition) => {
      if (condition.type === "keyword") return `关键词 ${condition.values.length}`;
      if (condition.type === "regex") return `正则 ${condition.values.length}`;
      return `会话 ${condition.values.length}`;
    })
    .join(" · ");
}

function getFilterIcon(conditions: FilterCondition[]) {
  if (conditions.some((condition) => condition.type === "keyword")) return KeyRound;
  if (conditions.some((condition) => condition.type === "regex")) return Regex;
  if (conditions.some((condition) => condition.type === "chat")) return MessageCircle;
  return ListFilter;
}

export function FilterPanel({
  filters,
  loading,
  selectedFilterId,
  onSelectFilter,
}: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const visibleFilters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return filters;

    return filters.filter((filter) => {
      const conditionText = filter.conditions.flatMap((condition) => condition.values).join(" ");
      return `${filter.name} ${conditionText}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [filters, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
        <div>
          <h2 className="text-sm font-semibold">消息分组</h2>
          <p className="text-xs text-muted-foreground">{filters.length} 个过滤器</p>
        </div>
        <Button size="icon-sm" variant="outline" onClick={() => navigate("/filters/new")} aria-label="新建过滤器">
          <Plus />
        </Button>
      </div>

      <div className="border-b border-border px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="查找分组"
            className="h-8 bg-card pl-8"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-2">
          <section className="flex flex-col gap-1">
            <p className="px-2 pt-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Views
            </p>
            <button
              type="button"
              className={cn(
                "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                selectedFilterId === ""
                  ? "bg-accent text-foreground ring-1 ring-primary/12"
                  : "text-muted-foreground hover:bg-muted/72 hover:text-foreground",
              )}
              onClick={() => onSelectFilter("")}
            >
              <span
                className={cn(
                  "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                  selectedFilterId === "" && "bg-primary",
                )}
              />
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <Inbox className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">全部消息</span>
                <span className="block truncate text-[11px] text-muted-foreground">所有已追踪内容</span>
              </span>
            </button>
          </section>

          <section className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Filters
              </p>
              <span className="text-[11px] text-muted-foreground">{visibleFilters.length}</span>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2 py-1">
                <Skeleton className="h-13 rounded-lg" />
                <Skeleton className="h-13 rounded-lg" />
                <Skeleton className="h-13 rounded-lg" />
              </div>
            ) : visibleFilters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center">
                <p className="text-sm text-muted-foreground">{query ? "没有匹配分组" : "暂无过滤器"}</p>
                {!query ? (
                  <Button className="mt-2" size="sm" variant="ghost" onClick={() => navigate("/filters/new")}>
                    <Plus data-icon="inline-start" />
                    创建过滤器
                  </Button>
                ) : null}
              </div>
            ) : (
              visibleFilters.map((filter) => {
                const FilterIcon = getFilterIcon(filter.conditions);
                const active = selectedFilterId === String(filter.id);

                return (
                  <div
                    key={filter.id}
                    className={cn(
                      "group relative flex w-full items-start gap-1 rounded-lg px-2.5 py-2 transition-colors",
                      active
                        ? "bg-accent text-foreground ring-1 ring-primary/12"
                        : "text-muted-foreground hover:bg-muted/72 hover:text-foreground",
                      !filter.enabled && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                        active && "bg-primary",
                      )}
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      onClick={() => onSelectFilter(String(filter.id))}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                        <FilterIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">{filter.name}</span>
                          {!filter.enabled ? <Badge variant="outline">停用</Badge> : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {getConditionSummary(filter.conditions)}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                        active && "opacity-100",
                      )}
                      aria-label={`配置过滤器 ${filter.name}`}
                      onClick={() => navigate(`/filters/${filter.id}`)}
                    >
                      <Settings2 />
                    </Button>
                  </div>
                );
              })
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
