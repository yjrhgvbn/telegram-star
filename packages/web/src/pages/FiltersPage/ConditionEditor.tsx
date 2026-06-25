import { Hash, MessageSquareText, Plus, Trash2, X } from "lucide-react";
import { JoinedChatPicker } from "./components/JoinedChatPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FilterConditionType } from "@/types";
import { conditionTypeOptions, type DraftCondition } from "./types";
import { createDraftCondition } from "./utils";

interface ConditionEditorProps {
  condition: DraftCondition;
  onUpdate: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemove: (id: string) => void;
  onAppendKeywords: (id: string) => void;
}

export function ConditionEditor({ condition, onUpdate, onRemove, onAppendKeywords }: ConditionEditorProps) {
  const typeLabel = conditionTypeOptions.find((option) => option.value === condition.type)?.label ?? "条件";
  const TypeIcon = condition.type === "keyword" ? Hash : MessageSquareText;

  return (
    <section className="rounded-lg bg-background/70 p-3 shadow-sm ring-1 ring-foreground/10">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TypeIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{typeLabel}条件</div>
              <div className="text-xs text-muted-foreground">
                {condition.values.length} 个已选取值
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted/70 p-1">
              {conditionTypeOptions.map((option) => {
                const active = condition.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() =>
                      onUpdate(condition.id, () => ({
                        ...createDraftCondition(option.value as FilterConditionType),
                        id: condition.id,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(condition.id)}>
              <Trash2 />
            </Button>
          </div>
        </div>

        {condition.type === "keyword" ? (
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="输入关键词，多个请用逗号分隔"
                value={condition.input}
                onChange={(event) =>
                  onUpdate(condition.id, (current) => ({ ...current, input: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAppendKeywords(condition.id);
                  }
                }}
                className="h-10 bg-card/75"
              />
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="sm:w-24"
                onClick={() => onAppendKeywords(condition.id)}
              >
                <Plus data-icon="inline-start" />
                添加
              </Button>
            </div>
            <div className="flex min-h-8 flex-wrap gap-1.5">
              {condition.values.length === 0 ? (
                <span className="rounded-md bg-muted/55 px-2.5 py-1.5 text-xs text-muted-foreground">
                  尚未添加{typeLabel}
                </span>
              ) : (
                condition.values.map((value) => (
                  <Badge key={value} variant="secondary" className="h-7 gap-1 rounded-md px-2.5">
                    {value}
                    <button
                      type="button"
                      className="rounded-sm opacity-65 transition hover:opacity-100"
                      onClick={() =>
                        onUpdate(condition.id, (current) => ({
                          ...current,
                          values: current.values.filter((item) => item !== value),
                        }))
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <JoinedChatPicker
              label="已选"
              selected={condition.values}
              searchPlaceholder={`搜索${typeLabel}名称或 ID`}
              emptyText={`没有可选${typeLabel}`}
              onSelectionChange={(values) =>
                onUpdate(condition.id, (current) => ({ ...current, values }))
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
