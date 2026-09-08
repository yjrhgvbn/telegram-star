import type { ReactNode } from "react";
import { ALL_MESSAGES_SYSTEM_KEY } from "@telegram-star/shared/contracts/filters";
import { cn } from "@/lib/utils";
import type { Filter } from "@/types";
import { getFilterActivityPresentation } from "../utils/filterActivity";

interface Props {
  filter: Filter;
  selectedFilterId: string;
  nowMs: number;
  latestMessageAt?: string | null;
  actions?: ReactNode;
  onSelectFilter: (id: string) => void;
}

export function FilterPanelItem({
  filter,
  selectedFilterId,
  nowMs,
  latestMessageAt,
  actions,
  onSelectFilter,
}: Props) {
  const system = filter.systemKey === ALL_MESSAGES_SYSTEM_KEY;
  const selectedId = system ? "" : String(filter.id);
  const selected = selectedFilterId === selectedId;
  const activity = getFilterActivityPresentation(
    latestMessageAt === undefined ? filter.latestMessageAt : latestMessageAt,
    nowMs,
  );

  return (
    <div
      className={cn("message-filter-row", selected && "is-selected", !system && !filter.enabled && "is-paused")}
      data-filter-id={filter.id}
    >
      <button
        type="button"
        className="message-filter-select"
        aria-current={selected ? "page" : undefined}
        data-panel-focus={`filter-${filter.id}`}
        onClick={() => onSelectFilter(selectedId)}
      >
        <span className="message-filter-name" title={!system && !filter.enabled ? "监听已停用，历史消息仍可查看" : undefined}>{filter.name}</span>
        {!system && !filter.enabled ? <span className="sr-only">，监听已停用</span> : null}
        {activity.dateTime ? (
          <time
            className="message-filter-updated"
            dateTime={activity.dateTime}
            title={activity.exactTime ?? undefined}
            aria-label={`最新消息：${activity.exactTime ?? activity.label}`}
          >
            {activity.label}
          </time>
        ) : (
          <span className="message-filter-updated is-empty">暂无消息</span>
        )}
      </button>
      {actions}
    </div>
  );
}
