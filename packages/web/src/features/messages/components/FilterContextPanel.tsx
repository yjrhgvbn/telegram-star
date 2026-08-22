import {
  BellRing,
  Inbox,
  ListFilter,
  LocateFixed,
  MessageSquareText,
  PencilLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Filter } from "@/types";

interface FilterContextPanelProps {
  filters: Filter[];
  selectedFilter: Filter | null;
  selectedFilterId: string;
  telegramAuthorized: boolean;
  onEditSelectedFilter: () => void;
}

function countConditionValues(filter: Filter | null, type: string) {
  return (
    filter?.conditions
      .filter((condition) => condition.type === type)
      .reduce((total, condition) => total + condition.values.length, 0) ?? 0
  );
}

export function FilterContextPanel({
  filters,
  selectedFilter,
  selectedFilterId,
  telegramAuthorized,
  onEditSelectedFilter,
}: FilterContextPanelProps) {
  const isAllMessages = selectedFilterId === "";
  const enabledFilters = filters.filter((filter) => filter.enabled).length;
  const keywordCount = countConditionValues(selectedFilter, "keyword");
  const regexCount = countConditionValues(selectedFilter, "regex");
  const scriptCount = countConditionValues(selectedFilter, "script");
  const chatCount = countConditionValues(selectedFilter, "chat");
  const excludedConditionCount = selectedFilter?.conditions.filter(
    (condition) => condition.effect === "exclude",
  ).length ?? 0;

  return (
    <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--workspace-panel-shadow)] xl:flex">
      <div className="flex h-14 items-center justify-between px-4">
        <div>
          <h2 className="text-sm font-semibold">上下文</h2>
          <p className="text-xs text-muted-foreground">当前消息路径</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{isAllMessages ? "全部" : "规则"}</Badge>
          {selectedFilter ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onEditSelectedFilter}
              aria-label={`编辑过滤器 ${selectedFilter.name}`}
              title="编辑过滤器"
            >
              <PencilLine />
            </Button>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <section>
          <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Signal path
          </p>
          <div className="relative flex flex-col gap-4 pl-6 before:absolute before:top-3 before:bottom-3 before:left-[7px] before:w-px before:bg-border">
            <div className="relative">
              <span className="absolute top-1 -left-6 size-3 rounded-full border-2 border-card bg-success" />
              <div className="flex items-start gap-2">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Telegram</p>
                  <p className="text-xs text-muted-foreground">
                    {telegramAuthorized ? "连接正常" : "等待登录"}
                  </p>
                </div>
              </div>
            </div>
            <div className="relative">
              <span className="absolute top-1 -left-6 size-3 rounded-full border-2 border-card bg-primary" />
              <div className="flex items-start gap-2">
                <ListFilter className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {isAllMessages ? `${enabledFilters} 个启用规则` : (selectedFilter?.name ?? "规则未找到")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAllMessages ? "聚合所有命中" : selectedFilter?.enabled ? "规则已启用" : "规则已停用"}
                  </p>
                </div>
              </div>
            </div>
            <div className="relative">
              <span className="absolute top-1 -left-6 size-3 rounded-full border-2 border-card bg-warning" />
              <div className="flex items-start gap-2">
                <Inbox className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">消息工作区</p>
                  <p className="text-xs text-muted-foreground">等待下一条命中</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">规则状态</p>
            <span className="text-xs font-semibold">
              {isAllMessages ? `${enabledFilters}/${filters.length}` : selectedFilter?.enabled ? "启用" : "停用"}
            </span>
          </div>
          {!isAllMessages && selectedFilter ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">关键词</span>
                <span className="text-xs font-medium">{keywordCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">正则</span>
                <span className="text-xs font-medium">{regexCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">自定义代码</span>
                <span className="text-xs font-medium">{scriptCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">排除条件</span>
                <span className="text-xs font-medium">{excludedConditionCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">会话范围</span>
                <span className="text-xs font-medium">{chatCount || "全部"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LocateFixed className="size-3.5" />
                  自动定位未读
                </span>
                <span className="text-xs font-medium">
                  {selectedFilter.autoLocateUnreadNearRead ? "开启" : "关闭"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <BellRing className="size-3.5" />
                  转发通道
                </span>
                <span className="text-xs font-medium">{selectedFilter.forwardTargetIds.length}</span>
              </div>
            </>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              「全部消息」会聚合所有已启用规则的命中结果。
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
