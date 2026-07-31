import { useMemo, useState } from "react";
import { Inbox, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onRefresh,
  onSelect,
}: {
  targets: EditableForwardTarget[];
  selectedTargetId: string | null;
  loading: boolean;
  onAdd: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleTargets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return targets;

    return targets.filter((target) =>
      `${target.name} ${target.appriseUrl}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query, targets]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-0">
      <div className="shrink-0 lg:border-b lg:border-border lg:p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索通知通道"
            aria-label="搜索通知通道"
            className="h-10 bg-card pl-8 shadow-sm lg:h-9 lg:shadow-none"
          />
        </div>
      </div>

      {loading && targets.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground shadow-sm lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
          <LoaderCircle className="size-4 animate-spin" />
          读取通道中
        </div>
      ) : targets.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-4 text-center text-sm text-muted-foreground shadow-sm lg:m-3 lg:bg-card/45 lg:shadow-none">
          <span className="grid size-11 place-items-center rounded-lg bg-muted">
            <Inbox className="size-5" />
          </span>
          <div>
            <div className="font-medium text-foreground">还没有转发通道</div>
            <div className="mt-1 text-xs">创建一个目的地来接收规则消息</div>
          </div>
        </div>
      ) : visibleTargets.length === 0 ? (
        <div className="flex min-h-44 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-4 text-center text-sm text-muted-foreground shadow-sm lg:m-3 lg:bg-card/45 lg:shadow-none">
          <span className="grid size-11 place-items-center rounded-lg bg-muted">
            <Search className="size-5" />
          </span>
          <div>
            <div className="font-medium text-foreground">没有匹配的通知通道</div>
            <div className="mt-1 text-xs">尝试搜索其他名称或地址</div>
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 pb-2 lg:gap-1.5 lg:p-2">
            {visibleTargets.map((target) => {
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
                    "grid min-h-16 w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left shadow-sm transition-colors lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
                    active
                      ? "text-foreground lg:border-primary/20 lg:bg-accent lg:shadow-[inset_2px_0_var(--primary)]"
                      : "text-muted-foreground hover:bg-muted/72 hover:text-foreground",
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

      <div className="shrink-0 lg:border-t lg:p-2.5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-3 lg:h-9"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && "animate-spin")} data-icon="inline-start" />
            刷新
          </Button>
          <Button type="button" className="h-11 w-full lg:h-9" onClick={onAdd}>
            <Plus data-icon="inline-start" />
            新建通道
          </Button>
        </div>
      </div>
    </div>
  );
}
