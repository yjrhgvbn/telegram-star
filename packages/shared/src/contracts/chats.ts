import { z } from "zod";

export const joinedChatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const joinedChatListSchema = z.array(joinedChatSchema);

export const chatDiscoveryQuerySchema = z
  .object({
    q: z.string().trim().min(2, "请至少输入 2 个字符").max(100),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();

export const chatDiscoveryChatTypeSchema = z.enum(["group", "channel"]);

export const chatDiscoveryMatchSchema = z.object({
  messageId: z.number().int().positive(),
  snippet: z.string().min(1),
  messageDate: z.string(),
  telegramLink: z.string(),
});

export const chatDiscoveryResultSchema = z.object({
  chat: joinedChatSchema.extend({
    type: chatDiscoveryChatTypeSchema,
  }),
  matches: z.array(chatDiscoveryMatchSchema).min(1).max(2),
});

export const chatDiscoveryResponseSchema = z.object({
  query: z.string().min(2),
  data: z.array(chatDiscoveryResultSchema),
  // Telegram 只返回本次有限窗口中的结果，不能把它解释为完整统计。
  partial: z.boolean(),
});

export type JoinedChat = z.infer<typeof joinedChatSchema>;
export type ChatDiscoveryQuery = z.infer<typeof chatDiscoveryQuerySchema>;
export type ChatDiscoveryChatType = z.infer<typeof chatDiscoveryChatTypeSchema>;
export type ChatDiscoveryMatch = z.infer<typeof chatDiscoveryMatchSchema>;
export type ChatDiscoveryResult = z.infer<typeof chatDiscoveryResultSchema>;
export type ChatDiscoveryResponse = z.infer<typeof chatDiscoveryResponseSchema>;
