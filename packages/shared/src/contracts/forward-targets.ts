import { z } from "zod";

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
  })
  .strict();

export const forwardTargetUpdateInputSchema = forwardTargetCreateInputSchema;

export const forwardTargetTestInputSchema = z
  .object({
    appriseUrl: z.string().trim().min(1, "appriseUrl is required"),
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
