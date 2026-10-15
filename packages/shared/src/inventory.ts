import { z } from 'zod';
import { MovementType } from './enums.js';

export const inventoryListQuerySchema = z
  .object({
    campaignId: z.string().uuid().optional(),
    itemTypeId: z.string().uuid().optional(),
    lowStock: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

export const inventoryAdjustSchema = z
  .object({
    itemTypeId: z.string().uuid(),
    campaignId: z.string().uuid(),
    direction: z.enum(['IN', 'OUT']),
    quantity: z.number().int().min(1).max(10_000_000),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

export const inventoryTransferSchema = z
  .object({
    itemTypeId: z.string().uuid(),
    fromCampaignId: z.string().uuid(),
    toCampaignId: z.string().uuid(),
    quantity: z.number().int().min(1).max(10_000_000),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((value) => value.fromCampaignId !== value.toCampaignId, {
    message: 'Source and destination campaigns must differ.',
    path: ['toCampaignId'],
  });

export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;

export const inventoryDtoSchema = z.object({
  id: z.string(),
  itemTypeId: z.string(),
  itemTypeName: z.string(),
  unit: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  available: z.number().int(),
  reserved: z.number().int(),
  distributed: z.number().int(),
  total: z.number().int(),
  imageUrl: z.string().nullable(),
  lowStockThreshold: z.number().int(),
  lowStock: z.boolean(),
  updatedAt: z.string(),
});

export type InventoryDto = z.infer<typeof inventoryDtoSchema>;

export const inventoryResponseSchema = z.object({ data: inventoryDtoSchema });

export const inventoryListResponseSchema = z.object({
  data: z.object({
    items: z.array(inventoryDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

export const inventoryMovementDtoSchema = z.object({
  id: z.string(),
  type: z.enum([
    MovementType.DONATION_IN,
    MovementType.RESERVE,
    MovementType.RELEASE,
    MovementType.DISTRIBUTE,
    MovementType.ADJUSTMENT_IN,
    MovementType.ADJUSTMENT_OUT,
  ]),
  quantity: z.number().int(),
  availableAfter: z.number().int(),
  reservedAfter: z.number().int(),
  distributedAfter: z.number().int(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export type InventoryMovementDto = z.infer<typeof inventoryMovementDtoSchema>;

export const inventoryMovementListResponseSchema = z.object({
  data: z.object({
    items: z.array(inventoryMovementDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
