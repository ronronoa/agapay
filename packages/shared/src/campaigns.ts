import { z } from 'zod';
import { CalamityType, CampaignStatus } from './enums.js';

export const campaignListQuerySchema = z
  .object({
    status: z
      .enum([
        CampaignStatus.DRAFT,
        CampaignStatus.ACTIVE,
        CampaignStatus.COMPLETED,
        CampaignStatus.ARCHIVED,
      ])
      .optional(),
    calamityType: z
      .enum([
        CalamityType.TYPHOON,
        CalamityType.FLOOD,
        CalamityType.EARTHQUAKE,
        CalamityType.FIRE,
        CalamityType.VOLCANIC_ERUPTION,
        CalamityType.LANDSLIDE,
        CalamityType.OTHER,
      ])
      .optional(),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;

const dateField = z.coerce.date();

export const campaignAreaInputSchema = z.object({
  barangay: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(120),
});

const priorityItemInputSchema = z.object({
  itemTypeId: z.string().uuid(),
  targetQuantity: z.number().int().min(1).max(10_000_000).nullable().optional(),
});

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(1).max(5_000),
    calamityType: z.enum([
      CalamityType.TYPHOON,
      CalamityType.FLOOD,
      CalamityType.EARTHQUAKE,
      CalamityType.FIRE,
      CalamityType.VOLCANIC_ERUPTION,
      CalamityType.LANDSLIDE,
      CalamityType.OTHER,
    ]),
    startDate: dateField,
    endDate: dateField.nullable().optional(),
    // Set by the image upload endpoint after create, or accepted as a URL here.
    coverImageUrl: z.string().max(500).nullable().optional(),
    areas: z.array(campaignAreaInputSchema).max(200).default([]),
    priorityItems: z.array(priorityItemInputSchema).max(200).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.endDate === undefined || value.endDate === null || value.endDate > value.startDate,
    {
      message: 'endDate must be after startDate',
      path: ['endDate'],
    },
  );

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(1).max(5_000).optional(),
    calamityType: z
      .enum([
        CalamityType.TYPHOON,
        CalamityType.FLOOD,
        CalamityType.EARTHQUAKE,
        CalamityType.FIRE,
        CalamityType.VOLCANIC_ERUPTION,
        CalamityType.LANDSLIDE,
        CalamityType.OTHER,
      ])
      .optional(),
    startDate: dateField.optional(),
    endDate: dateField.nullable().optional(),
    coverImageUrl: z.string().url().max(500).nullable().optional(),
    areas: z.array(campaignAreaInputSchema).max(200).optional(),
    priorityItems: z.array(priorityItemInputSchema).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignAreaSchema = z.object({
  id: z.string(),
  barangay: z.string(),
  city: z.string(),
  province: z.string(),
});

export const campaignPriorityItemSchema = z.object({
  itemTypeId: z.string(),
  itemName: z.string(),
  unit: z.string(),
  targetQuantity: z.number().nullable(),
});

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  calamityType: z.string(),
  status: z.string(),
  isSystem: z.boolean(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  createdAt: z.string(),
  areas: z.array(campaignAreaSchema).default([]),
  priorityItems: z.array(campaignPriorityItemSchema).default([]),
  donationCount: z.number().default(0),
  requestCount: z.number().default(0),
  eventCount: z.number().default(0),
  inventoryCount: z.number().default(0),
  deletable: z.boolean(),
});

export const campaignResponseSchema = z.object({ data: campaignSchema });

export const campaignListResponseSchema = z.object({
  data: z.object({
    items: z.array(campaignSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

export type CampaignDto = z.infer<typeof campaignSchema>;

export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;

/**
 * Transitions api.md section 5 allows. Anything absent here must be rejected.
 * `DRAFT` is deliberately unreachable as a target: nothing transitions back.
 */
export const CAMPAIGN_TRANSITIONS = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
} as const satisfies Record<CampaignStatus, readonly CampaignStatus[]>;

export type CampaignTransitionTarget =
  (typeof CAMPAIGN_TRANSITIONS)[keyof typeof CAMPAIGN_TRANSITIONS][number];
