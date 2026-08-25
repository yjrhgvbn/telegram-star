import { ArrowUpDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { JoinedChat } from "@/types";
import {
  conditionTypeDefinitions,
  type DraftCondition,
  type DraftConditionGroup,
} from "../types";
import { ConditionEditor } from "./ConditionEditor";

interface ConditionGroupEditorProps {
  group: DraftConditionGroup;
  index: number;
  chats: JoinedChat[];
  chatsLoading: boolean;
  removable: boolean;
  onUpdateCondition: (
    id: string,
    updater: (condition: DraftCondition) => DraftCondition,
  ) => void;
  onRemoveCondition: (id: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleEffect: (groupId: string) => void;
  onAppendValues: (id: string) => void;
  onAddAlternative: (groupId: string) => void;
}

export function ConditionGroupEditor({
  group,
  index,
  chats,
  chatsLoading,
  removable,
  onUpdateCondition,
  onRemoveCondition,
  onRemoveGroup,
  onToggleEffect,
  onAppendValues,
  onAddAlternative,
}: ConditionGroupEditorProps) {
  const isChatGroup = group.conditions.every((condition) => condition.type === "chat");
  const isExcluded = group.effect === "exclude";
  const subject = isChatGroup
    ? "消息来源"
    : group.conditions.every(
        (condition) => conditionTypeDefinitions[condition.type].subject === "消息内容",
      )
      ? "消息内容"
      : "备选条件";
  const railLabel = isExcluded ? "排除" : index === 0 ? "当" : "并且";
  const effectToggleLabel = isExcluded
    ? "当前为整组排除，点击切换为必须满足"
    : "当前为必须满足，点击切换为整组排除";

  return (
    <section className="grid grid-cols-[48px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card/94">
      <div className="border-r border-border bg-muted/55">
        {isChatGroup ? (
          <span className="flex h-full min-h-12 items-center justify-center px-1 text-xs font-semibold tracking-wide text-primary">
            {railLabel}
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-full min-h-12 w-full cursor-pointer flex-col gap-1 rounded-none px-0 py-0 transition-colors hover:bg-muted/85 has-data-[icon=inline-end]:px-0 focus-visible:ring-inset"
            aria-label={effectToggleLabel}
            aria-pressed={isExcluded}
            title={effectToggleLabel}
            onClick={() => onToggleEffect(group.id)}
          >
            <span
              className={cn(
                "text-xs font-semibold tracking-wide transition-colors",
                isExcluded ? "text-destructive" : "text-primary",
              )}
            >
              {railLabel}
            </span>
            <ArrowUpDown
              data-icon="inline-end"
              aria-hidden="true"
              className={cn(
                "opacity-50 sm:hidden",
                isExcluded ? "text-destructive/70" : "text-muted-foreground",
              )}
            />
          </Button>
        )}
      </div>

      <div className="min-w-0 p-3">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{subject}</h3>
          <div className="flex shrink-0 items-center gap-0.5">
            {!isChatGroup ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-primary"
                onClick={() => onAddAlternative(group.id)}
              >
                <Plus data-icon="inline-start" />
                备选条件
              </Button>
            ) : null}
            {removable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveGroup(group.id)}
                aria-label={`删除${subject}条件组`}
                title="删除条件组"
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex flex-col">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id}>
              {conditionIndex > 0 ? (
                <div className="flex h-8 items-center gap-3 pr-8 text-[11px] text-muted-foreground">
                  <Separator className="flex-1" />
                  <span>或者</span>
                  <Separator className="flex-1" />
                </div>
              ) : null}
              <ConditionEditor
                condition={condition}
                groupEffect={group.effect}
                chats={chats}
                chatsLoading={chatsLoading}
                removable={group.conditions.length > 1}
                onUpdate={onUpdateCondition}
                onRemove={onRemoveCondition}
                onAppendValues={onAppendValues}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
