import { z } from "zod";

export const telegramConfigSourceSchema = z.enum(["env", "database", "missing"]);
export const thumbQualitySchema = z.enum(["low", "medium", "high"]);

export const telegramConfigStatusSchema = z.object({
  telegramConfigured: z.boolean(),
  telegramConfigSource: telegramConfigSourceSchema,
  databaseConfigured: z.boolean(),
  apiId: z.number().nullable(),
  apiHashMasked: z.string().nullable(),
});

export const mediaConfigStatusSchema = z.object({
  thumbIndex: z.number().int().min(0).max(2),
  thumbQuality: thumbQualitySchema,
});

export const appConfigStatusSchema = z.object({
  telegram: telegramConfigStatusSchema,
  media: mediaConfigStatusSchema,
});

const configNumberInputSchema = z.union([z.number(), z.string()]);

export const appConfigUpdateSchema = z
  .object({
    telegram: z
      .object({
        apiId: configNumberInputSchema.optional(),
        apiHash: z.string().optional(),
      })
      .strict()
      .optional(),
    media: z
      .object({
        thumbIndex: configNumberInputSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TelegramConfigSource = z.infer<typeof telegramConfigSourceSchema>;
export type ThumbQuality = z.infer<typeof thumbQualitySchema>;
export type TelegramConfigStatus = z.infer<typeof telegramConfigStatusSchema>;
export type MediaConfigStatus = z.infer<typeof mediaConfigStatusSchema>;
export type AppConfigStatus = z.infer<typeof appConfigStatusSchema>;
export type AppConfigUpdate = z.infer<typeof appConfigUpdateSchema>;
