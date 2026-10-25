import { z } from 'zod';
import { ItemCategory } from './enums.js';

export const itemTypeListQuerySchema = z
  .object({
    category: z
      .enum([
        ItemCategory.FOOD,
        ItemCategory.WATER,
        ItemCategory.CLOTHING,
        ItemCategory.HYGIENE,
        ItemCategory.BEDDING,
        ItemCategory.SCHOOL,
        ItemCategory.OTHER,
      ])
      .optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type ItemTypeListQuery = z.infer<typeof itemTypeListQuerySchema>;

export const itemTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  lowStockThreshold: z.number(),
  maxPerRequest: z.number().nullable(),
  perHouseholdMember: z.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type ItemTypeDto = z.infer<typeof itemTypeSchema>;

const limits = {
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  // D-06: null means no cap, so a real limit stays an eligibility decision.
  maxPerRequest: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perHouseholdMember: z.number().int().min(1).max(1_000_000).nullable().optional(),
};

export const createItemTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    category: z.enum([
      ItemCategory.FOOD,
      ItemCategory.WATER,
      ItemCategory.CLOTHING,
      ItemCategory.HYGIENE,
      ItemCategory.BEDDING,
      ItemCategory.SCHOOL,
      ItemCategory.OTHER,
    ]),
    unit: z.string().trim().min(1).max(24),
    ...limits,
    lowStockThreshold: limits.lowStockThreshold.optional(),
  })
  .strict();

export type CreateItemTypeInput = z.infer<typeof createItemTypeSchema>;

export const updateItemTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    category: z
      .enum([
        ItemCategory.FOOD,
        ItemCategory.WATER,
        ItemCategory.CLOTHING,
        ItemCategory.HYGIENE,
        ItemCategory.BEDDING,
        ItemCategory.SCHOOL,
        ItemCategory.OTHER,
      ])
      .optional(),
    unit: z.string().trim().min(1).max(24).optional(),
    lowStockThreshold: limits.lowStockThreshold.optional(),
    maxPerRequest: limits.maxPerRequest,
    perHouseholdMember: limits.perHouseholdMember,
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateItemTypeInput = z.infer<typeof updateItemTypeSchema>;

export const itemTypeResponseSchema = z.object({ data: itemTypeSchema });

export const itemTypeListResponseSchema = z.object({
  data: z.object({
    items: z.array(itemTypeSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

export type ItemTypeListResponse = z.infer<typeof itemTypeListResponseSchema>;
