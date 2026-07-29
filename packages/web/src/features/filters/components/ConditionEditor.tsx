import { Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterConditionType, JoinedChat } from "@/types";
import { conditionTypeOptions, type DraftCondition } from "../types";
import { createDraftCondition } from "../utils";
import { JoinedChatPicker } from "./JoinedChatPicker";

interface ConditionEditorProps {
  condition: DraftCondition;
  index: number;
  chats: JoinedChat[];
  chatsLoading: boolean;
  onUpdate: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemove: (id: string) => void;
  onAppendValues: (id: string) => void;
}

export function ConditionEditor({
  condition,
  index,
  chats,
  chatsLoading,
  onUpdate,
  onRemove,
  onAppendValues,
}: ConditionEditorProps) {
  const definition =
    conditionTypeOptions.find((option) => option.value === condition.type) ??
    conditionTypeOptions[0];
  const inputLabel = condition.type === "regex" ? "正则表达式" : "关键词";
  const inputPlaceholder =
    condition.type === "regex" ? "输入正则后按 Enter" : "输入后按 Enter";

  const handleTypeChange = (nextType: FilterConditionType) => {
    if (nextType === condition.type) return;

    const switchesChatValueModel =
      condition.type === "chat" || nextType === "chat";
    const hasCurrentValues =
      condition.values.length > 0 || Boolean(condition.input.trim());

    if (
      switchesChatValueModel &&
      hasCurrentValues &&
      !window.confirm("切换到不同的取值类型会清空当前内容，是否继续？")
    ) {
      return;
    }

    onUpdate(condition.id, (current) => {
      if (!switchesChatValueModel) {
        return { ...current, type: nextType };
      }

      return {
        ...createDraftCondition(nextType),
        id: current.id,
      };
    });
  };

  return (
    <section className="grid grid-cols-[44px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card/94">
      <div className="grid place-items-center border-r border-border bg-muted/88 px-1 text-[10px] font-bold tracking-wide text-primary">
        {index === 0 ? "当" : "并且"}
      </div>

      <div className="min-w-0 p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{definition.subject}</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(condition.id)}
            aria-label={`删除${definition.label}条件`}
            title="删除条件"
          >
            <Trash2 />
          </Button>
        </div>

        <div className="mt-2 grid items-start gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
          <Select
            value={condition.type}
            onValueChange={(value) => handleTypeChange(value as FilterConditionType)}
          >
            <SelectTrigger size="lg" className="w-full bg-card" aria-label="条件类型">
              <SelectValue>{definition.operatorLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {conditionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.operatorLabel}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {condition.type === "chat" ? (
            <JoinedChatPicker
              items={chats}
              loading={chatsLoading}
              selected={condition.values}
              searchPlaceholder="搜索会话名称或 ID"
              emptyText="没有可选会话"
              onSelectionChange={(values) =>
                onUpdate(condition.id, (current) => ({ ...current, values }))
              }
            />
          ) : (
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input bg-card px-1.5 py-1 shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/18">
              {condition.values.map((value) => (
                <Badge key={value} variant="secondary" className="max-w-full rounded-md">
                  <span className="max-w-64 truncate">{value}</span>
                  <button
                    type="button"
                    className="rounded-sm opacity-60 transition hover:opacity-100"
                    onClick={() =>
                      onUpdate(condition.id, (current) => ({
                        ...current,
                        values: current.values.filter((item) => item !== value),
                      }))
                    }
                    aria-label={`删除${value}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                name={`condition-${condition.id}`}
                aria-label={inputLabel}
                placeholder={
                  condition.values.length === 0
                    ? inputPlaceholder
                    : "继续输入"
                }
                value={condition.input}
                onChange={(event) =>
                  onUpdate(condition.id, (current) => ({
                    ...current,
                    input: event.target.value,
                  }))
                }
                onBlur={() => onAppendValues(condition.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAppendValues(condition.id);
                  }
                }}
                className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0"
              />
            </div>
          )}
        </div>

        <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
          {definition.description}（OR）
        </p>
      </div>
    </section>
  );
}
