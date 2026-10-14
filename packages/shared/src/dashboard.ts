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

export const donorDashboardResponseSchema = z.object({
  data: z.object({
    totalDonations: z.number().int(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number().int() })),
    totalItemsReceived: z.number().int(),
    campaignsSupported: z.number().int(),
    activeCampaigns: z.number().int(),
    recent: z.array(donorRecentDonationSchema),
  }),
});

export type DonorDashboardResponse = z.infer<typeof donorDashboardResponseSchema>;
