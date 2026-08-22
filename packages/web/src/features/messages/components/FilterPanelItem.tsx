import type { ReactNode } from "react";
import { FolderInput, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selectableItemVariants } from "@/components/ui/selectable-item";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Filter } from "@/types";
import {
  getFilterActivityPresentation,
  type FilterActivityPresentation,
} from "../utils/filterActivity";

interface FilterSubtitle extends FilterActivityPresentation {
  prefix: string | null;
}

interface ListRowProps {
  active: boolean;
  enabled?: boolean;
  focused?: boolean;
  name: string;
  subtitle: FilterSubtitle;
  onSelect: () => void;
  leadingAction?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

interface Props {
  filter: Filter;
  selectedFilterId: string;
  nowMs: number;
  preferEngagement: boolean;
  managing: boolean;
  focusPending: boolean;
  placementPending: boolean;
  organizing: boolean;
  dragHandle?: ReactNode;
  onSelectFilter: (id: string) => void;
  onSetFocused: (id: number, isFocused: boolean) => void;
  onToggleOrganize: (id: number) => void;
}

interface AllMessagesPanelItemProps {
  latestMessageAt: string | null;
  managing: boolean;
  nowMs: number;
  organizing: boolean;
  placementPending: boolean;
  selected: boolean;
  dragHandle?: ReactNode;
  onMove: () => void;
  onSelect: () => void;
}

function getFilterSubtitle(
  filter: Filter,
  nowMs: number,
  preferEngagement: boolean,
): FilterSubtitle {
  if (preferEngagement && filter.lastEngagedAt && filter.lastEngagementType) {
    return {
      ...getFilterActivityPresentation(filter.lastEngagedAt, nowMs),
      prefix: filter.lastEngagementType === "marked_read" ? "标记已读" : "打开 Telegram",
    };
  }

  const activity = getFilterActivityPresentation(filter.latestMessageAt, nowMs);
  return {
    ...activity,
    prefix: activity.dateTime ? "最近消息" : null,
  };
}

/**
 * Browse mode intentionally keeps every row on one scanning line. Management
 * controls are injected only while the dedicated organize mode is active.
 */
function ListRow({
  active,
  enabled = true,
  focused = false,
  name,
  subtitle,
  onSelect,
  leadingAction,
  actions,
  children,
}: ListRowProps) {
  return (
    <div
      className={cn(
        "group relative w-full rounded-none",
        selectableItemVariants({
          kind: "current",
          selected: active,
          surface: "flat",
        }),
        !enabled && "opacity-60",
      )}
    >
      <div className="flex min-h-11 items-center lg:min-h-10">
        {leadingAction}

        <button
          type="button"
          aria-current={active ? "true" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center gap-1.5 pr-5 text-left lg:min-h-10 lg:gap-2 lg:pr-2.5",
            leadingAction ? "pl-0.5 lg:pl-0" : "pl-2.5 lg:pl-2.5",
          )}
          onClick={onSelect}
        >
          {!leadingAction ? (
            <span className="flex size-3 shrink-0 items-center justify-center" aria-hidden="true">
              {focused ? <span className="size-1.5 rounded-full bg-primary" /> : null}
            </span>
          ) : null}

          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-normal text-foreground",
              (active || focused) && "font-medium",
            )}
          >
            {name}
          </span>

          {!enabled ? <Badge variant="outline">停用</Badge> : null}

          <span className="max-w-20 shrink-0 truncate text-xs tabular-nums text-muted-foreground">
            {subtitle.prefix ? <span className="sr-only">{subtitle.prefix}，</span> : null}
            {subtitle.dateTime ? (
              <time dateTime={subtitle.dateTime} title={subtitle.exactTime ?? undefined}>
                {subtitle.label}
              </time>
            ) : subtitle.label}
          </span>
        </button>

        {actions}
      </div>

      {children}
      <Separator className="mx-3 w-auto lg:mx-2.5" />
    </div>
  );
}

export function AllMessagesPanelItem({
  latestMessageAt,
  managing,
  nowMs,
  organizing,
  placementPending,
  selected,
  dragHandle,
  onMove,
  onSelect,
}: AllMessagesPanelItemProps) {
  const activity = getFilterActivityPresentation(latestMessageAt, nowMs);
  const moveAction = managing ? (
    <div className="flex shrink-0 items-center pr-2 lg:pr-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-9 lg:size-7"
        aria-label="移动消息组 全部消息"
        aria-expanded={organizing}
        title="移动消息组 全部消息"
        disabled={placementPending}
        onClick={onMove}
      >
        <FolderInput />
      </Button>
    </div>
  ) : null;

  return (
    <ListRow
      active={selected}
      name="全部消息"
      subtitle={{ ...activity, prefix: activity.dateTime ? "最近消息" : null }}
      leadingAction={dragHandle}
      actions={moveAction}
      onSelect={onSelect}
    />
  );
}

export function FilterPanelItem({
  filter,
  selectedFilterId,
  nowMs,
  preferEngagement,
  managing,
  focusPending,
  placementPending,
  organizing,
  dragHandle,
  onSelectFilter,
  onSetFocused,
  onToggleOrganize,
}: Props) {
  const active = selectedFilterId === String(filter.id);
  const subtitle = getFilterSubtitle(filter, nowMs, preferEngagement);
  const focusLabel = filter.isFocused
    ? `移出重点关注 ${filter.name}`
    : `设为重点关注 ${filter.name}`;
  const managementActions = managing ? (
    <div className="flex shrink-0 items-center gap-0.5 pr-2 lg:pr-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-9 lg:size-7"
        aria-label={focusLabel}
        aria-pressed={filter.isFocused}
        title={focusLabel}
        disabled={focusPending}
        onClick={() => onSetFocused(filter.id, !filter.isFocused)}
      >
        <Star fill={filter.isFocused ? "currentColor" : "none"} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-9 lg:size-7"
        aria-label={`移动消息组 ${filter.name}`}
        aria-expanded={organizing}
        title={`移动消息组 ${filter.name}`}
        disabled={placementPending}
        onClick={() => onToggleOrganize(filter.id)}
      >
        <FolderInput />
      </Button>
    </div>
  ) : null;

  return (
    <ListRow
      active={active}
      enabled={filter.enabled}
      focused={filter.isFocused}
      name={filter.name}
      subtitle={subtitle}
      onSelect={() => onSelectFilter(String(filter.id))}
      leadingAction={dragHandle}
      actions={managementActions}
    />
  );
}
