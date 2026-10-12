import { z } from 'zod';
import { DonationStatus } from './enums.js';

export const DONATION_TRANSITIONS = {
  PENDING: [DonationStatus.VERIFIED, DonationStatus.REJECTED, DonationStatus.CANCELLED],
  VERIFIED: [DonationStatus.COLLECTED, DonationStatus.CANCELLED],
  SCHEDULED: [DonationStatus.CANCELLED],
  COLLECTED: [DonationStatus.COMPLETED],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
} as const satisfies Record<DonationStatus, readonly DonationStatus[]>;

const donationItemInputSchema = z.object({
  itemTypeId: z.string().uuid(),
  quantityDeclared: z.number().int().min(1).max(10_000_000),
  description: z.string().trim().max(500).optional(),
  customName: z.string().trim().min(1).max(120).optional(),
  expiryDate: z.coerce.date().optional(),
});

export const submitDonationSchema = z
  .object({
    campaignId: z.string().uuid().optional(),
    preferredDate: z.coerce.date().optional(),
    preferredNote: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
    items: z.array(donationItemInputSchema).min(1).max(100),
  })
  .strict();

export type SubmitDonationInput = z.infer<typeof submitDonationSchema>;

export const updateDonationSchema = z
  .object({
    preferredDate: z.coerce.date().nullable().optional(),
    preferredNote: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    items: z.array(donationItemInputSchema).min(1).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateDonationInput = z.infer<typeof updateDonationSchema>;

export const rejectDonationSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type RejectDonationInput = z.infer<typeof rejectDonationSchema>;

const collectItemInputSchema = z.object({
  donationItemId: z.string().uuid(),
  quantityReceived: z.number().int().min(0).max(10_000_000),
  expiryDate: z.coerce.date().optional(),
});

export const collectDonationSchema = z
  .object({
    items: z.array(collectItemInputSchema).min(1).max(100),
  })
  .strict();

export type CollectDonationInput = z.infer<typeof collectDonationSchema>;

export const donationListQuerySchema = z
  .object({
    status: z
      .enum([
        DonationStatus.PENDING,
        DonationStatus.VERIFIED,
        DonationStatus.SCHEDULED,
        DonationStatus.COLLECTED,
        DonationStatus.COMPLETED,
        DonationStatus.REJECTED,
        DonationStatus.CANCELLED,
      ])
      .optional(),
    campaignId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type DonationListQuery = z.infer<typeof donationListQuerySchema>;

export const donationItemDtoSchema = z.object({
  id: z.string(),
  itemTypeId: z.string(),
  itemTypeName: z.string(),
  unit: z.string(),
  customName: z.string().nullable(),
  description: z.string().nullable(),
  quantityDeclared: z.number().int(),
  quantityReceived: z.number().int().nullable(),
  expiryDate: z.string().nullable(),
});

export type DonationItemDto = z.infer<typeof donationItemDtoSchema>;

export const donationDtoSchema = z.object({
  id: z.string(),
  referenceNumber: z.string(),
  status: z.enum([
    DonationStatus.PENDING,
    DonationStatus.VERIFIED,
    DonationStatus.SCHEDULED,
    DonationStatus.COLLECTED,
    DonationStatus.COMPLETED,
    DonationStatus.REJECTED,
    DonationStatus.CANCELLED,
  ]),
  campaignId: z.string(),
  campaignName: z.string(),
  donorId: z.string(),
  donorName: z.string(),
  donorEmail: z.string(),
  preferredDate: z.string().nullable(),
  preferredNote: z.string().nullable(),
  notes: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  items: z.array(donationItemDtoSchema),
  submittedAt: z.string(),
  verifiedAt: z.string().nullable(),
  collectedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type DonationDto = z.infer<typeof donationDtoSchema>;

export const donationResponseSchema = z.object({ data: donationDtoSchema });

export const donationListResponseSchema = z.object({
  data: z.object({
    items: z.array(donationDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
