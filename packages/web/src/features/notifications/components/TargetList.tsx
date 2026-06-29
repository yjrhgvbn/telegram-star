import { Inbox, LoaderCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="bg-card/80 shadow-sm ring-1 ring-foreground/10" size="sm">
      <CardHeader className="px-3 pt-3 pb-0">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">通道列表</CardTitle>
          <Badge variant="outline" className="rounded-md">
            {targets.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 px-3 pb-3">
        {loading && targets.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            读取通道中
          </div>
        ) : targets.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg bg-background/70 px-3 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
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
                  "flex w-full flex-col gap-2 rounded-lg px-3 py-2.5 text-left transition",
                  active ? "bg-accent/75 text-accent-foreground shadow-sm" : "hover:bg-muted/65",
                )}
                onClick={() => onSelect(target.id === 0 ? NEW_FORWARD_TARGET_ID : String(target.id))}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
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
      </CardContent>
    </Card>
  );
}
