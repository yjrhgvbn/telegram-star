import type { CSSProperties, ReactNode } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SortableContainerProps {
  id: UniqueIdentifier;
  label: string;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}

interface SortableGroupSectionProps extends SortableContainerProps {
  manualGroupId: number | null;
  dropActive?: boolean;
}

interface SortableFilterRowProps extends SortableContainerProps {
  filterId: number;
  manualGroupId: number | null;
}

export type FilterPanelSortableData =
  | { type: "section"; manualGroupId: number | null }
  | { type: "filter"; filterId: number; manualGroupId: number | null };

export const UNGROUPED_SECTION_ID = "section:ungrouped";

export function getGroupSectionId(id: number): string {
  return `section:group:${id}`;
}

export function getFilterSortableId(id: number): string {
  return `filter:${id}`;
}

function getSortableStyle(
  transform: ReturnType<typeof useSortable>["transform"],
  transition: ReturnType<typeof useSortable>["transition"],
): CSSProperties {
  return {
    // This panel only supports vertical ordering; suppress horizontal drift so
    // narrow mobile rows stay visually anchored while the pointer moves.
    transform: transform
      ? CSS.Transform.toString({ ...transform, x: 0 })
      : undefined,
    transition,
  };
}

function SortableHandle({
  label,
  attributes,
  listeners,
}: {
  label: string;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  return (
    <Button
      {...attributes}
      {...listeners}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
      aria-label={label}
      title={label}
    >
      <GripVertical />
    </Button>
  );
}

export function SortableGroupSection({
  id,
  label,
  disabled,
  manualGroupId,
  dropActive = false,
  children,
}: SortableGroupSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    data: { type: "section", manualGroupId } satisfies FilterPanelSortableData,
  });

  const dragHandle = disabled ? null : (
    <SortableHandle
      label={`拖拽分组 ${label}`}
      attributes={attributes}
      listeners={listeners}
    />
  );

  return (
    <section
      ref={setNodeRef}
      style={getSortableStyle(transform, transition)}
      className={cn(
        "flex flex-col",
        isDragging && "opacity-60",
        dropActive && "bg-muted/50 ring-1 ring-inset ring-primary/30",
      )}
    >
      {children(dragHandle)}
    </section>
  );
}

export function SortableFilterRow({
  id,
  filterId,
  label,
  disabled,
  manualGroupId,
  children,
}: SortableFilterRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    data: {
      type: "filter",
      filterId,
      manualGroupId,
    } satisfies FilterPanelSortableData,
  });

  const dragHandle = disabled ? null : (
    <SortableHandle
      label={`拖拽消息组 ${label}`}
      attributes={attributes}
      listeners={listeners}
    />
  );

  return (
    <div
      ref={setNodeRef}
      style={getSortableStyle(transform, transition)}
      className={cn(isDragging && "opacity-60")}
    >
      {children(dragHandle)}
    </div>
  );
}

export function reorderSortableIds<T extends UniqueIdentifier>(
  ids: T[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
): T[] | null {
  const activeIndex = ids.indexOf(activeId as T);
  const overIndex = ids.indexOf(overId as T);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return null;
  return arrayMove(ids, activeIndex, overIndex);
}
