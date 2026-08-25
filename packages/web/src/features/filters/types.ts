import type { FilterConditionEffect, FilterConditionType } from "@/types";

export type DraftCondition = {
  id: string;
  type: FilterConditionType;
  effect?: FilterConditionEffect;
  values: string[];
  input: string;
};

export type ConditionTypeDefinition = {
  value: FilterConditionType;
  label: string;
  subject: string;
  operatorLabel: string;
  description: string;
};

/**
 * 条件注册表是规则编辑器的扩展边界。
 * 后续新增发送者、媒体类型或时间范围时，先在这里描述用户可见语义，
 * 再为该类型提供对应的值编辑器，而不是重写整个过滤器页面。
 */
export const conditionTypeDefinitions = {
  chat: {
    value: "chat",
    label: "消息来源",
    subject: "消息来源",
    operatorLabel: "来自任一会话",
    description: "已选会话之间满足任意一个即可",
  },
  keyword: {
    value: "keyword",
    label: "关键词",
    subject: "消息内容",
    operatorLabel: "包含任一关键词",
    description: "关键词之间满足任意一个即可，大小写不敏感",
  },
  regex: {
    value: "regex",
    label: "正则表达式",
    subject: "消息内容",
    operatorLabel: "匹配任一表达式",
    description: "表达式之间满足任意一个即可",
  },
  script: {
    value: "script",
    label: "自定义代码",
    subject: "消息内容",
    operatorLabel: "自定义 JavaScript",
    description: "代码同步返回 true 时条件成立",
  },
} satisfies Record<FilterConditionType, ConditionTypeDefinition>;

export const conditionTypeOptions = Object.values(conditionTypeDefinitions);
