import { z } from "zod";

const filterGroupNameSchema = z.string().trim().min(1, "name is required").max(60);
const uniqueIdListSchema = z
  .array(z.number().int().positive())
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "ids must be unique",
      });
    }
  });

export const filterGroupSchema = z.object({
  id: z.number().int().positive(),
  name: filterGroupNameSchema,
  sortOrder: z.number().int().nonnegative(),
  filterCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const filterGroupListSchema = z.array(filterGroupSchema);

export const filterGroupLayoutSchema = z
  .object({
    // “未分组”是虚拟系统分组，只需要保存它在自定义分组之间的插入位置。
    ungroupedPosition: z.number().int().nonnegative(),
  })
  .strict();

export const filterGroupCreateInputSchema = z
  .object({
    name: filterGroupNameSchema,
  })
  .strict();

export const filterGroupUpdateInputSchema = filterGroupCreateInputSchema;

export const filterGroupOrderInputSchema = z
  .object({
    ids: uniqueIdListSchema,
    // 兼容旧客户端：省略时仍按原行为把“未分组”放在末尾。
    ungroupedPosition: z.number().int().nonnegative().optional(),
  })
  .strict();

export const filterPlacementInputSchema = z
  .object({
    manualGroupId: z.number().int().positive().nullable(),
    // 省略表示追加到目标分组末尾；拖拽时传入精确落点。
    targetIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export const filterManualOrderInputSchema = z
  .object({
    manualGroupId: z.number().int().positive().nullable(),
    filterIds: uniqueIdListSchema,
  })
  .strict();

export const filterGroupActionResponseSchema = z.object({
  success: z.literal(true),
});

export const filterGroupIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type FilterGroup = z.infer<typeof filterGroupSchema>;
export type FilterGroupLayout = z.infer<typeof filterGroupLayoutSchema>;
export type FilterGroupCreateInput = z.infer<typeof filterGroupCreateInputSchema>;
export type FilterGroupUpdateInput = z.infer<typeof filterGroupUpdateInputSchema>;
export type FilterGroupOrderInput = z.infer<typeof filterGroupOrderInputSchema>;
export type FilterPlacementInput = z.infer<typeof filterPlacementInputSchema>;
export type FilterManualOrderInput = z.infer<typeof filterManualOrderInputSchema>;
export type FilterGroupActionResponse = z.infer<typeof filterGroupActionResponseSchema>;
