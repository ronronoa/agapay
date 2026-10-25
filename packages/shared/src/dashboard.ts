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

const countSchema = z.number().int().nonnegative();
const periodSchema = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const periodCountSchema = z.object({
  total: countSchema,
  thisMonth: countSchema,
  lastMonth: countSchema,
});
export const adminDashboardResponseSchema = z.object({
  data: z.object({
    asOf: z.string().datetime(),
    periods: z.object({
      thisMonth: periodSchema,
      lastMonth: periodSchema,
      thisWeek: periodSchema,
      lastWeek: periodSchema,
    }),
    needsAttention: z.object({
      donationsAwaitingVerification: countSchema,
      requestsAwaitingReview: countSchema,
      distributionsToday: countSchema,
      lowStockItems: countSchema,
    }),
    awaitingStock: countSchema,
    donationActivity: z.object({
      thisWeek: countSchema,
      lastWeek: countSchema,
      byWeekday: z.array(countSchema).length(7),
    }),
    goodsDistributed: z.object({
      thisMonth: countSchema,
      lastMonth: countSchema,
      lastWeek: countSchema,
    }),
    beneficiariesServed: periodCountSchema,
    verifiedDonations: periodCountSchema,
    activeCampaigns: countSchema,
    upcomingDistributions: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        campaignName: z.string(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
      }),
    ),
    inventory: z.array(
      z.object({
        id: z.string(),
        itemTypeName: z.string(),
        campaignName: z.string(),
        unit: z.string(),
        available: countSchema,
        lowStock: z.boolean(),
      }),
    ),
    recentActivity: z.array(
      z.object({
        id: z.string(),
        action: z.string(),
        entityType: z.string(),
        createdAt: z.string().datetime(),
      }),
    ),
  }),
});
export type AdminDashboardResponse = z.infer<typeof adminDashboardResponseSchema>;
