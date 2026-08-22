import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ALL_MESSAGES_SYSTEM_KEY } from "@telegram-star/shared/contracts/filters";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  Filter,
  FilterGroup,
  FilterGroupOrderInput,
} from "@/types";
import { AllMessagesPanelItem, FilterPanelItem } from "./FilterPanelItem";
import {
  type FilterPanelSortableData,
  getFilterSortableId,
  getGroupSectionId,
  reorderSortableIds,
  SortableFilterRow,
  SortableGroupSection,
  UNGROUPED_SECTION_ID,
} from "./FilterPanelSortable";

type ViewMode = "manual" | "focused" | "recent";
type MaybePromise = Promise<unknown> | unknown;

interface Props {
  filters: Filter[];
  filterGroups: FilterGroup[];
  ungroupedPosition: number;
  loading: boolean;
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
  onSetFocused: (id: number, isFocused: boolean) => MaybePromise;
  onCreateGroup: (name: string) => MaybePromise;
  onRenameGroup: (id: number, name: string) => MaybePromise;
  onDeleteGroup: (id: number) => MaybePromise;
  onReorderGroups: (input: FilterGroupOrderInput) => MaybePromise;
  onSetPlacement: (
    id: number,
    manualGroupId: number | null,
    targetIndex?: number,
  ) => MaybePromise;
}

interface SectionHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  leadingAction?: ReactNode;
  actions?: ReactNode;
}

interface ManualSection {
  group: FilterGroup;
  allFilters: Filter[];
  visibleFilters: Filter[];
}

const MAX_RECENT_FILTERS = 5;

function getSectionIdForGroup(manualGroupId: number | null): string {
  return manualGroupId === null
    ? UNGROUPED_SECTION_ID
    : getGroupSectionId(manualGroupId);
}

function getGroupIdFromSectionId(sectionId: UniqueIdentifier): number | null {
  if (sectionId === UNGROUPED_SECTION_ID) return null;
  const groupId = Number(String(sectionId).replace("section:group:", ""));
  return Number.isFinite(groupId) ? groupId : null;
}

function getSortableData(value: Record<string, unknown> | undefined): FilterPanelSortableData | null {
  if (value?.type === "section") {
    return {
      type: "section",
      manualGroupId: typeof value.manualGroupId === "number" ? value.manualGroupId : null,
    };
  }
  if (value?.type === "filter" && typeof value.filterId === "number") {
    return {
      type: "filter",
      filterId: value.filterId,
      manualGroupId: typeof value.manualGroupId === "number" ? value.manualGroupId : null,
    };
  }
  return null;
}

const filterPanelCollisionDetection: CollisionDetection = (args) => {
  const activeData = getSortableData(args.active.data.current);
  if (!activeData) return closestCenter(args);

  const dataById = new Map(
    args.droppableContainers.map((container) => [
      container.id,
      getSortableData(container.data.current),
    ]),
  );
  const pointerCollisions = pointerWithin(args);
  const preferredPointerCollisions = pointerCollisions.filter((collision) => {
    const data = dataById.get(collision.id);
    return activeData.type === "section"
      ? data?.type === "section"
      : data?.type === "filter";
  });
  if (preferredPointerCollisions.length > 0) return preferredPointerCollisions;

  const sectionPointerCollisions = pointerCollisions.filter(
    (collision) => dataById.get(collision.id)?.type === "section",
  );
  if (sectionPointerCollisions.length > 0) return sectionPointerCollisions;

  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const data = dataById.get(container.id);
      return activeData.type === "section" ? data?.type === "section" : data !== null;
    }),
  });
};

function sortManualFilters(filters: Filter[]): Filter[] {
  return [...filters].sort(
    (left, right) =>
      left.manualSortOrder - right.manualSortOrder ||
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      left.id - right.id,
  );
}

function matchesFilter(filter: Filter, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const conditionText = filter.conditions
    .flatMap((condition) => condition.values)
    .join(" ");
  return `${filter.name} ${conditionText}`
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "操作失败，请重试";
}

