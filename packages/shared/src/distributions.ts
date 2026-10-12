import { z } from 'zod';
import { DistributionStatus } from './enums.js';

const distributionItemInputSchema = z.object({
  itemTypeId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000_000),
});

export const createDistributionSchema = z
  .object({
    requestId: z.string().uuid(),
    calendarEventId: z.string().uuid(),
    items: z.array(distributionItemInputSchema).min(1).max(100),
  })
  .strict();

export type CreateDistributionInput = z.infer<typeof createDistributionSchema>;

const updateDistributionItemSchema = z.object({
  distributionItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000_000),
});

export const updateDistributionSchema = z
  .object({
    calendarEventId: z.string().uuid().optional(),
    items: z.array(updateDistributionItemSchema).min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateDistributionInput = z.infer<typeof updateDistributionSchema>;

const completeItemInputSchema = z.object({
  distributionItemId: z.string().uuid(),
  quantity: z.number().int().min(0).max(10_000_000),
});

export const completeDistributionSchema = z
  .object({
    receivedByName: z.string().trim().min(2).max(120),
    items: z.array(completeItemInputSchema).min(1).max(100),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CompleteDistributionInput = z.infer<typeof completeDistributionSchema>;

export const distributionListQuerySchema = z
  .object({
    status: z
      .enum([
        DistributionStatus.SCHEDULED,
        DistributionStatus.DISTRIBUTED,
        DistributionStatus.NO_SHOW,
        DistributionStatus.CANCELLED,
      ])
      .optional(),
    campaignId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
    requestId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type DistributionListQuery = z.infer<typeof distributionListQuerySchema>;

export const distributionItemDtoSchema = z.object({
  id: z.string(),
  itemTypeId: z.string(),
  itemTypeName: z.string(),
  unit: z.string(),
  quantity: z.number().int(),
});

export type DistributionItemDto = z.infer<typeof distributionItemDtoSchema>;

export const distributionDtoSchema = z.object({
  id: z.string(),
  status: z.enum([
    DistributionStatus.SCHEDULED,
    DistributionStatus.DISTRIBUTED,
    DistributionStatus.NO_SHOW,
    DistributionStatus.CANCELLED,
  ]),
  requestId: z.string(),
  requestReference: z.string(),
  calendarEventId: z.string(),
  eventTitle: z.string(),
  receivedByName: z.string().nullable(),
  notes: z.string().nullable(),
  items: z.array(distributionItemDtoSchema),
  createdAt: z.string(),
});

export type DistributionDto = z.infer<typeof distributionDtoSchema>;

export const distributionResponseSchema = z.object({ data: distributionDtoSchema });

export const distributionListResponseSchema = z.object({
  data: z.object({
    items: z.array(distributionDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

export const scheduleDonationSchema = z
  .object({
    calendarEventId: z.string().uuid(),
  })
  .strict();

export type ScheduleDonationInput = z.infer<typeof scheduleDonationSchema>;
