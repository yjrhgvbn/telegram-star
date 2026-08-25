import { useMemo, useState } from "react";
import {
  ChevronRight,
  CircleCheck,
  CirclePause,
  Filter,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Filter as FilterModel, JoinedChat } from "@/types";
import { countFilterConditionGroups, describeFilterRule } from "../utils";

interface FilterLibraryProps {
  filters: FilterModel[];
  chats: JoinedChat[];
  loading: boolean;
  onCreate: () => void;
  onSelect: (id: number) => void;
}

export function FilterLibrary({
  filters,
  chats,
  loading,
  onCreate,
  onSelect,
}: FilterLibraryProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFilters = useMemo(
    () =>
      normalizedQuery
        ? filters.filter((filter) => {
            const summary = describeFilterRule(filter.conditions, chats);
            return `${filter.name} ${summary}`.toLowerCase().includes(normalizedQuery);
          })
        : filters,
    [chats, filters, normalizedQuery],
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 px-3 py-3 sm:px-5 sm:py-5">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索规则名称、会话或关键词"
          aria-label="搜索规则"
          clearLabel="清空规则搜索"
        />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--workspace-panel-shadow)]">
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <span className="text-sm font-semibold">全部规则</span>
            <Badge variant="outline">{visibleFilters.length}</Badge>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : visibleFilters.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                <Filter className="size-5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">
                {filters.length === 0 ? "还没有规则" : "没有找到匹配的规则"}
              </h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                {filters.length === 0
                  ? "从消息来源和关键词开始，创建第一条可以直接验证的规则。"
                  : "尝试搜索其他名称、会话或关键词。"}
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {visibleFilters.map((filter) => {
                const valueCount = filter.conditions.reduce(
                  (count, condition) => count + condition.values.length,
                  0,
                );

                return (
                  <button
                    key={filter.id}
                    type="button"
                    className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/55 sm:px-4"
                    onClick={() => onSelect(filter.id)}
                  >
                    <span
                      className={
                        filter.enabled
                          ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"
                          : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                      }
                    >
                      {filter.enabled ? <CircleCheck className="size-4" /> : <CirclePause className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{filter.name}</span>
                        <Badge variant={filter.enabled ? "secondary" : "outline"}>
                          {filter.enabled ? "监听中" : "已停用"}
                        </Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {describeFilterRule(filter.conditions, chats)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-[11px] leading-4 text-muted-foreground sm:block">
                      {countFilterConditionGroups(filter.conditions)} 个条件组
                      <br />
                      {valueCount} 个取值 · {filter.forwardTargetIds.length} 个通道
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="flex shrink-0 justify-end">
          <Button type="button" className="h-11 w-full sm:w-auto sm:min-w-44" onClick={onCreate}>
            <Plus data-icon="inline-start" />
            新建规则
          </Button>
        </footer>
      </div>
    </main>
  );
}
