import { X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  FilterConditionEffect,
  FilterConditionType,
  JoinedChat,
} from "@/types";
import { conditionTypeDefinitions, type DraftCondition } from "../types";
import { JoinedChatPicker } from "./JoinedChatPicker";

type ContentConditionType = Exclude<FilterConditionType, "chat">;

const contentConditionTypeOptions: Array<{
  value: ContentConditionType;
  label: string;
}> = [
  { value: "keyword", label: "关键词" },
  { value: "regex", label: "正则表达式" },
  { value: "script", label: "JavaScript" },
];

const scriptPlaceholder = `return message.content.includes("红包")
  && /(?:^|\\D)300(?:\\D|$)/.test(message.content);`;

interface ConditionEditorProps {
  condition: DraftCondition;
  groupEffect: FilterConditionEffect;
  chats: JoinedChat[];
  chatsLoading: boolean;
  removable: boolean;
  onUpdate: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemove: (id: string) => void;
  onAppendValues: (id: string) => void;
}

export function ConditionEditor({
  condition,
  groupEffect,
  chats,
  chatsLoading,
  removable,
  onUpdate,
  onRemove,
  onAppendValues,
}: ConditionEditorProps) {
  const definition = conditionTypeDefinitions[condition.type];
  const inputLabel = condition.type === "regex" ? "正则表达式" : "关键词";
  const inputPlaceholder =
    condition.type === "regex" ? "输入正则后按 Enter" : "输入后按 Enter";
  const selectedContentType = condition.type === "chat"
    ? null
    : contentConditionTypeOptions.find((option) => option.value === condition.type) ??
      contentConditionTypeOptions[0];
  const description = condition.type === "chat" && condition.values.length === 0
    ? "未指定会话时，匹配全部会话"
    : condition.type === "script"
      ? groupEffect === "exclude"
        ? "代码同步返回 true 时排除整个规则"
        : "代码同步返回 true 时满足这一项"
      : groupEffect === "exclude"
        ? `${definition.description}；任一值出现就排除整个规则`
        : `${definition.description}（OR）`;

  const handleTypeChange = (value: string | null) => {
    const option = contentConditionTypeOptions.find((item) => item.value === value);
    if (!option) return;

    onUpdate(condition.id, (current) => {
      const switchesScriptMode = current.type === "script" || option.value === "script";
      return {
        ...current,
        type: option.value,
        ...(switchesScriptMode && current.type !== option.value
          ? { values: [], input: "" }
          : {}),
      };
    });
  };

  return (
    <div className="group/condition min-w-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)_28px]">
        {condition.type === "chat" ? (
          <div className="col-start-1 row-start-1 flex h-9 w-full items-center rounded-lg border border-border bg-muted/55 px-2.5 text-sm font-medium text-foreground">
            <span className="truncate">{definition.operatorLabel}</span>
          </div>
        ) : (
          <Select
            items={contentConditionTypeOptions}
            value={selectedContentType?.value}
            onValueChange={handleTypeChange}
          >
            <SelectTrigger
              size="lg"
              className="col-start-1 row-start-1 w-full bg-card"
              aria-label="消息内容匹配方式"
            >
              <SelectValue>{selectedContentType?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                {contentConditionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}

        <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {condition.type === "chat" ? (
            <JoinedChatPicker
              items={chats}
              loading={chatsLoading}
              label="全部会话"
              selected={condition.values}
              searchPlaceholder="搜索会话名称或 ID"
              emptyText="没有可选会话"
              onSelectionChange={(values) =>
                onUpdate(condition.id, (current) => ({ ...current, values }))
              }
            />
          ) : condition.type === "script" ? (
            <Textarea
              name={`condition-${condition.id}`}
              aria-label="JavaScript 代码"
              placeholder={scriptPlaceholder}
              value={condition.input}
              spellCheck={false}
              onChange={(event) =>
                onUpdate(condition.id, (current) => ({
                  ...current,
                  input: event.target.value,
                }))
              }
              className="min-h-28 resize-y bg-card font-mono text-xs leading-5"
            />
          ) : (
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1 rounded-lg border border-input bg-card px-1.5 py-1 shadow-xs transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/18">
              {condition.values.map((value) => (
                <Badge key={value} variant="secondary" className="max-w-full rounded-md pr-0.5">
                  <span className="max-w-64 truncate">{value}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="-mr-0.5 opacity-60 hover:opacity-100"
                    onClick={() =>
                      onUpdate(condition.id, (current) => ({
                        ...current,
                        values: current.values.filter((item) => item !== value),
                      }))
                    }
                    aria-label={`删除${value}`}
                  >
                    <X />
                  </Button>
                </Badge>
              ))}
              <Input
                name={`condition-${condition.id}`}
                aria-label={inputLabel}
                placeholder={condition.values.length === 0 ? inputPlaceholder : "继续输入"}
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

        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="col-start-2 row-start-1 mt-1 justify-self-end opacity-70 sm:col-start-3 sm:opacity-0 sm:group-hover/condition:opacity-70 sm:focus-visible:opacity-100"
            onClick={() => onRemove(condition.id)}
            aria-label={`删除${definition.label}备选条件`}
            title="删除备选条件"
          >
            <X />
          </Button>
        ) : (
          <span className="hidden sm:col-start-3 sm:row-start-1 sm:block" aria-hidden />
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground sm:pr-8">
        {description}
        {condition.type === "script"
          ? "；可读取 message.chatId 和 message.content，也可返回 { matched, matchedText?, matchedTexts? }"
          : null}
      </p>
    </div>
  );
}
