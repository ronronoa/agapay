import { z } from 'zod';
import { DonationStatus } from './enums.js';

export const donorRecentDonationSchema = z.object({
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
  submittedAt: z.string(),
});

export type DonorRecentDonation = z.infer<typeof donorRecentDonationSchema>;

export const donorFeaturedCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  endDate: z.string().nullable(),
  goalUnits: z.number().int().nullable(),
  raisedUnits: z.number().int(),
});

export type DonorFeaturedCampaign = z.infer<typeof donorFeaturedCampaignSchema>;

export const donorDashboardResponseSchema = z.object({
  data: z.object({
    totalDonations: z.number().int(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
    totalItemsReceived: z.number().int(),
    campaignsSupported: z.number().int(),
    activeCampaigns: z.number().int(),
    donationsThisMonth: z.number().int(),
    featuredCampaign: donorFeaturedCampaignSchema.nullable(),
    recent: z.array(donorRecentDonationSchema),
  }),
});

export type DonorDashboardResponse = z.infer<typeof donorDashboardResponseSchema>;
