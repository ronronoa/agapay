import { z } from 'zod';
import { emailSchema } from './auth.js';
import { CalamityType, RequestStatus } from './enums.js';

const philippineMobileSchema = z
  .string()
  .regex(/^09\d{9}$/, 'Use an 11-digit Philippine mobile number, e.g. 09171234567.');

const publicRequestedItemSchema = z.object({
  itemTypeId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000_000),
  customName: z.string().trim().min(1).max(120).optional(),
});

export const submitRequestSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    contactNumber: philippineMobileSchema,
    barangay: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    province: z.string().trim().min(1).max(120),
    householdSize: z.number().int().min(1).max(30).optional(),
    campaignId: z.string().uuid(),
    items: z.array(publicRequestedItemSchema).min(1).max(50),
    notes: z.string().trim().max(2000).optional(),
    consent: z.boolean().refine((value) => value === true, {
      message: 'Consent is required to submit a request.',
    }),
    turnstileToken: z.string().min(1).max(2000),
  })
  .strict();

export type SubmitRequestInput = z.infer<typeof submitRequestSchema>;

export const submitRequestResponseSchema = z.object({
  data: z.object({
    referenceNumber: z.string(),
    status: z.string(),
  }),
});

export const verifyRequestEmailSchema = z
  .object({
    token: z.string().min(20).max(500),
  })
  .strict();

export type VerifyRequestEmailInput = z.infer<typeof verifyRequestEmailSchema>;

export const verifyRequestEmailResponseSchema = z.object({
  data: z.object({ verified: z.boolean() }),
});

export const trackRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    email: emailSchema,
  })
  .strict();

export type TrackRequestInput = z.infer<typeof trackRequestSchema>;

export const trackTimelineEntrySchema = z.object({
  status: z.string(),
  at: z.string(),
});

export const trackDistributionSchema = z.object({
  startAt: z.string(),
  endAt: z.string(),
  location: z.string(),
});

export const trackRequestResponseSchema = z.object({
  data: z.object({
    code: z.string(),
    campaign: z.object({ name: z.string() }),
    status: z.enum([
      RequestStatus.PENDING,
      RequestStatus.UNDER_REVIEW,
      RequestStatus.APPROVED,
      RequestStatus.SCHEDULED,
      RequestStatus.DISTRIBUTED,
      RequestStatus.REJECTED,
      RequestStatus.CANCELLED,
    ]),
    statusMessage: z.string(),
    submittedAt: z.string(),
    timeline: z.array(trackTimelineEntrySchema),
    distribution: trackDistributionSchema.nullable(),
    rejectionReason: z.string().nullable(),
  }),
});

export type TrackRequestResponse = z.infer<typeof trackRequestResponseSchema>;

export const publicCampaignListQuerySchema = z
  .object({
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
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type PublicCampaignListQuery = z.infer<typeof publicCampaignListQuerySchema>;

export const publicCampaignDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  calamityType: z.string(),
  status: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  areas: z.array(z.object({ barangay: z.string(), city: z.string(), province: z.string() })),
  priorityItems: z.array(
    z.object({
      itemTypeId: z.string(),
      itemName: z.string(),
      unit: z.string(),
      targetQuantity: z.number().nullable(),
    }),
  ),
});

export type PublicCampaignDto = z.infer<typeof publicCampaignDtoSchema>;

export const publicCampaignListResponseSchema = z.object({
  data: z.object({
    items: z.array(publicCampaignDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

export const publicCampaignResponseSchema = z.object({ data: publicCampaignDtoSchema });

export const publicItemTypeDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string(),
  maxPerRequest: z.number().nullable(),
  perHouseholdMember: z.number().nullable(),
});

export type PublicItemTypeDto = z.infer<typeof publicItemTypeDtoSchema>;
export const publicItemTypeListResponseSchema = z.object({
  data: z.object({
    items: z.array(publicItemTypeDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
