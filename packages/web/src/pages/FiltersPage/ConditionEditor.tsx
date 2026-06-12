import { Trash2 } from "lucide-react";
import { JoinedChatPicker } from "./components/JoinedChatPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  return (
    <Card className="border border-border/70 bg-background/60" size="sm">
      <CardContent className="space-y-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-muted-foreground">条件类型</label>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(condition.id)}>
              <Trash2 />
            </Button>
          </div>
          <Select
            value={condition.type}
            onValueChange={(value) =>
              onUpdate(condition.id, () => ({
                ...createDraftCondition(value as FilterConditionType),
                id: condition.id,
              }))
            }
          >
            <SelectTrigger className="w-full justify-between">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conditionTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {condition.type === "keyword" ? (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">关键词值</label>
            <div className="flex gap-2">
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
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => onAppendKeywords(condition.id)}>
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {condition.values.length === 0 ? (
                <span className="text-xs text-muted-foreground">尚未添加{typeLabel}</span>
              ) : (
                condition.values.map((value) => (
                  <Badge key={value} variant="secondary" className="gap-1">
                    {value}
                    <button
                      type="button"
                      className="text-xs opacity-70 hover:opacity-100"
                      onClick={() =>
                        onUpdate(condition.id, (current) => ({
                          ...current,
                          values: current.values.filter((item) => item !== value),
                        }))
                      }
                    >
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">选择{typeLabel}</label>
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
      </CardContent>
    </Card>
  );
}
