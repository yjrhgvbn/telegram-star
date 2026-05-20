import type { FilterConditionType } from "@/types";

export type DraftCondition = {
  id: string;
  type: FilterConditionType;
  values: string[];
  input: string;
};

export const conditionTypeOptions: Array<{ value: FilterConditionType; label: string }> = [
  { value: "keyword", label: "关键词" },
  { value: "chat", label: "会话" },
];
