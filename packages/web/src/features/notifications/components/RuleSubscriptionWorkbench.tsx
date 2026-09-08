import { memo, useDeferredValue, useId, useMemo, useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import type { Filter, JoinedChat } from "@/types";
import { describeFilterRule } from "@/features/filters/utils";
import "./RuleSubscriptionWorkbench.css";

type RuleScope = "all" | "selected" | "unselected";

const EMPTY_CHATS: JoinedChat[] = [];

interface RuleSubscriptionWorkbenchProps {
  allFilters: Filter[];
  selectedFilterIds: number[];
  onSelectedFilterIdsChange: (ids: number[]) => void;
  chats?: JoinedChat[];
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const RuleSubscriptionWorkbench = memo(function RuleSubscriptionWorkbench({
  allFilters,
  selectedFilterIds,
  onSelectedFilterIdsChange,
  chats = EMPTY_CHATS,
  disabled = false,
  loading = false,
  error,
  onRetry,
}: RuleSubscriptionWorkbenchProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<RuleScope>("all");
  const [expandedFilterId, setExpandedFilterId] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const detailsId = useId();
  const selectedIds = useMemo(() => new Set(selectedFilterIds), [selectedFilterIds]);
  const entries = useMemo(
    () => allFilters.map((filter) => {
      // Reuse the rule editor's wording so OR groups and exclusions keep their meaning.
      const summary = describeFilterRule(filter.conditions, chats);
      return {
        filter,
        summary,
        searchable: [filter.name, summary, ...filter.conditions.flatMap((condition) => condition.values)]
          .join(" ")
          .toLocaleLowerCase("zh-CN"),
      };
    }),
    [allFilters, chats],
  );
  const selectedCount = allFilters.filter((filter) => selectedIds.has(filter.id)).length;
  const visibleEntries = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("zh-CN");
    return entries.filter(({ filter, searchable }) => {
      const selected = selectedIds.has(filter.id);
      if (scope === "selected" && !selected) return false;
      if (scope === "unselected" && selected) return false;
      return !normalizedQuery || searchable.includes(normalizedQuery);
    });
  }, [entries, deferredQuery, scope, selectedIds]);
  const allVisibleSelected = visibleEntries.length > 0 &&
    visibleEntries.every(({ filter }) => selectedIds.has(filter.id));

  const toggleFilter = (filterId: number) => {
    if (disabled) return;
    onSelectedFilterIdsChange(
      selectedIds.has(filterId)
        ? selectedFilterIds.filter((id) => id !== filterId)
        : [...selectedFilterIds, filterId],
    );
  };

  const toggleVisible = () => {
    if (disabled) return;
    // Bulk actions are limited to the rendered result, including search and scope.
    const visibleIds = new Set(visibleEntries.map(({ filter }) => filter.id));
    onSelectedFilterIdsChange(
      allVisibleSelected
        ? selectedFilterIds.filter((id) => !visibleIds.has(id))
        : Array.from(new Set([...selectedFilterIds, ...visibleIds])),
    );
  };

  const emptyMessage = allFilters.length === 0
    ? "还没有可用规则"
    : deferredQuery.trim()
      ? "没有找到规则"
      : scope === "selected"
        ? "还没有选择规则"
        : "已选择全部规则";

  return (
    <section className="forward-rules" aria-label="接收规则">
      <div className="forward-rules__toolbar">
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索规则或条件"
          aria-label="搜索订阅规则"
          clearLabel="清空订阅规则搜索"
          containerClassName="forward-rules__search"
        />
        <ToggleGroup
          className="forward-rules__scopes"
          aria-label="规则范围"
          value={[scope]}
          onValueChange={(values) => { if (values[0]) setScope(values[0]); }}
        >
          {([
            ["all", "全部", allFilters.length],
            ["selected", "已选", selectedCount],
            ["unselected", "未选", allFilters.length - selectedCount],
          ] as const).map(([value, label, count]) => (
            <Toggle key={value} value={value} className="forward-rules__scope">
              {label}{" "}<span>{count}</span>
            </Toggle>
          ))}
        </ToggleGroup>
        <button
          className="forward-rules__bulk"
          type="button"
          onClick={toggleVisible}
          disabled={disabled || visibleEntries.length === 0}
        >
          {allVisibleSelected
            ? "取消当前选择"
            : query.trim() || scope !== "all" ? "选择当前结果" : "选择全部"}
        </button>
        <span className="sr-only" role="status">
          显示 {visibleEntries.length} 条规则{query !== deferredQuery ? "，搜索中" : ""}
        </span>
      </div>

      <div className="forward-rules__list">
        {error ? (
          <div className="forward-rules__feedback" role="alert">
            <span>规则读取失败：{error}</span>
            <Button type="button" variant="ghost" size="sm" onClick={onRetry} disabled={loading}>重试读取规则</Button>
          </div>
        ) : null}
        {loading && allFilters.length === 0 ? (
          <div className="forward-rules__empty" role="status"><LoaderCircle className="size-4 animate-spin" />读取规则中</div>
        ) : allFilters.length === 0 && error ? null : visibleEntries.length === 0 ? (
          <div className="forward-rules__empty">
            <p>{emptyMessage}</p>
            {allFilters.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setQuery(""); setScope("all"); }}
              >
                查看全部规则
              </Button>
            ) : null}
          </div>
        ) : visibleEntries.map(({ filter, summary }) => {
          const expanded = expandedFilterId === filter.id;
          const conditionId = `${detailsId}-${filter.id}`;
          const sourceConditions = expanded
            ? filter.conditions.filter((condition) => condition.type === "chat")
            : [];
          const contentConditions = expanded
            ? filter.conditions.filter((condition) => condition.type !== "chat")
            : [];

          return (
            <div className="forward-rules__item" key={filter.id}>
              <div className="forward-rules__row">
                <label className="forward-rules__select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(filter.id)}
                    disabled={disabled}
                    onChange={() => toggleFilter(filter.id)}
                    aria-label={`接收 ${filter.name}`}
                  />
                  <span className="forward-rules__copy">
                    <span className="forward-rules__name">
                      <strong>{filter.name}</strong>
                      {!filter.enabled ? <small>已停用</small> : null}
                    </span>
                    <span className="forward-rules__summary" title={summary}>{summary}</span>
                  </span>
                </label>
                <Button
                  className="forward-rules__expand"
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`查看${filter.name}规则`}
                  aria-expanded={expanded}
                  aria-controls={conditionId}
                  onClick={() => setExpandedFilterId(expanded ? null : filter.id)}
                >
                  {expanded ? <ChevronDown /> : <ChevronRight />}
                </Button>
              </div>
              {expanded ? (
                <dl className="forward-rules__peek" id={conditionId}>
                  <div>
                    <dt>消息来源</dt>
                    <dd>{sourceConditions.length ? describeFilterRule(sourceConditions, chats) : "全部会话"}</dd>
                  </div>
                  <div>
                    <dt>匹配条件</dt>
                    <dd>{contentConditions.length
                      ? describeFilterRule(contentConditions, chats)
                      : filter.conditions.length ? "全部消息" : "尚未定义命中条件"}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
});
