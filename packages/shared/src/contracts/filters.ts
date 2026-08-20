import { z } from "zod";
import { messageContentLinksSchema } from "./messages.js";

export const filterConditionTypeSchema = z.enum(["keyword", "chat", "regex", "script"]);
export const filterConditionEffectSchema = z.enum(["require", "exclude"]);

export function isValidFilterRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

export const filterConditionSchema = z
  .object({
    type: filterConditionTypeSchema,
    effect: filterConditionEffectSchema.optional(),
    values: z.array(z.string().trim().min(1)).min(1),
  })
  .superRefine((condition, ctx) => {
    if (condition.type === "chat" && condition.effect === "exclude") {
      ctx.addIssue({
        code: "custom",
        path: ["effect"],
        message: "chat conditions cannot be excluded",
      });
    }

    if (condition.type === "script") {
      if (condition.values.length !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["values"],
          message: "script conditions must contain exactly one source value",
        });
      }

      if ((condition.values[0]?.length ?? 0) > 20_000) {
        ctx.addIssue({
          code: "custom",
          path: ["values", 0],
          message: "script source must not exceed 20000 characters",
        });
      }
    }

    if (condition.type !== "regex") return;

    condition.values.forEach((value, index) => {
      if (isValidFilterRegexPattern(value)) return;

      ctx.addIssue({
        code: "custom",
        path: ["values", index],
        message: "invalid regex pattern",
      });
    });
  });

export const filterConditionsSchema = z.array(filterConditionSchema).min(1);

export const filterForwardTargetIdsSchema = z.array(z.number().int().positive());

export const filterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  conditions: z.array(filterConditionSchema),
  enabled: z.boolean(),
  autoLocateUnreadNearRead: z.boolean(),
  forwardTargetIds: filterForwardTargetIdsSchema,
  latestMessageAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const filterListSchema = z.array(filterSchema);

export const filterCreateInputSchema = z
  .object({
    name: z.string().trim().min(1, "name is required"),
    conditions: filterConditionsSchema,
    autoLocateUnreadNearRead: z.boolean().optional(),
    forwardTargetIds: filterForwardTargetIdsSchema.optional(),
  })
  .strict();

export const filterUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").optional(),
    conditions: filterConditionsSchema.optional(),
    autoLocateUnreadNearRead: z.boolean().optional(),
    forwardTargetIds: filterForwardTargetIdsSchema.optional(),
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
  contentLinks: messageContentLinksSchema.default([]),
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

export const historicalFilterPreviewSampleSchema = historicalFilterPreviewMessageSchema.extend({
  matched: z.boolean(),
});

export const filterPreviewResponseSchema = z.object({
  messages: z.array(historicalFilterPreviewMessageSchema),
  samples: z.array(historicalFilterPreviewSampleSchema),
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

export const filterBackfillModeSchema = z.enum(["time", "count"]);
export const filterBackfillJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);

const filterBackfillIsoDateSchema = z.iso.datetime();

export const filterBackfillJobCreateInputSchema = z
  .object({
    mode: filterBackfillModeSchema,
    startAt: filterBackfillIsoDateSchema.nullable().optional(),
    endAt: filterBackfillIsoDateSchema.optional(),
    perChatLimit: z.number().int().min(100).max(100_000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.mode === "count" && input.perChatLimit === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["perChatLimit"],
        message: "perChatLimit is required for count mode",
      });
    }

    if (input.mode === "time" && input.endAt === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "endAt is required for time mode",
      });
    }

    if (
      input.mode === "time" &&
      input.startAt &&
      input.endAt &&
      Date.parse(input.startAt) > Date.parse(input.endAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["startAt"],
        message: "startAt must not be later than endAt",
      });
    }
  });

export const filterBackfillJobSchema = z.object({
  id: z.string().min(1),
  filterId: z.number().int().positive(),
  mode: filterBackfillModeSchema,
  status: filterBackfillJobStatusSchema,
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  perChatLimit: z.number().int().positive().nullable(),
  totalChats: z.number().int().nonnegative(),
  completedChats: z.number().int().nonnegative(),
  scannedMessages: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  savedCount: z.number().int().nonnegative(),
  skippedExistingCount: z.number().int().nonnegative(),
  currentChatTitle: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const nullableFilterBackfillJobSchema = filterBackfillJobSchema.nullable();

export const filterDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const filterIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const filterBackfillJobIdParamSchema = filterIdParamSchema.extend({
  jobId: z.string().trim().min(1),
});

export type FilterConditionType = z.infer<typeof filterConditionTypeSchema>;
export type FilterConditionEffect = z.infer<typeof filterConditionEffectSchema>;
export type FilterCondition = z.infer<typeof filterConditionSchema>;
export type Filter = z.infer<typeof filterSchema>;
export type FilterCreateInput = z.infer<typeof filterCreateInputSchema>;
export type FilterUpdateInput = z.infer<typeof filterUpdateInputSchema>;
export type FilterHistoryScope = z.infer<typeof filterHistoryScopeSchema>;
export type FilterPreviewInput = z.infer<typeof filterPreviewInputSchema>;
export type LiveChatMessage = z.infer<typeof liveChatMessageSchema>;
export type HistoricalFilterPreviewMessage = z.infer<typeof historicalFilterPreviewMessageSchema>;
export type HistoricalFilterPreviewSample = z.infer<typeof historicalFilterPreviewSampleSchema>;
export type FilterPreviewResponse = z.infer<typeof filterPreviewResponseSchema>;
export type FilterBackfillResponse = z.infer<typeof filterBackfillResponseSchema>;
export type FilterBackfillMode = z.infer<typeof filterBackfillModeSchema>;
export type FilterBackfillJobStatus = z.infer<typeof filterBackfillJobStatusSchema>;
export type FilterBackfillJobCreateInput = z.infer<typeof filterBackfillJobCreateInputSchema>;
export type FilterBackfillJob = z.infer<typeof filterBackfillJobSchema>;
