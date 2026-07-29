import { Inbox, LoaderCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NEW_FORWARD_TARGET_ID,
  type EditableForwardTarget,
} from "../types";

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
      <div className="flex h-10 shrink-0 items-center justify-between px-1">
        <span className="text-sm font-semibold">通道列表</span>
        <Badge variant="outline">{targets.length}</Badge>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {loading && targets.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            读取通道中
          </div>
        ) : targets.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-center text-sm text-muted-foreground">
            <Inbox className="size-6 text-muted-foreground/70" />
            当前没有转发通道
            <Button type="button" size="sm" onClick={onAdd}>
              <Plus data-icon="inline-start" />
              新建
            </Button>
          </div>
        ) : (
          targets.map((target) => {
            const active =
              (target.id === 0 && selectedTargetId === NEW_FORWARD_TARGET_ID) ||
              String(target.id) === selectedTargetId;
            const invalid = !target.name.trim() || !target.appriseUrl.trim();

            return (
              <button
                key={target.id || NEW_FORWARD_TARGET_ID}
                type="button"
                className={cn(
                  "relative flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-card/72 hover:text-foreground",
                )}
                onClick={() => onSelect(target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id))}
              >
                <span
                  className={cn(
                    "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                    active && "bg-primary",
                  )}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {target.name.trim() || "未命名通道"}
                  </span>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      invalid
                        ? "bg-destructive"
                        : target.enabled
                          ? "bg-success"
                          : "bg-muted-foreground/35",
                    )}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span>{target.id === 0 ? "草稿" : target.enabled ? "启用" : "停用"}</span>
                  <span>{target.filterIds.length} 规则</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
