import { Inbox, LoaderCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  NEW_FORWARD_TARGET_ID,
  type EditableForwardTarget,
} from "../types";

function getTargetMonogram(target: EditableForwardTarget): string {
  const label = target.name.trim();
  if (!label) return "新建";
  return label.slice(0, 2);
}

export function TargetList({
  targets,
  selectedTargetId,
  loading,
  onAdd,
  onSelect,
}: {
  targets: EditableForwardTarget[];
  selectedTargetId: string | null;
  loading: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        <span className="text-sm font-semibold">通道列表</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="rounded-md font-mono">
            {targets.length}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onAdd}
            aria-label="新建通道"
          >
            <Plus />
          </Button>
        </div>
      </div>

      {loading && targets.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          读取通道中
        </div>
      ) : targets.length === 0 ? (
        <div className="m-3 flex min-h-44 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/45 px-4 text-center text-sm text-muted-foreground">
          <span className="grid size-11 place-items-center rounded-lg bg-muted">
            <Inbox className="size-5" />
          </span>
          <div>
            <div className="font-medium text-foreground">还没有转发通道</div>
            <div className="mt-1 text-xs">创建一个目的地来接收规则消息</div>
          </div>
          <Button type="button" size="sm" onClick={onAdd}>
            <Plus data-icon="inline-start" />
            新建通道
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1.5 p-2">
            {targets.map((target) => {
              const active =
                (target.id === 0 && selectedTargetId === NEW_FORWARD_TARGET_ID) ||
                String(target.id) === selectedTargetId;
              const invalid = !target.name.trim() || !target.appriseUrl.trim();

              return (
                <button
                  key={target.id || NEW_FORWARD_TARGET_ID}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "grid min-h-16 w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-primary/20 bg-accent shadow-[inset_2px_0_var(--primary)]"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/72 hover:text-foreground",
                  )}
                  onClick={() =>
                    onSelect(target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id))
                  }
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-accent font-semibold text-accent-foreground">
                    {getTargetMonogram(target)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {target.name.trim() || "未命名通道"}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {target.id === 0 ? "草稿" : target.enabled ? "已启用" : "已停用"}
                      <span className="px-1.5 text-muted-foreground/45">·</span>
                      {target.filterIds.length} 条规则
                    </span>
                  </span>
                  <span
                    className={cn(
                      "size-2 rounded-full shadow-[0_0_0_4px_color-mix(in_oklab,currentColor_10%,transparent)]",
                      invalid
                        ? "text-destructive bg-destructive"
                        : target.enabled
                          ? "text-success bg-success"
                          : "text-muted-foreground bg-muted-foreground/45",
                    )}
                    aria-label={invalid ? "配置不完整" : target.enabled ? "已启用" : "已停用"}
                  />
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}

      <div className="shrink-0 border-t p-2.5">
        <Button type="button" className="w-full" onClick={onAdd}>
          <Plus data-icon="inline-start" />
          新建通道
        </Button>
      </div>
    </div>
  );
}
