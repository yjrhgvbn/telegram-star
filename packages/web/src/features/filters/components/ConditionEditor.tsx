import { ArrowUpDown, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
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
  index: number;
  chats: JoinedChat[];
  chatsLoading: boolean;
  removable: boolean;
  onUpdate: (id: string, updater: (condition: DraftCondition) => DraftCondition) => void;
  onRemove: (id: string) => void;
  onAppendValues: (id: string) => void;
}

export function ConditionEditor({
  condition,
  index,
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
      ? condition.effect === "exclude"
        ? "代码同步返回 true 时排除该消息"
        : "代码同步返回 true 时命中该条件"
      : condition.effect === "exclude"
        ? `${definition.description}；任一值出现就排除（NOT）`
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

  const handleEffectToggle = () => {
    if (condition.type === "chat") return;

    onUpdate(condition.id, (current) => ({
      ...current,
      effect: current.effect === "exclude" ? "require" : "exclude",
    }));
  };

  const isExcluded = condition.effect === "exclude";
  const effectToggleLabel = isExcluded
    ? "当前为命中排除，点击切换为必须满足"
    : "当前为必须满足，点击切换为命中排除";

  return (
    <section className="grid grid-cols-[48px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card/94">
      <div className="border-r border-border bg-muted/55">
        {condition.type === "chat" ? (
          <span className="flex h-full min-h-12 items-center justify-center px-1 text-xs font-semibold tracking-wide text-primary">
            {index === 0 ? "当" : "并且"}
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
            onClick={handleEffectToggle}
          >
            <span
              className={cn(
                "text-xs font-semibold tracking-wide transition-colors",
                isExcluded ? "text-destructive" : "text-primary",
              )}
            >
              {isExcluded ? "排除" : index === 0 ? "当" : "并且"}
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
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold">{definition.subject}</h3>
          {removable ? (
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
          ) : null}
        </div>

        <div className="mt-2 grid items-start gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
          {condition.type === "chat" ? (
            <div className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/55 px-2.5 text-sm font-medium text-foreground">
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
                className="w-full bg-card"
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
              className="min-h-36 resize-y bg-card font-mono text-xs leading-5 sm:col-span-2"
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
          {description}
          {condition.type === "script"
            ? "；可读取 message.chatId 和 message.content，也可返回 { matched, matchedText?, matchedTexts? }"
            : null}
        </p>
      </div>
    </section>
  );
}
