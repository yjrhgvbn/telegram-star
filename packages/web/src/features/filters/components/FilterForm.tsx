import { useEffect, useState } from "react";
import { AlertCircle, BellRing, CheckCircle2, LoaderCircle, LocateFixed, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Filter, ForwardTarget } from "@/types";
import { ConditionEditor } from "./ConditionEditor";
import type { DraftCondition } from "../types";

interface FilterFormProps {
  selectedFilter: Filter | null;
  name: string;
  onNameChange: (name: string) => void;
  autoLocateUnreadNearRead: boolean;
  onAutoLocateChange: (value: boolean) => void;
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
  onSave: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

export function FilterForm({
  selectedFilter,
  name,
  onNameChange,
  autoLocateUnreadNearRead,
  onAutoLocateChange,
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
  onSave,
  onDelete,
  onToggle,
}: FilterFormProps) {
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const conditionValueCount = conditions.reduce(
    (count, condition) => count + condition.values.length + (condition.input.trim() ? 1 : 0),
    0,
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
    <Card className="bg-card/88" size="sm">
      <CardHeader className="border-b px-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {selectedFilter ? "规则编辑" : "创建规则"}
            </CardTitle>
            <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span>{conditions.length} 个条件</span>
              <span>·</span>
              <span>{conditionValueCount} 个取值</span>
            </div>
          </div>
          <Badge
            variant={selectedFilter?.enabled === false ? "outline" : "secondary"}
            className={cn(
              selectedFilter?.enabled === false ? "text-muted-foreground" : "text-success",
            )}
          >
            <CheckCircle2 data-icon="inline-start" />
            {selectedFilter ? (selectedFilter.enabled ? "已启用" : "已停用") : "草稿"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-3">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">过滤器名称</label>
          <Input
            placeholder="例如：项目公告 / 值班提醒观察"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-9 bg-background/76 text-base md:text-sm"
          />
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={autoLocateUnreadNearRead}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg bg-muted/42 px-3 py-2.5 text-left transition-colors hover:bg-muted/65",
            autoLocateUnreadNearRead && "bg-accent/45",
          )}
          onClick={() => onAutoLocateChange(!autoLocateUnreadNearRead)}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md",
              autoLocateUnreadNearRead ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <LocateFixed className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">自动定位未读</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {autoLocateUnreadNearRead ? "靠近最近已读消息打开" : "按默认顺序打开"}
            </span>
          </span>
          <span
            className={cn(
              "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
              autoLocateUnreadNearRead ? "bg-primary" : "bg-muted-foreground/25",
            )}
          >
            <span
              className={cn(
                "size-5 rounded-full bg-white shadow-sm transition",
                autoLocateUnreadNearRead && "translate-x-5",
              )}
            />
          </span>
        </button>

        <div className="flex flex-col gap-3 rounded-lg bg-muted/42 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <BellRing className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">命中后转发到</div>
                <div className="text-xs text-muted-foreground">
                  {selectedForwardTargetIds.length} 个转发通道
                </div>
              </div>
            </div>
            {forwardTargets.length === 0 && !forwardTargetsLoading && (
              <Button type="button" variant="outline" size="sm" onClick={onCreateForwardTarget}>
                <Plus data-icon="inline-start" />
                新建通道
              </Button>
            )}
          </div>

          {forwardTargetsLoading ? (
            <div className="flex min-h-10 items-center gap-2 rounded-md bg-background/62 px-3 text-sm text-muted-foreground">
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
              读取转发通道中
            </div>
          ) : forwardTargets.length === 0 ? (
            <div className="rounded-md bg-background/62 px-3 py-2.5 text-sm text-muted-foreground">
              暂无可用转发通道
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {forwardTargets.map((target) => {
                const checked = selectedForwardTargetIds.includes(target.id);
                return (
                  <button
                    key={target.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                      checked
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground",
                      !target.enabled && !checked && "opacity-65",
                    )}
                    onClick={() => onToggleForwardTarget(target.id)}
                  >
                    {target.name}
                    {!target.enabled ? " · 停用" : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">匹配条件</div>
              <div className="text-xs text-muted-foreground">会话条件会合并保存</div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onAddCondition}>
              <Plus data-icon="inline-start" />
              添加
            </Button>
          </div>

          {conditions.map((condition) => (
            <ConditionEditor
              key={condition.id}
              condition={condition}
              onUpdate={onUpdateCondition}
              onRemove={onRemoveCondition}
              onAppendValues={onAppendValues}
            />
          ))}
        </div>

      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-1.5">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {selectedFilter ? "保存修改" : "创建过滤器"}
          </Button>
          {selectedFilter && (
            <>
              <Button type="button" variant="outline" onClick={onToggle}>
                {selectedFilter.enabled ? "停用过滤器" : "启用过滤器"}
              </Button>
              <Button
                type="button"
                variant={deleteConfirming ? "destructive" : "outline"}
                onClick={handleDeleteClick}
                disabled={saving}
                className={cn(
                  !deleteConfirming && "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <Trash2 data-icon="inline-start" />
                {deleteConfirming ? "确认删除" : "删除"}
              </Button>
              {deleteConfirming && (
                <Button type="button" variant="ghost" onClick={() => setDeleteConfirming(false)}>
                  取消
                </Button>
              )}
            </>
          )}
      </CardFooter>
    </Card>
  );
}