function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
  leadingAction,
  actions,
}: SectionHeaderProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="flex min-h-11 items-center border-l-[3px] border-primary lg:min-h-9">
      {leadingAction}
      <button
        type="button"
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left lg:min-h-9",
          leadingAction
            ? "py-0 pr-3 pl-0.5 lg:pr-2.5 lg:pl-0"
            : "px-3 lg:px-2.5",
        )}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "展开" : "收起"}分组 ${title}`}
        onClick={onToggle}
      >
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {actions}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-3 py-5 text-center shadow-sm lg:rounded-lg lg:bg-transparent lg:shadow-none">
      <p className="text-sm leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}

export function FilterPanel({
  filters,
  filterGroups,
  ungroupedPosition,
  loading,
  selectedFilterId,
  onSelectFilter,
  onSetFocused,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onReorderGroups,
  onSetPlacement,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("manual");
  const [query, setQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingFocusIds, setPendingFocusIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [pendingPlacementIds, setPendingPlacementIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [movingFilterId, setMovingFilterId] = useState<number | null>(null);
  const [moveQuery, setMoveQuery] = useState("");
  const [dropTargetSectionId, setDropTargetSectionId] = useState<UniqueIdentifier | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [managing, setManaging] = useState(false);
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<FilterGroup | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sortingSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sortingEnabled = managing
    && viewMode === "manual"
    && !normalizedQuery
    && !actionPending;
  const sortedGroups = useMemo(
    () => [...filterGroups].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
    ),
    [filterGroups],
  );
  const allSectionIds = useMemo(() => {
    const sectionIds = sortedGroups.map((group) => getGroupSectionId(group.id));
    sectionIds.splice(
      Math.min(Math.max(ungroupedPosition, 0), sectionIds.length),
      0,
      UNGROUPED_SECTION_ID,
    );
    return sectionIds;
  }, [sortedGroups, ungroupedPosition]);
  const knownGroupIds = useMemo(
    () => new Set(sortedGroups.map((group) => group.id)),
    [sortedGroups],
  );
  const manualFiltersByGroup = useMemo(() => {
    const grouped = new Map<number | null, Filter[]>([[null, []]]);
    for (const group of sortedGroups) grouped.set(group.id, []);
    for (const filter of filters) {
      const groupId = filter.manualGroupId !== null && knownGroupIds.has(filter.manualGroupId)
        ? filter.manualGroupId
        : null;
      grouped.get(groupId)?.push(filter);
    }
    for (const [groupId, items] of grouped) {
      grouped.set(groupId, sortManualFilters(items));
    }
    return grouped;
  }, [filters, knownGroupIds, sortedGroups]);

  const manualSections = useMemo<ManualSection[]>(() => {
    return sortedGroups.flatMap((group) => {
      const allFilters = manualFiltersByGroup.get(group.id) ?? [];
      const groupMatches = group.name.toLocaleLowerCase().includes(normalizedQuery);
      const visibleFilters = groupMatches
        ? allFilters
        : allFilters.filter((filter) => matchesFilter(filter, normalizedQuery));
      if (normalizedQuery && !groupMatches && visibleFilters.length === 0) return [];
      return [{ group, allFilters, visibleFilters }];
    });
  }, [manualFiltersByGroup, normalizedQuery, sortedGroups]);
  const manualSectionById = useMemo(
    () => new Map(manualSections.map((section) => [section.group.id, section])),
    [manualSections],
  );

  const ungroupedFilters = useMemo(
    () => manualFiltersByGroup.get(null) ?? [],
    [manualFiltersByGroup],
  );
  const ungroupedMatches = "未分组".includes(normalizedQuery);
  const visibleUngroupedFilters = useMemo(
    () => ungroupedMatches
      ? ungroupedFilters
      : ungroupedFilters.filter((filter) => matchesFilter(filter, normalizedQuery)),
    [normalizedQuery, ungroupedFilters, ungroupedMatches],
  );
  const visibleSectionIds = useMemo(
    () => allSectionIds.filter((sectionId) => {
      if (sectionId === UNGROUPED_SECTION_ID) {
        return !normalizedQuery || ungroupedMatches || visibleUngroupedFilters.length > 0;
      }
      const groupId = Number(String(sectionId).replace("section:group:", ""));
      return manualSectionById.has(groupId);
    }),
    [
      allSectionIds,
      manualSectionById,
      normalizedQuery,
      ungroupedMatches,
      visibleUngroupedFilters.length,
    ],
  );
  const latestMessageAt = useMemo(() => {
    let latestValue: string | null = null;
    let latestTimestamp = Number.NEGATIVE_INFINITY;

    for (const filter of filters) {
      const timestamp = filter.latestMessageAt ? Date.parse(filter.latestMessageAt) : Number.NaN;
      if (Number.isFinite(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestValue = filter.latestMessageAt;
      }
    }

    return latestValue;
  }, [filters]);

  const flatViewFilters = useMemo(() => {
    const visible = filters.filter(
      (filter) => filter.systemKey === null && matchesFilter(filter, normalizedQuery),
    );
    if (viewMode === "recent") {
      return visible
        .filter((filter) => filter.lastEngagedAt !== null)
        .sort(
          (left, right) =>
            Date.parse(right.lastEngagedAt ?? "") - Date.parse(left.lastEngagedAt ?? ""),
        )
        .slice(0, MAX_RECENT_FILTERS);
    }
    if (viewMode !== "focused") return [];

    const groupOrder = new Map<number | null, number>();
    for (const [index, sectionId] of allSectionIds.entries()) {
      groupOrder.set(
        sectionId === UNGROUPED_SECTION_ID
          ? null
          : Number(String(sectionId).replace("section:group:", "")),
        index,
      );
    }
    return visible
      .filter((filter) => filter.isFocused)
      .sort((left, right) => {
        const leftGroup = groupOrder.get(left.manualGroupId) ?? allSectionIds.length;
        const rightGroup = groupOrder.get(right.manualGroupId) ?? allSectionIds.length;
        return leftGroup - rightGroup ||
          left.manualSortOrder - right.manualSortOrder ||
          left.id - right.id;
      });
  }, [allSectionIds, filters, normalizedQuery, viewMode]);

  const movingFilter = useMemo(
    () => filters.find((filter) => filter.id === movingFilterId) ?? null,
    [filters, movingFilterId],
  );
  const movingFilterGroupId = movingFilter?.manualGroupId !== null
    && movingFilter?.manualGroupId !== undefined
    && knownGroupIds.has(movingFilter.manualGroupId)
    ? movingFilter.manualGroupId
    : null;
  const movingFilterPending = movingFilter !== null && pendingPlacementIds.has(movingFilter.id);
  const moveGroupOptions = useMemo(() => {
    const groupById = new Map(sortedGroups.map((group) => [group.id, group]));
    const normalizedMoveQuery = moveQuery.trim().toLocaleLowerCase();
    return allSectionIds.flatMap((sectionId) => {
      const option = sectionId === UNGROUPED_SECTION_ID
        ? { id: null, name: "未分组" }
        : (() => {
            const groupId = Number(String(sectionId).replace("section:group:", ""));
            const group = groupById.get(groupId);
            return group ? { id: group.id, name: group.name } : null;
          })();
      if (!option || (normalizedMoveQuery && !option.name.toLocaleLowerCase().includes(normalizedMoveQuery))) {
        return [];
      }
      return [option];
    });
  }, [allSectionIds, moveQuery, sortedGroups]);

  const isSectionCollapsed = useCallback(
    (key: string) => !normalizedQuery && collapsedSectionKeys.has(key),
    [collapsedSectionKeys, normalizedQuery],
  );

  const toggleSection = useCallback((key: string) => {
    setCollapsedSectionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const finishManaging = useCallback(() => {
    setManaging(false);
    setMovingFilterId(null);
    setMoveQuery("");
    setDropTargetSectionId(null);
    setExpandedGroupId(null);
    setEditingGroupId(null);
    setCreatingGroup(false);
    setGroupName("");
    setActionError(null);
  }, []);

  const handleSetFocused = useCallback(
    async (id: number, isFocused: boolean) => {
      setPendingFocusIds((current) => new Set(current).add(id));
      setActionError(null);
      try {
        await onSetFocused(id, isFocused);
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setPendingFocusIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [onSetFocused],
  );

  const handleSetPlacement = useCallback(
    async (id: number, manualGroupId: number | null, targetIndex?: number) => {
      setPendingPlacementIds((current) => new Set(current).add(id));
      setActionError(null);
      try {
        await onSetPlacement(id, manualGroupId, targetIndex);
        setMovingFilterId(null);
        setMoveQuery("");
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setPendingPlacementIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [onSetPlacement],
  );

  const handleFilterDragEnd = useCallback(
    async (
      event: DragEndEvent,
      activeData: Extract<FilterPanelSortableData, { type: "filter" }>,
    ) => {
      if (!event.over) return;
      const overData = getSortableData(event.over.data.current);
      if (!overData) return;

      const targetGroupId = overData.manualGroupId;
      const targetFilters = manualFiltersByGroup.get(targetGroupId) ?? [];
      let targetIndex = targetFilters.length;

      if (overData.type === "filter") {
        const overIndex = targetFilters.findIndex((filter) => filter.id === overData.filterId);
        if (overIndex < 0) return;
        targetIndex = overIndex;

        // 跨分组时根据指针落在目标行的上半区或下半区决定前插/后插。
        const translated = event.active.rect.current.translated;
        if (
          activeData.manualGroupId !== targetGroupId &&
          translated &&
          translated.top + translated.height / 2 > event.over.rect.top + event.over.rect.height / 2
        ) {
          targetIndex += 1;
        }
      }

      const sourceFilters = manualFiltersByGroup.get(activeData.manualGroupId) ?? [];
      const sourceIndex = sourceFilters.findIndex((filter) => filter.id === activeData.filterId);
      if (activeData.manualGroupId === targetGroupId && sourceIndex === targetIndex) return;

      await handleSetPlacement(activeData.filterId, targetGroupId, targetIndex);
    },
    [handleSetPlacement, manualFiltersByGroup],
  );

  const handleCreateGroup = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = groupName.trim();
      if (!name) return;
      setActionPending(true);
      setActionError(null);
      try {
        await onCreateGroup(name);
        setGroupName("");
        setCreatingGroup(false);
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setActionPending(false);
      }
    },
    [groupName, onCreateGroup],
  );

  const startRenamingGroup = useCallback((group: FilterGroup) => {
    setCreatingGroup(false);
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setExpandedGroupId(null);
    setActionError(null);
  }, []);

  const handleRenameGroup = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = groupName.trim();
      if (editingGroupId === null || !name) return;
      setActionPending(true);
      setActionError(null);
      try {
        await onRenameGroup(editingGroupId, name);
        setEditingGroupId(null);
        setGroupName("");
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setActionPending(false);
      }
    },
    [editingGroupId, groupName, onRenameGroup],
  );

  const handleGroupDragEnd = useCallback(
    async (event: DragEndEvent, overSectionId: UniqueIdentifier) => {
      if (!event.over) return;
      const nextSectionIds = reorderSortableIds(allSectionIds, event.active.id, overSectionId);
      if (!nextSectionIds) return;
      const nextIds = nextSectionIds.flatMap((sectionId) => {
        if (sectionId === UNGROUPED_SECTION_ID) return [];
        const groupId = getGroupIdFromSectionId(sectionId);
        return groupId === null ? [] : [groupId];
      });
      const nextUngroupedPosition = nextSectionIds.indexOf(UNGROUPED_SECTION_ID);
      setActionPending(true);
      setActionError(null);
      try {
        await onReorderGroups({
          ids: nextIds,
          ungroupedPosition: nextUngroupedPosition,
        });
      } catch (error) {
        setActionError(getErrorMessage(error));
      } finally {
        setActionPending(false);
      }
    },
    [allSectionIds, onReorderGroups],
  );

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    setDropTargetSectionId(null);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeData = getSortableData(event.active.data.current);
    const overData = event.over ? getSortableData(event.over.data.current) : null;
    if (activeData?.type !== "filter" || !event.over || !overData) {
      setDropTargetSectionId(null);
      return;
    }
    setDropTargetSectionId(
      overData.type === "section"
        ? event.over.id
        : getSectionIdForGroup(overData.manualGroupId),
    );
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDropTargetSectionId(null);
    const activeData = getSortableData(event.active.data.current);
    const overData = event.over ? getSortableData(event.over.data.current) : null;
    if (!activeData || !event.over || !overData) return;

    if (activeData.type === "section") {
      const overSectionId = overData.type === "section"
        ? event.over.id
        : getSectionIdForGroup(overData.manualGroupId);
      void handleGroupDragEnd(event, overSectionId);
      return;
    }
    void handleFilterDragEnd(event, activeData);
  }, [handleFilterDragEnd, handleGroupDragEnd]);

  const handleDeleteGroup = useCallback(async () => {
    if (!deleteGroupTarget) return;
    setActionPending(true);
    setActionError(null);
    try {
      await onDeleteGroup(deleteGroupTarget.id);
      setDeleteGroupTarget(null);
      setExpandedGroupId(null);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setActionPending(false);
    }
  }, [deleteGroupTarget, onDeleteGroup]);

  const handleToggleOrganize = useCallback((id: number) => {
    setMovingFilterId(id);
    setMoveQuery("");
    setActionError(null);
  }, []);

  const renderFilterItems = useCallback(
    (items: Filter[], preferEngagement: boolean) => items.map((filter) => (
      <FilterPanelItem
        key={filter.id}
        filter={filter}
        selectedFilterId={selectedFilterId}
        nowMs={nowMs}
        preferEngagement={preferEngagement}
        managing={false}
        focusPending={pendingFocusIds.has(filter.id)}
        placementPending={pendingPlacementIds.has(filter.id)}
        organizing={false}
        onSelectFilter={onSelectFilter}
        onSetFocused={handleSetFocused}
        onToggleOrganize={handleToggleOrganize}
      />
    )),
    [
      handleSetFocused,
      handleToggleOrganize,
      nowMs,
      onSelectFilter,
      pendingFocusIds,
      pendingPlacementIds,
      selectedFilterId,
    ],
  );

  const renderManualItems = useCallback(
    (items: Filter[], manualGroupId: number | null) => {
      const currentIds = items.map((filter) => getFilterSortableId(filter.id));
      return (
        <SortableContext items={currentIds} strategy={verticalListSortingStrategy}>
          {items.map((filter) => (
            <SortableFilterRow
              key={filter.id}
              id={getFilterSortableId(filter.id)}
              filterId={filter.id}
              label={filter.name}
              manualGroupId={manualGroupId}
              disabled={!sortingEnabled || pendingPlacementIds.has(filter.id)}
            >
              {(dragHandle) => filter.systemKey === ALL_MESSAGES_SYSTEM_KEY ? (
                <AllMessagesPanelItem
                  latestMessageAt={latestMessageAt}
                  managing={managing}
                  nowMs={nowMs}
                  organizing={movingFilterId === filter.id}
                  placementPending={pendingPlacementIds.has(filter.id)}
                  selected={selectedFilterId === ""}
                  dragHandle={dragHandle}
                  onMove={() => handleToggleOrganize(filter.id)}
                  onSelect={() => onSelectFilter("")}
                />
              ) : (
                <FilterPanelItem
                  filter={filter}
                  selectedFilterId={selectedFilterId}
                  nowMs={nowMs}
                  preferEngagement={false}
                  managing={managing}
                  focusPending={pendingFocusIds.has(filter.id)}
                  placementPending={pendingPlacementIds.has(filter.id)}
                  organizing={movingFilterId === filter.id}
                  dragHandle={dragHandle}
                  onSelectFilter={onSelectFilter}
                  onSetFocused={handleSetFocused}
                  onToggleOrganize={handleToggleOrganize}
                />
              )}
            </SortableFilterRow>
          ))}
        </SortableContext>
      );
    },
    [
      handleSetFocused,
      handleToggleOrganize,
      latestMessageAt,
      managing,
      movingFilterId,
      nowMs,
      onSelectFilter,
      pendingFocusIds,
      pendingPlacementIds,
      selectedFilterId,
      sortingEnabled,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 pt-3 pb-2 lg:p-3">
        <div className="flex items-center gap-2">
          <SearchInput
            containerClassName="min-w-0 flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="搜索消息组"
            aria-label="搜索消息组"
            clearLabel="清空消息组搜索"
          />
          <Button
            type="button"
            variant={managing ? "secondary" : "outline"}
            size="icon-lg"
            aria-label={managing ? "完成整理" : "配置分组列表"}
            aria-expanded={managing}
            title={managing ? "完成整理" : "配置分组列表"}
            onClick={() => {
              if (managing) {
                finishManaging();
                return;
              }
              setViewMode("manual");
              setQuery("");
              setManaging(true);
              setMovingFilterId(null);
              setMoveQuery("");
              setExpandedGroupId(null);
              setEditingGroupId(null);
              setCreatingGroup(false);
              setGroupName("");
              setActionError(null);
            }}
          >
            {managing ? <Check /> : <Settings2 />}
          </Button>
        </div>

        {managing ? (
          <div
            className="flex h-9 items-center justify-between gap-2 rounded-lg bg-muted px-2.5 py-1"
            aria-live="polite"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <GripVertical className="size-3.5 shrink-0" aria-hidden="true" />
              {normalizedQuery
                ? "整理我的分组：清空搜索后可拖拽"
                : "整理我的分组：拖拽排序或移动消息组"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0"
              disabled={creatingGroup || actionPending}
              onClick={() => {
                setCreatingGroup(true);
                setEditingGroupId(null);
                setGroupName("");
                setActionError(null);
              }}
            >
              <Plus data-icon="inline-start" />
              新建分组
            </Button>
          </div>
        ) : (
          <Tabs
            value={viewMode}
            className="w-full"
            onValueChange={(value) => {
              setViewMode(value as ViewMode);
              setMovingFilterId(null);
              setMoveQuery("");
              setExpandedGroupId(null);
              setEditingGroupId(null);
              setCreatingGroup(false);
              setActionError(null);
            }}
          >
            <TabsList variant="line" className="grid h-9! w-full grid-cols-3 rounded-none p-0">
              <TabsTrigger value="manual">我的分组</TabsTrigger>
              <TabsTrigger value="focused">重点关注</TabsTrigger>
              <TabsTrigger value="recent">最近跟进</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden">
        <div className="flex flex-col gap-2 pb-2 pt-2">
          {actionError ? (
            <p role="alert" className="m-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              {actionError}
            </p>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : viewMode === "manual" ? (
            <>
              {creatingGroup ? (
                <form className="flex items-center gap-1.5 px-3 py-2 lg:px-2.5" onSubmit={handleCreateGroup}>
                  <Input
                    autoFocus
                    value={groupName}
                    maxLength={60}
                    placeholder="例如：本季在追"
                    aria-label="新分组名称"
                    disabled={actionPending}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <Button
                    type="submit"
                    size="icon-sm"
                    aria-label="保存新分组"
                    disabled={actionPending || !groupName.trim()}
                  >
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="取消新建分组"
                    disabled={actionPending}
                    onClick={() => {
                      setCreatingGroup(false);
                      setGroupName("");
                    }}
                  >
                    <X />
                  </Button>
                </form>
              ) : null}

              <DndContext
                sensors={sortingSensors}
                collisionDetection={filterPanelCollisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragCancel={() => setDropTargetSectionId(null)}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={visibleSectionIds}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleSectionIds.map((sectionId) => {
                    if (sectionId === UNGROUPED_SECTION_ID) {
                      const collapsed = isSectionCollapsed("ungrouped");
                      return (
                        <SortableGroupSection
                          key={UNGROUPED_SECTION_ID}
                          id={UNGROUPED_SECTION_ID}
                          label="未分组"
                          manualGroupId={null}
                          disabled={!sortingEnabled}
                          dropActive={dropTargetSectionId === UNGROUPED_SECTION_ID}
                        >
                          {(dragHandle) => (
                            <>
                              <SectionHeader
                                title="未分组"
                                count={normalizedQuery
                                  ? visibleUngroupedFilters.length
                                  : ungroupedFilters.length}
                                collapsed={collapsed}
                                onToggle={() => toggleSection("ungrouped")}
                                leadingAction={managing ? dragHandle : null}
                              />
                              {!collapsed ? (
                                visibleUngroupedFilters.length > 0 ? (
                                  renderManualItems(visibleUngroupedFilters, null)
                                ) : (
                                  <p className="px-6 py-2 text-xs text-muted-foreground">暂无消息组</p>
                                )
                              ) : null}
                            </>
                          )}
                        </SortableGroupSection>
                      );
                    }

                    const groupId = getGroupIdFromSectionId(sectionId);
                    if (groupId === null) return null;
                    const section = manualSectionById.get(groupId);
                    if (!section) return null;
                    const { group, allFilters, visibleFilters } = section;
                    const editing = editingGroupId === group.id;
                    const expanded = expandedGroupId === group.id;
                    const sectionKey = `group:${group.id}`;
                    const collapsed = isSectionCollapsed(sectionKey);
                    return (
                      <SortableGroupSection
                        key={group.id}
                        id={sectionId}
                        label={group.name}
                        manualGroupId={group.id}
                        disabled={!sortingEnabled}
                        dropActive={dropTargetSectionId === sectionId}
                      >
                        {(dragHandle) => (
                          <>
                            {editing ? (
                              <form className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 lg:min-h-9 lg:px-2.5" onSubmit={handleRenameGroup}>
                                <Input
                                  autoFocus
                                  value={groupName}
                                  maxLength={60}
                                  aria-label={`重命名分组 ${group.name}`}
                                  disabled={actionPending}
                                  onChange={(event) => setGroupName(event.target.value)}
                                />
                                <Button
                                  type="submit"
                                  size="icon-sm"
                                  aria-label={`保存分组名称 ${group.name}`}
                                  disabled={actionPending || !groupName.trim()}
                                >
                                  <Check />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`取消重命名分组 ${group.name}`}
                                  disabled={actionPending}
                                  onClick={() => {
                                    setEditingGroupId(null);
                                    setGroupName("");
                                  }}
                                >
                                  <X />
                                </Button>
                              </form>
                            ) : (
                              <SectionHeader
                                title={group.name}
                                count={normalizedQuery ? visibleFilters.length : allFilters.length}
                                collapsed={collapsed}
                                onToggle={() => toggleSection(sectionKey)}
                                leadingAction={managing ? dragHandle : null}
                                actions={managing ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    className="mr-1.5 size-9 lg:size-7"
                                    aria-label={`管理分组 ${group.name}`}
                                    aria-expanded={expanded}
                                    onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                ) : null}
                              />
                            )}

                            {managing && expanded ? (
                              <div className="flex items-center justify-end gap-1 px-3 pb-2 lg:px-2.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  disabled={actionPending}
                                  onClick={() => startRenamingGroup(group)}
                                >
                                  <Pencil data-icon="inline-start" />
                                  重命名
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="xs"
                                  disabled={actionPending}
                                  onClick={() => setDeleteGroupTarget(group)}
                                >
                                  <Trash2 data-icon="inline-start" />
                                  删除
                                </Button>
                              </div>
                            ) : null}

                            {!collapsed ? (
                              visibleFilters.length > 0 ? (
                                renderManualItems(visibleFilters, group.id)
                              ) : (
                                <p className="px-6 py-2 text-xs text-muted-foreground">暂无消息组</p>
                              )
                            ) : null}
                          </>
                        )}
                      </SortableGroupSection>
                    );
                  })}
                </SortableContext>
              </DndContext>

              {normalizedQuery && visibleSectionIds.length === 0 ? (
                <EmptyState>没有匹配的分组或消息组</EmptyState>
              ) : null}
            </>
          ) : (
            <section className="flex flex-col">
              <SectionHeader
                title={viewMode === "focused" ? "重点关注" : "最近跟进"}
                count={flatViewFilters.length}
                collapsed={isSectionCollapsed(viewMode)}
                onToggle={() => toggleSection(viewMode)}
              />
              {!isSectionCollapsed(viewMode) ? (
                flatViewFilters.length > 0 ? (
                  renderFilterItems(flatViewFilters, true)
                ) : (
                  <EmptyState>
                    {query
                      ? "没有匹配的消息组"
                      : viewMode === "focused"
                        ? "还没有重点关注，可点击顶部配置按钮后添加"
                        : "还没有最近跟进，标记已读或打开 Telegram 后会出现在这里"}
                  </EmptyState>
                )
              ) : null}
            </section>
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={movingFilter !== null}
        onOpenChange={(open) => {
          if (!open && movingFilterId !== null && !movingFilterPending) {
            setMovingFilterId(null);
            setMoveQuery("");
            setActionError(null);
          }
        }}
      >
        <DialogContent className="max-h-[min(80vh,32rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>移动“{movingFilter?.name}”</DialogTitle>
            <DialogDescription>选择目标分组后会立即移动，也可以在整理模式中直接拖拽。</DialogDescription>
          </DialogHeader>

          {allSectionIds.length > 8 ? (
            <SearchInput
              value={moveQuery}
              onChange={(event) => setMoveQuery(event.target.value)}
              onClear={() => setMoveQuery("")}
              placeholder="搜索分组"
              aria-label="搜索目标分组"
              clearLabel="清空目标分组搜索"
            />
          ) : null}

          {actionError ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              {actionError}
            </p>
          ) : null}

          <ScrollArea className="max-h-[min(56vh,20rem)] min-h-0">
            <div className="flex flex-col gap-1 pr-2">
              {moveGroupOptions.length > 0 ? moveGroupOptions.map((option) => {
                const selected = option.id === movingFilterGroupId;
                return (
                  <Button
                    key={option.id ?? "ungrouped"}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    aria-current={selected ? "true" : undefined}
                    disabled={movingFilterPending}
                    onClick={() => {
                      if (selected) {
                        setMovingFilterId(null);
                        setMoveQuery("");
                        return;
                      }
                      if (!movingFilter) return;
                      void handleSetPlacement(movingFilter.id, option.id);
                    }}
                  >
                    <Check
                      data-icon="inline-start"
                      className={cn(!selected && "invisible")}
                    />
                    <span className="truncate">{option.name}</span>
                  </Button>
                );
              }) : (
                <p className="px-2 py-5 text-center text-sm text-muted-foreground">
                  没有匹配的分组
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteGroupTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionPending) setDeleteGroupTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组“{deleteGroupTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              分组内的消息组会移到“未分组”，过滤规则和已收集的消息都不会删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actionPending}
              onClick={() => void handleDeleteGroup()}
            >
              删除分组
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
