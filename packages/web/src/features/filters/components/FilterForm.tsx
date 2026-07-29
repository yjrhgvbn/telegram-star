import { useEffect, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Filter, ForwardTarget, JoinedChat } from "@/types";
import type { DraftCondition } from "../types";
import { ConditionEditor } from "./ConditionEditor";
import { RuleSummary } from "./RuleSummary";

interface FilterFormProps {
  selectedFilter: Filter | null;
  autoLocateUnreadNearRead: boolean;
  onAutoLocateChange: (value: boolean) => void;
  chats: JoinedChat[];
  chatsLoading: boolean;
  forwardTargets: ForwardTarget[];
  selectedForwardTargetIds: number[];
  forwardTargetsLoading: boolean;
  onToggleForwardTarget: (id: number) => void;
  onCreateForwardTarget: () => void;
  conditions: DraftCondition[];
  error: string;
  saving: boolean;
  onUpdateCondition: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemoveCondition: (id: string) => void;
  onAppendValues: (id: string) => void;
  onAddCondition: () => void;
  onDelete: () => void;
}

export function FilterForm({
  selectedFilter,
  autoLocateUnreadNearRead,
  onAutoLocateChange,
  chats,
  chatsLoading,
  forwardTargets,
  selectedForwardTargetIds,
  forwardTargetsLoading,
  onToggleForwardTarget,
  onCreateForwardTarget,
  conditions,
  error,
  saving,
  onUpdateCondition,
  onRemoveCondition,
  onAppendValues,
  onAddCondition,
  onDelete,
}: FilterFormProps) {
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const actionCount = 1 + (selectedForwardTargetIds.length > 0 ? 1 : 0);
  const visibleConditions = [...conditions].sort(
    (a, b) => Number(b.type === "chat") - Number(a.type === "chat"),
  );

  useEffect(() => {
    setDeleteConfirming(false);
  }, [selectedFilter?.id]);

  const handleDeleteClick = () => {
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }

    setDeleteConfirming(false);
    onDelete();
  };

  return (
    <div className="flex min-w-0 flex-col bg-card/42">
      <section id="conditions">
        <header className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-border bg-card/72 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">判断是否命中</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              以下条件需要全部满足
            </p>
          </div>
          <div className="rounded-lg border border-input bg-card px-3 py-2 text-[11px] font-semibold text-foreground shadow-xs">
            全部满足（AND）
          </div>
        </header>

        <div className="px-4 pt-3 pb-4">
          {error ? (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs leading-5 text-destructive"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {visibleConditions.map((condition, index) => (
              <ConditionEditor
                key={condition.id}
                condition={condition}
                index={index}
                chats={chats}
                chatsLoading={chatsLoading}
                onUpdate={onUpdateCondition}
                onRemove={onRemoveCondition}
                onAppendValues={onAppendValues}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full border-dashed bg-card/38 text-xs text-primary shadow-none"
            onClick={onAddCondition}
          >
            <Plus data-icon="inline-start" />
            添加一个必须同时满足的条件
          </Button>

          <RuleSummary
            conditions={conditions}
            chats={chats}
            forwardTargets={forwardTargets}
            selectedForwardTargetIds={selectedForwardTargetIds}
          />
        </div>
      </section>

      <section
        id="actions"
        className="border-t border-border bg-card/58"
      >
        <header className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">命中后执行</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              保存固定开启；选择通知通道即可增加发送动作
            </p>
          </div>
          <Badge variant="secondary" className="rounded-md">
            已启用 {actionCount} 项
          </Badge>
        </header>

        <Separator />

        <div className="grid gap-2 p-4 lg:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>保存消息</CardTitle>
              <CardDescription>
                每条命中的消息都会进入消息列表
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">始终开启</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex h-9 items-center justify-between gap-2 rounded-md bg-secondary px-3 text-xs">
                <span className="truncate text-muted-foreground">命中消息</span>
                <span aria-hidden className="text-primary">→</span>
                <span className="truncate font-medium text-secondary-foreground">
                  消息列表
                </span>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>发送通知</CardTitle>
              <CardDescription>
                {selectedForwardTargetIds.length > 0
                  ? "命中后同步发送到已选通道"
                  : "选择至少一个通道后启用"}
              </CardDescription>
              <CardAction>
                {forwardTargets.length === 0 && !forwardTargetsLoading ? (
                  <Button type="button" variant="outline" size="sm" onClick={onCreateForwardTarget}>
                    <Plus data-icon="inline-start" />
                    新建通道
                  </Button>
                ) : (
                  <Badge
                    variant={selectedForwardTargetIds.length > 0 ? "secondary" : "outline"}
                  >
                    {selectedForwardTargetIds.length > 0
                      ? `已选 ${selectedForwardTargetIds.length} 个`
                      : "可选"}
                  </Badge>
                )}
              </CardAction>
            </CardHeader>

            <CardContent>
              {forwardTargetsLoading ? (
                <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  读取通知通道中…
                </div>
              ) : forwardTargets.length === 0 ? (
                <p className="flex h-9 items-center text-xs text-muted-foreground">
                  暂无通知通道，创建后即可启用
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>通知通道</span>
                    <span>点击切换，可多选</span>
                  </div>
                  <div className="flex min-h-7 flex-wrap gap-1.5">
                    {forwardTargets.map((target) => {
                      const checked = selectedForwardTargetIds.includes(target.id);
                      return (
                        <Button
                          key={target.id}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          variant={checked ? "secondary" : "outline"}
                          size="sm"
                          className={cn(!target.enabled && !checked && "opacity-65")}
                          onClick={() => onToggleForwardTarget(target.id)}
                        >
                          <span aria-hidden>{checked ? "✓" : "+"}</span>
                          {target.name}
                          {!target.enabled ? " · 停用" : null}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section
        aria-label="阅读偏好与规则管理"
        className="border-t border-border bg-card/42 px-4 py-1"
      >
        <div className="flex items-center gap-3 py-3">
          <span className="size-2 shrink-0 rounded-full bg-muted-foreground/38" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">打开时定位未读</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              阅读偏好，只影响打开消息时的位置。
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoLocateUnreadNearRead}
            aria-label="打开时自动定位未读"
            className={cn(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
              autoLocateUnreadNearRead ? "bg-primary" : "bg-muted-foreground/25",
            )}
            onClick={() => onAutoLocateChange(!autoLocateUnreadNearRead)}
          >
            <span
              className={cn(
                "size-5 rounded-full bg-card shadow-sm transition",
                autoLocateUnreadNearRead && "translate-x-5",
              )}
            />
          </button>
        </div>

        {selectedFilter ? (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2 py-3">
              <div className="mr-auto min-w-48">
                <div className="text-sm font-medium">规则管理</div>
                <div className="text-xs text-muted-foreground">
                  当前规则{selectedFilter.enabled ? "正在监听" : "已停止监听"}。
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={deleteConfirming ? "destructive" : "outline"}
                onClick={handleDeleteClick}
                disabled={saving}
                className={cn(
                  !deleteConfirming &&
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <Trash2 data-icon="inline-start" />
                {deleteConfirming ? "确认删除" : "删除"}
              </Button>
              {deleteConfirming ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirming(false)}
                >
                  取消
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
