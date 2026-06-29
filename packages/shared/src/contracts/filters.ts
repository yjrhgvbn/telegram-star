import { z } from "zod";

export const filterConditionTypeSchema = z.enum(["keyword", "chat"]);

export const filterConditionSchema = z.object({
  type: filterConditionTypeSchema,
  values: z.array(z.string().trim().min(1)).min(1),
});

export const filterConditionsSchema = z.array(filterConditionSchema).min(1);

export const filterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  conditions: z.array(filterConditionSchema),
  enabled: z.boolean(),
  autoLocateUnreadNearRead: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const filterListSchema = z.array(filterSchema);

export const filterCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    conditions: filterConditionsSchema,
    autoLocateUnreadNearRead: z.boolean().optional(),
  })
  .strict();

export const filterUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").optional(),
    conditions: filterConditionsSchema.optional(),
    autoLocateUnreadNearRead: z.boolean().optional(),
  })
  .strict();

export const filterHistoryScopeSchema = z
  .object({
    perChatLimit: z.number().int().positive().optional(),
    totalLimit: z.number().int().positive().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
  })
  .strict();

export const filterPreviewInputSchema = filterHistoryScopeSchema.extend({
  conditions: filterConditionsSchema,
});

export const liveChatMessageSchema = z.object({
  id: z.number().int(),
  chatId: z.string(),
  chatTitle: z.string(),
  senderName: z.string(),
  senderId: z.string(),
  content: z.string(),
  messageDate: z.string(),
  telegramLink: z.string(),
  inDatabase: z.boolean(),
  mediaType: z.string().nullable(),
  mediaFileName: z.string().nullable(),
  mediaFileSize: z.number().nullable(),
  mediaMimeType: z.string().nullable(),
  mediaDuration: z.number().nullable(),
  mediaThumbBase64: z.string().nullable(),
  mediaExtra: z.string().nullable(),
});

export const historicalFilterPreviewMessageSchema = liveChatMessageSchema.extend({
  matchedKeyword: z.string().nullable(),
});

export const filterPreviewResponseSchema = z.object({
  messages: z.array(historicalFilterPreviewMessageSchema),
  scannedChats: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  nextPage: z.number().int().positive().optional(),
});

export const filterBackfillResponseSchema = z.object({
  scannedChats: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  savedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
});

export const filterDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const filterIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type FilterConditionType = z.infer<typeof filterConditionTypeSchema>;
export type FilterCondition = z.infer<typeof filterConditionSchema>;
export type Filter = z.infer<typeof filterSchema>;
export type FilterCreateInput = z.infer<typeof filterCreateInputSchema>;
export type FilterUpdateInput = z.infer<typeof filterUpdateInputSchema>;
export type FilterHistoryScope = z.infer<typeof filterHistoryScopeSchema>;
export type FilterPreviewInput = z.infer<typeof filterPreviewInputSchema>;
export type LiveChatMessage = z.infer<typeof liveChatMessageSchema>;
export type HistoricalFilterPreviewMessage = z.infer<typeof historicalFilterPreviewMessageSchema>;
export type FilterPreviewResponse = z.infer<typeof filterPreviewResponseSchema>;
export type FilterBackfillResponse = z.infer<typeof filterBackfillResponseSchema>;
