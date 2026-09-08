import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ListSearchToolbar } from "@/components/ListSearchToolbar";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Filter as FilterModel, JoinedChat } from "@/types";
import { describeFilterRule } from "../utils";
import "./FilterLibrary.css";

interface FilterLibraryProps {
  filters: FilterModel[];
  chats: JoinedChat[];
  loading: boolean;
  error?: string | null;
  selectedFilterId?: number | null;
  draftNames?: Record<string, string>;
  disabled?: boolean;
  onCreate: () => void;
  onSelect: (id: number) => void;
}

export function FilterLibrary({
  filters,
  chats,
  loading,
  error,
  selectedFilterId,
  draftNames = {},
  disabled,
  onCreate,
  onSelect,
}: FilterLibraryProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const entries = useMemo(() => {
    const chatNames = new Map(chats.map((chat) => [chat.id, chat.title]));
    return filters.map((filter) => {
      const sourceNames = filter.conditions
        .filter((condition) => condition.type === "chat")
        .flatMap((condition) => condition.values)
        .map((id) => chatNames.get(id) ?? id);
      const content = filter.conditions.find((condition) => condition.type !== "chat");
      const summary = [
        sourceNames.length ? sourceNames.join("、") : "全部会话",
        content?.type === "script" ? "JavaScript" : content?.values[0],
      ].filter(Boolean).join(" · ");
      return {
        filter,
        summary,
        searchable: `${filter.name} ${describeFilterRule(filter.conditions, chats)}`.toLowerCase(),
      };
    });
  }, [chats, filters]);
  const visible = entries.filter(
    ({ filter, searchable }) =>
      !normalizedQuery ||
      `${draftNames[filter.id] ?? ""} ${searchable}`.toLowerCase().includes(normalizedQuery),
  );

  return (
    <aside className="filter-library" aria-label="规则列表">
      <ListSearchToolbar>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="搜索规则"
          aria-label="搜索规则"
          clearLabel="清空规则搜索"
        />
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="新建规则"
          onClick={onCreate}
          disabled={disabled}
        >
          <Plus />
        </Button>
      </ListSearchToolbar>
      <div className="filter-library__items">
        {loading ? (
          <div className="filter-library__loading">
            {[0, 1, 2].map((id) => <Skeleton key={id} className="h-16 rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <p className="filter-library__empty">
            {error && filters.length === 0 ? "暂时无法读取规则" : filters.length ? "没有找到规则" : "还没有规则，点击右上角新建。"}
          </p>
        ) : (
          visible.map(({ filter, summary }) => (
            <button
              type="button"
              key={filter.id}
              className="filter-library__item"
              aria-current={filter.id === selectedFilterId ? "page" : undefined}
              onClick={() => onSelect(filter.id)}
              disabled={disabled}
            >
              <span className="filter-library__title">
                <span>{draftNames[filter.id] ?? filter.name}</span>
                {draftNames[filter.id] !== undefined ? <small>未保存</small> : null}
                <span
                  className="filter-library__state"
                  data-enabled={filter.enabled}
                  aria-label={filter.enabled ? "已启用" : "已停用"}
                />
              </span>
              <span className="filter-library__summary">{summary}</span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
