import { useMemo, useState } from "react";
import { Inbox, KeyRound, ListFilter, MessageCircle, Plus, Regex, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { selectableItemVariants } from "@/components/ui/selectable-item";
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-0">
      <div className="shrink-0 lg:border-b lg:border-border lg:p-3">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索消息分组"
          aria-label="搜索消息分组"
          clearLabel="清空消息分组搜索"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 pb-2 lg:p-2">
          <section className="flex flex-col gap-2 lg:gap-1">
            <p className="px-2 pt-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Views
            </p>
            <button
              type="button"
              aria-current={selectedFilterId === "" ? "true" : undefined}
              className={cn(
                "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left lg:rounded-lg",
                selectableItemVariants({
                  kind: "current",
                  selected: selectedFilterId === "",
                  surface: "responsive",
                }),
              )}
              onClick={() => onSelectFilter("")}
            >
              <span
                data-slot="selectable-item-icon"
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"
              >
                <Inbox className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">全部消息</span>
                <span className="block truncate text-[11px] text-muted-foreground">所有已追踪内容</span>
              </span>
            </button>
          </section>

          <section className="flex flex-col gap-2 lg:gap-1">
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
              <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-center shadow-sm lg:rounded-lg lg:bg-transparent lg:shadow-none">
                <p className="text-sm text-muted-foreground">{query ? "没有匹配分组" : "暂无过滤器"}</p>
              </div>
            ) : (
              visibleFilters.map((filter) => {
                const FilterIcon = getFilterIcon(filter.conditions);
                const active = selectedFilterId === String(filter.id);

                return (
                  <div
                    key={filter.id}
                    className={cn(
                      "group relative flex w-full items-start gap-1 rounded-xl px-2.5 py-2 lg:rounded-lg",
                      selectableItemVariants({
                        kind: "current",
                        selected: active,
                        surface: "responsive",
                      }),
                      !filter.enabled && "opacity-60",
                    )}
                  >
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      onClick={() => onSelectFilter(String(filter.id))}
                    >
                      <span
                        data-slot="selectable-item-icon"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"
                      >
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

      <div className="shrink-0 lg:border-t lg:border-border lg:p-2.5">
        <Button type="button" className="h-11 w-full lg:h-9" onClick={() => navigate("/filters/new")}>
          <Plus data-icon="inline-start" />
          新建过滤器
        </Button>
      </div>
    </div>
  );
}
