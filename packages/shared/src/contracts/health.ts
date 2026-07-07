import { z } from "zod";

export const healthFeatureSchema = z.enum(["sse", "media", "client-device"]);

// health 用于多端客户端启动前探测后端能力，字段需要保持轻量且向后兼容。
export const healthTelegramStatusSchema = z.object({
  configured: z.boolean(),
  authorized: z.boolean(),
  connected: z.boolean(),
});

export const healthStatusSchema = z.object({
  appName: z.string(),
  serverVersion: z.string(),
  apiVersion: z.string(),
  minClientVersion: z.string(),
  recommendedClientVersion: z.string(),
  features: z.array(healthFeatureSchema),
  telegram: healthTelegramStatusSchema,
});

export type HealthFeature = z.infer<typeof healthFeatureSchema>;
export type HealthTelegramStatus = z.infer<typeof healthTelegramStatusSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
