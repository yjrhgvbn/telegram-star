import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => (value === "" ? undefined : value);

const optionalPositiveIntQuerySchema = z.preprocess(
  (value) => {
    const normalized = emptyStringToUndefined(value);
    return normalized === undefined ? undefined : Number(normalized);
  },
  z.number().int().positive().optional(),
);

const optionalBooleanQuerySchema = z.preprocess((value) => {
  const normalized = emptyStringToUndefined(value);
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return normalized;
}, z.boolean().optional());

export const messageDirectionSchema = z.enum(["before", "after", "around"]);

export const messageListParamsSchema = z
  .object({
    cursorId: z.number().int().positive().optional(),
    direction: messageDirectionSchema.optional(),
    autoLocate: z.boolean().optional(),
    limit: z.number().int().positive().max(100).optional(),
    isRead: z.boolean().optional(),
    filterId: z.number().int().positive().optional(),
    search: z.string().trim().min(1).optional(),
  })
  .strict();

export const messageListQuerySchema = z
  .object({
    cursorId: optionalPositiveIntQuerySchema,
    direction: messageDirectionSchema.optional(),
    autoLocate: optionalBooleanQuerySchema,
    limit: optionalPositiveIntQuerySchema.pipe(z.number().int().positive().max(100).optional()),
    isRead: optionalBooleanQuerySchema,
    filterId: optionalPositiveIntQuerySchema,
    search: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional()),
  })
  .strict();

export const messageSchema = z.object({
  id: z.number().int().positive(),
  telegramMessageId: z.number().int(),
  chatId: z.string(),
  chatTitle: z.string(),
  senderName: z.string(),
  senderId: z.string(),
  content: z.string(),
  messageDate: z.string(),
  telegramLink: z.string(),
  isRead: z.boolean(),
  matchedFilterId: z.number().int().nullable(),
  matchedKeyword: z.string().nullable(),
  filterName: z.string().nullable(),
  createdAt: z.string(),
  mediaType: z.string().nullable(),
  mediaFileName: z.string().nullable(),
  mediaFileSize: z.number().nullable(),
  mediaMimeType: z.string().nullable(),
  mediaDuration: z.number().nullable(),
  mediaThumbBase64: z.string().nullable(),
  mediaExtra: z.string().nullable(),
});

export const messageListResponseSchema = z.object({
  data: z.array(messageSchema),
  hasOlder: z.boolean(),
  hasNewer: z.boolean(),
  anchorId: z.number().int().positive().nullable().optional(),
});

export const messageIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const messageIdsInputSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, "ids array is required"),
  })
  .strict();

export const messageReadStateResponseSchema = z.object({
  id: z.number().int().positive(),
  isRead: z.boolean(),
});

export const messageBatchReadResponseSchema = z.object({
  success: z.boolean(),
  count: z.number().int().nonnegative(),
});

export const messageForceSyncReadResponseSchema = z.object({
  markedIds: z.array(z.number().int().positive()),
});

export const messageStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  unread: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
});

export const readSyncLogLevelSchema = z.enum(["info", "warn", "error"]);

export const readSyncLogSchema = z.object({
  id: z.number().int().positive(),
  level: readSyncLogLevelSchema,
  source: z.string(),
  action: z.string(),
  message: z.string(),
  chatId: z.string().nullable(),
  telegramMessageId: z.number().int().nullable(),
  rowId: z.number().int().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const readSyncLogsResponseSchema = z.object({
  data: z.array(readSyncLogSchema),
});

export const readSyncLogsQuerySchema = z
  .object({
    limit: optionalPositiveIntQuerySchema.pipe(z.number().int().positive().max(500).optional()),
  })
  .strict();

export const messageEventPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("new") }),
  z.object({ type: z.literal("read"), messageIds: z.array(z.number().int().positive()) }),
]);

export type MessageDirection = z.infer<typeof messageDirectionSchema>;
export type MessageListParams = z.infer<typeof messageListParamsSchema>;
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;
export type MessageReadStateResponse = z.infer<typeof messageReadStateResponseSchema>;
export type MessageBatchReadResponse = z.infer<typeof messageBatchReadResponseSchema>;
export type MessageForceSyncReadResponse = z.infer<typeof messageForceSyncReadResponseSchema>;
export type MessageStats = z.infer<typeof messageStatsSchema>;
export type ReadSyncLogLevel = z.infer<typeof readSyncLogLevelSchema>;
export type ReadSyncLog = z.infer<typeof readSyncLogSchema>;
export type ReadSyncLogsResponse = z.infer<typeof readSyncLogsResponseSchema>;
export type MessageEventPayload = z.infer<typeof messageEventPayloadSchema>;
