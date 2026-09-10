import { useId } from "react";
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
import { cn } from "@/lib/utils";
import type { FilterConditionEffect, FilterConditionType, JoinedChat } from "@/types";
import { conditionTypeDefinitions, type DraftCondition } from "../types";
import { assertValidRegexConditions, assertValidScriptConditions, assertValidSenderConditions, normalizeConditions } from "../utils";
import { JoinedChatPicker } from "./JoinedChatPicker";

type ContentConditionType = Exclude<FilterConditionType, "chat">;

const contentConditionTypeOptions: Array<{ value: ContentConditionType; label: string }> = [
  { value: "keyword", label: "关键词包含" },
  { value: "sender", label: "发送者用户 ID" },
  { value: "regex", label: "正则匹配" },
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

function getConditionError(condition: DraftCondition): string {
  if (condition.type !== "regex" && condition.type !== "script" && condition.type !== "sender") return "";
  try {
    const normalized = normalizeConditions([condition]);
    assertValidRegexConditions(normalized);
    assertValidScriptConditions(normalized);
    assertValidSenderConditions(normalized);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "条件无效";
  }
}

export function ConditionEditor({
  condition,
  chats,
  chatsLoading,
  removable,
  onUpdate,
  onRemove,
  onAppendValues,
}: ConditionEditorProps) {
  const validationId = useId();
  const descriptionId = useId();
  const definition = conditionTypeDefinitions[condition.type];
  const isSender = condition.type === "sender";
  const inputLabel = isSender ? "发送者用户 ID" : condition.type === "regex" ? "正则表达式" : "关键词";
  const inputPlaceholder = isSender ? "例如 123456789" : condition.type === "regex" ? "添加正则…" : "添加关键词…";
  const ValueInput = isSender ? Textarea : Input;
  const selectedContentType = contentConditionTypeOptions.find((option) => option.value === condition.type);
  const error = getConditionError(condition);

  const handleTypeChange = (value: string | null) => {
    const option = contentConditionTypeOptions.find((item) => item.value === value);
    if (!option) return;

    onUpdate(condition.id, (current) => {
      // 用户 ID 与正文条件的值语义不同，切换时清空，防止意外继承条件。
      const resetsValues = [current.type, option.value].some((type) => type === "script" || type === "sender");
      return {
        ...current,
        type: option.value,
        ...(resetsValues && current.type !== option.value ? { values: [], input: "" } : {}),
      };
    });
  };

  return (
    <div
      className={cn("rules-condition-entry", condition.type === "chat" && "rules-condition-entry--source", isSender && "rules-condition-entry--sender")}
      data-condition-id={condition.id}
      data-invalid={error ? "" : undefined}
    >
      {condition.type !== "chat" ? (
        <Select items={contentConditionTypeOptions} value={selectedContentType?.value} onValueChange={handleTypeChange}>
          <SelectTrigger size="lg" className="rules-condition-type" aria-label="消息内容匹配方式">
            <SelectValue>{selectedContentType?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent className="rules-theme" align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {contentConditionTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}

      {condition.type === "chat" ? (
        <div className="rules-condition-source__picker">
          <JoinedChatPicker
            items={chats}
            loading={chatsLoading}
            label="全部会话"
            selected={condition.values}
            searchPlaceholder="搜索会话名称或 ID"
            emptyText="没有可选会话"
            onSelectionChange={(values) => onUpdate(condition.id, (current) => ({ ...current, values }))}
          />
        </div>
      ) : condition.type === "script" ? (
        <Textarea
          name={`condition-${condition.id}`}
          aria-label="JavaScript 代码"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? validationId : undefined}
          placeholder={scriptPlaceholder}
          value={condition.input}
          spellCheck={false}
          onChange={(event) => onUpdate(condition.id, (current) => ({ ...current, input: event.target.value }))}
          className="rules-condition-script"
        />
      ) : (
        <div className="rules-condition-values">
          {condition.values.map((value, index) => (
            <span key={value} className="rules-condition-choice">
              {index > 0 ? <span className="rules-condition-value-or">或</span> : null}
              <Badge variant="secondary" className="rules-condition-token">
                <span className="rules-condition-token__text" title={value}>{value}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rules-condition-token__remove"
                  onClick={() => onUpdate(condition.id, (current) => ({
                    ...current,
                    values: current.values.filter((item) => item !== value),
                  }))}
                  aria-label={`删除${value}`}
                >
                  <X />
                </Button>
              </Badge>
            </span>
          ))}
          <ValueInput
            name={`condition-${condition.id}`}
            aria-label={inputLabel}
            aria-invalid={Boolean(error)}
            aria-describedby={[error ? validationId : "", isSender ? descriptionId : ""].filter(Boolean).join(" ") || undefined}
            placeholder={inputPlaceholder}
            value={condition.input}
            onChange={(event) => onUpdate(condition.id, (current) => ({ ...current, input: event.target.value }))}
            onBlur={() => onAppendValues(condition.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onAppendValues(condition.id);
              }
            }}
            className={cn("rules-condition-input", isSender && "rules-condition-input--sender")}
          />
        </div>
      )}

      {removable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rules-condition-remove"
          onClick={() => onRemove(condition.id)}
          aria-label={`删除${definition.label}备选条件`}
          title="删除条件"
        >
          <X />
        </Button>
      ) : null}
      {isSender ? (
        <p id={descriptionId} className="rules-condition-description">
          多个 ID 用逗号或换行分隔，满足任意一个即可。匹配当前发送者，转发按转发人；匿名或频道身份无法匹配真实用户。
        </p>
      ) : null}
      {error ? <p id={validationId} className="rules-condition-error" role="alert">{error}</p> : null}
    </div>
  );
}
