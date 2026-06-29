import { z } from "zod";

export const FORWARD_TEMPLATE_VARIABLES = [
  "filterName",
  "matchedKeyword",
  "chatTitle",
  "senderName",
  "senderId",
  "messageDate",
  "content",
  "telegramLink",
] as const;

export type ForwardTemplateVariable = (typeof FORWARD_TEMPLATE_VARIABLES)[number];

export type ForwardTemplatePayload = Record<ForwardTemplateVariable, string | number | null | undefined>;

export const FORWARD_TEMPLATE_SAMPLE_PAYLOAD = {
  filterName: "测试标题",
  matchedKeyword: "测试标题",
  chatTitle: "追踪频道",
  senderName: "消息发布者",
  senderId: "123456789",
  content: "今晚 20:00 更新章节，命中关键词后会按当前通道格式推送。",
  messageDate: "2026/6/29 20:00:00",
  telegramLink: "https://t.me/c/123456/789",
} satisfies ForwardTemplatePayload;

export const DEFAULT_FORWARD_TITLE_TEMPLATE = "[Telegram] 命中规则: {{filterName}}";

export const DEFAULT_FORWARD_BODY_TEMPLATE = `【群组】: {{chatTitle}}
【发送者】: {{senderName}}
【时间】: {{messageDate}}

{{content}}

链接: {{telegramLink}}`;

export const FORWARD_FORMAT_PRESETS = [
  {
    id: "compact",
    name: "简洁模式",
    titleTemplate: "[{{filterName}}] {{chatTitle}}",
    bodyTemplate: `{{content}}

{{telegramLink}}`,
  },
  {
    id: "detailed",
    name: "详情模式",
    titleTemplate: DEFAULT_FORWARD_TITLE_TEMPLATE,
    bodyTemplate: DEFAULT_FORWARD_BODY_TEMPLATE,
  },
  {
    id: "markdown",
    name: "Markdown 模式",
    titleTemplate: "Telegram · {{filterName}}",
    bodyTemplate: `**群组**：{{chatTitle}}
**发送者**：{{senderName}}
**关键词**：{{matchedKeyword}}
**时间**：{{messageDate}}

> {{content}}

[查看原文]({{telegramLink}})`,
  },
] as const;

export type ForwardFormatPreset = (typeof FORWARD_FORMAT_PRESETS)[number];
export type ForwardFormatPresetId = ForwardFormatPreset["id"];

const FORWARD_TEMPLATE_VARIABLE_SET = new Set<string>(FORWARD_TEMPLATE_VARIABLES);
const FORWARD_TEMPLATE_TOKEN_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

const emptyTemplateToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

export function renderForwardTemplate(template: string, payload: ForwardTemplatePayload): string {
  return template.replace(FORWARD_TEMPLATE_TOKEN_PATTERN, (match, key: string) => {
    if (!FORWARD_TEMPLATE_VARIABLE_SET.has(key)) return match;

    const value = payload[key as ForwardTemplateVariable];
    return value === null || value === undefined ? "" : String(value);
  });
}

const forwardTitleTemplateSchema = z.preprocess(
  emptyTemplateToUndefined,
  z.string().trim().max(300, "titleTemplate is too long").default(DEFAULT_FORWARD_TITLE_TEMPLATE),
);

const forwardBodyTemplateSchema = z.preprocess(
  emptyTemplateToUndefined,
  z.string().trim().max(4000, "bodyTemplate is too long").default(DEFAULT_FORWARD_BODY_TEMPLATE),
);

export const forwardTargetIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const forwardTargetFilterIdsSchema = z.array(z.number().int().positive());

export const forwardTargetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  appriseUrl: z.string(),
  enabled: z.boolean(),
  filterIds: forwardTargetFilterIdsSchema,
  titleTemplate: z.string(),
  bodyTemplate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const forwardTargetListSchema = z.array(forwardTargetSchema);

export const forwardTargetCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    appriseUrl: z.string().trim().min(1, "appriseUrl is required"),
    enabled: z.boolean(),
    filterIds: forwardTargetFilterIdsSchema,
    titleTemplate: forwardTitleTemplateSchema,
    bodyTemplate: forwardBodyTemplateSchema,
  })
  .strict();

export const forwardTargetUpdateInputSchema = forwardTargetCreateInputSchema;

export const forwardTargetTestInputSchema = z
  .object({
    appriseUrl: z.string().trim().min(1, "appriseUrl is required"),
    titleTemplate: forwardTitleTemplateSchema,
    bodyTemplate: forwardBodyTemplateSchema,
  })
  .strict();

export const forwardTargetActionResponseSchema = z.object({
  success: z.boolean(),
});

export type ForwardTarget = z.infer<typeof forwardTargetSchema>;
export type ForwardTargetCreateInput = z.infer<typeof forwardTargetCreateInputSchema>;
export type ForwardTargetUpdateInput = z.infer<typeof forwardTargetUpdateInputSchema>;
export type ForwardTargetTestInput = z.infer<typeof forwardTargetTestInputSchema>;
export type ForwardTargetActionResponse = z.infer<typeof forwardTargetActionResponseSchema>;
