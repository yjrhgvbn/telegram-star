import { memo, useDeferredValue, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  Check,
  Inbox,
  ListChecks,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { selectableItemVariants } from "@/components/ui/selectable-item";
import type { Filter, FilterConditionType } from "@/types";
import { cn } from "@/lib/utils";

type RuleScope = "all" | "selected" | "unselected";

const conditionLabels: Record<FilterConditionType, string> = {
  keyword: "关键词",
  chat: "群组",
  regex: "正则",
  script: "代码",
};

const conditionUnits: Record<FilterConditionType, string> = {
  keyword: "个词",
  chat: "个来源",
  regex: "条表达式",
  script: "段代码",
};

export function describeFilterSummary(filter: Filter): string {
  if (filter.conditions.length === 0) return "尚未定义条件";

  const types = Array.from(new Set(filter.conditions.map((condition) => condition.type)));
  const valueCount = filter.conditions.reduce(
    (total, condition) => total + condition.values.length,
    0,
  );

  if (types.length === 1) {
    const type = types[0];
    return `${conditionLabels[type]} · ${valueCount} ${conditionUnits[type]}`;
  }

  return `${types.map((type) => conditionLabels[type]).join(" + ")} · ${valueCount} 条条件`;
}

function buildSearchText(filter: Filter): string {
  return [
    filter.name,
    describeFilterSummary(filter),
    ...filter.conditions.flatMap((condition) => condition.values),
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}

export function SelectedRulesLedger({
  filters,
  totalCount,
  onRemove,
}: {
  filters: Filter[];
  totalCount: number;
  onRemove: (id: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card p-3 shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_4%,transparent)]">
        <div className="min-w-0">
          <div className="text-sm font-semibold">当前订阅</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            从 {totalCount} 条可用规则中选择
          </div>
        </div>
        <strong className="font-mono text-2xl leading-none text-primary">{filters.length}</strong>
      </div>

      {filters.length === 0 ? (
        <div className="flex min-h-36 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/56 px-4 text-center text-sm text-muted-foreground">
          <Inbox className="size-5" />
          还没有选择订阅规则
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1.5 pr-2">
            {filters.map((filter) => (
              <div
                key={filter.id}
                className="flex min-h-12 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_3%,transparent)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{filter.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {describeFilterSummary(filter)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(filter.id)}
                  aria-label={`从已选规则移除 ${filter.name}`}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function MobileSelectedRulesSheet({
  selectedFilters,
  totalCount,
  onRemove,
}: {
  selectedFilters: Filter[];
  totalCount: number;
  onRemove: (id: number) => void;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button type="button" variant="outline" size="sm" className="xl:hidden" />
        }
      >
        <ListChecks data-icon="inline-start" />
        已选 {selectedFilters.length}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-200 data-closed:opacity-0 data-open:opacity-100 xl:hidden" />
        <Dialog.Viewport className="fixed inset-x-0 top-0 bottom-15 z-70 flex items-end justify-center md:bottom-0 xl:hidden">
          <Dialog.Popup className="flex max-h-[min(72dvh,38rem)] w-full min-h-0 flex-col rounded-t-2xl border border-b-0 bg-popover text-popover-foreground shadow-[0_-18px_56px_color-mix(in_oklab,var(--foreground)_18%,transparent)] transition-transform duration-200 data-closed:translate-y-full data-open:translate-y-0 sm:max-w-xl sm:rounded-t-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold">已选规则</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  保存前核对这个通道的订阅关系
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={<Button type="button" variant="ghost" size="icon-sm" />}
                aria-label="关闭已选规则"
              >
                <X />
              </Dialog.Close>
            </div>
            <div className="flex min-h-0 flex-1 p-3">
              <SelectedRulesLedger
                filters={selectedFilters}
                totalCount={totalCount}
                onRemove={onRemove}
              />
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const RuleSubscriptionWorkbench = memo(function RuleSubscriptionWorkbench({
  allFilters,
  selectedFilterIds,
  onSelectedFilterIdsChange,
}: {
  allFilters: Filter[];
  selectedFilterIds: number[];
  onSelectedFilterIdsChange: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<RuleScope>("all");
  const deferredQuery = useDeferredValue(query);

  const selectedIds = useMemo(() => new Set(selectedFilterIds), [selectedFilterIds]);
  const selectedFilters = useMemo(
    () => allFilters.filter((filter) => selectedIds.has(filter.id)),
    [allFilters, selectedIds],
  );
  const visibleFilters = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("zh-CN");

    return allFilters.filter((filter) => {
      const selected = selectedIds.has(filter.id);
      if (scope === "selected" && !selected) return false;
      if (scope === "unselected" && selected) return false;
      return !normalizedQuery || buildSearchText(filter).includes(normalizedQuery);
    });
  }, [allFilters, deferredQuery, scope, selectedIds]);

  const toggleFilter = (filterId: number) => {
    onSelectedFilterIdsChange(
      selectedIds.has(filterId)
        ? selectedFilterIds.filter((id) => id !== filterId)
        : [...selectedFilterIds, filterId],
    );
  };

  const selectVisible = () => {
    const next = new Set(selectedFilterIds);
    visibleFilters.forEach((filter) => next.add(filter.id));
    onSelectedFilterIdsChange(Array.from(next));
  };

  const clearVisible = () => {
    const visibleIds = new Set(visibleFilters.map((filter) => filter.id));
    onSelectedFilterIdsChange(selectedFilterIds.filter((id) => !visibleIds.has(id)));
  };

  const hasSelectedVisible = visibleFilters.some((filter) => selectedIds.has(filter.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="flex shrink-0 items-start justify-between gap-4 px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold sm:text-base">选择由此通道接收的规则</h3>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
            搜索名称或条件摘要；规则列表独立滚动，不会拉长整个编辑页。
          </p>
        </div>
        <MobileSelectedRulesSheet
          selectedFilters={selectedFilters}
          totalCount={allFilters.length}
          onRemove={toggleFilter}
        />
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b px-3 pb-3 sm:flex-row sm:items-center sm:px-4">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索规则或条件"
          aria-label="搜索订阅规则"
          clearLabel="清空订阅规则搜索"
          containerClassName="min-w-0 flex-1"
        />

        <div
          className="grid grid-cols-3 rounded-lg border bg-muted p-0.5 sm:flex"
          role="group"
          aria-label="规则范围"
        >
          {(
            [
              ["all", "全部"],
              ["selected", "已选"],
              ["unselected", "未选"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              className={cn(
                "h-7 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors",
                scope === value && "bg-card text-foreground shadow-sm",
              )}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b px-3 text-xs text-muted-foreground sm:px-4">
        <span aria-live="polite">
          显示 {visibleFilters.length} 条规则
          {query !== deferredQuery ? " · 搜索中" : ""}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-45"
            onClick={selectVisible}
            disabled={visibleFilters.length === 0}
          >
            全选当前结果
          </button>
          <button
            type="button"
            className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-45"
            onClick={clearVisible}
            disabled={!hasSelectedVisible}
          >
            清除选择
          </button>
        </div>
      </div>

      {visibleFilters.length === 0 ? (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <span className="grid size-10 place-items-center rounded-lg bg-muted">
            <SlidersHorizontal className="size-5" />
          </span>
          <span>{allFilters.length === 0 ? "还没有可用规则" : "没有匹配的规则"}</span>
          {query ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuery("")}>
              清除搜索
            </Button>
          ) : null}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-1.5 sm:px-2">
            {visibleFilters.map((filter) => {
              const checked = selectedIds.has(filter.id);

              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={checked}
                  aria-label={`${checked ? "取消订阅" : "订阅"} ${filter.name}`}
                  className={cn(
                    "grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto]",
                    selectableItemVariants({
                      kind: "choice",
                      selected: checked,
                      surface: "flat",
                    }),
                  )}
                  onClick={() => toggleFilter(filter.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{filter.name}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {describeFilterSummary(filter)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex",
                      !filter.enabled && "opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        filter.enabled ? "bg-success" : "bg-muted-foreground/55",
                      )}
                    />
                    {filter.enabled ? "已启用" : "已停用"}
                  </span>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-md border border-input bg-card text-transparent transition-colors",
                      checked && "border-primary bg-primary text-primary-foreground",
                    )}
                    aria-hidden
                  >
                    <Check className="size-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
});
