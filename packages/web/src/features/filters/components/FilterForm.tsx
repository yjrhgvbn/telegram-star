import { AlertCircle, LoaderCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ForwardTarget, JoinedChat } from "@/types";
import type { DraftCondition } from "../types";
import { ConditionEditor } from "./ConditionEditor";

interface FilterFormProps {
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
  onUpdateCondition: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemoveCondition: (id: string) => void;
  onAppendValues: (id: string) => void;
  onAddCondition: () => void;
}

export function FilterForm({
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
  onUpdateCondition,
  onRemoveCondition,
  onAppendValues,
  onAddCondition,
}: FilterFormProps) {
  const visibleConditions = [...conditions].sort(
    (a, b) => Number(b.type === "chat") - Number(a.type === "chat"),
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <Card
        id="conditions"
        role="region"
        aria-label="命中条件"
        size="sm"
        className="bg-card/96"
      >
        <CardHeader className="sr-only">
          <CardTitle>命中条件</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs leading-5 text-destructive"
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
            className="w-full border-dashed bg-card/72 text-xs text-primary shadow-none"
            onClick={onAddCondition}
          >
            <Plus data-icon="inline-start" />
            添加一个必须同时满足的条件
          </Button>
        </CardContent>
      </Card>

      <Card id="actions" size="sm" className="bg-card/96">
        <CardHeader>
          <CardTitle>发送通知</CardTitle>
          <CardDescription>
            {selectedForwardTargetIds.length > 0
              ? "命中后同步发送到已选通道"
              : "可选择多个通知通道"}
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
                  : "未选择"}
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
            <p className="flex min-h-9 items-center text-xs text-muted-foreground">
              暂无通知通道，创建后即可启用
            </p>
          ) : (
            <div className="flex min-h-8 flex-wrap gap-1.5">
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
          )}
        </CardContent>

        <CardFooter className="justify-between gap-4 bg-card px-3 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">打开时定位未读</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              只影响打开消息时的位置
            </span>
          </span>
          <Switch
            checked={autoLocateUnreadNearRead}
            onCheckedChange={onAutoLocateChange}
            aria-label="打开时自动定位未读"
            className="scale-110"
          />
        </CardFooter>
      </Card>
    </div>
  );
}
