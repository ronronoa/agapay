import type { AuthContext } from '../../types/express.js';
import type { DonorDashboardResponse } from '@agapay/shared';
import { prisma } from '../../lib/prisma.js';
import { manilaMonthBounds } from '../../lib/manila.js';

// BR-DON-06: a gift counts toward a campaign goal once staff have verified it;
// PENDING and REJECTED donations never move the bar.
const GOAL_COUNTING_STATUSES = ['VERIFIED', 'SCHEDULED', 'COLLECTED', 'COMPLETED'] as const;

export async function donorDashboard(
  actor: AuthContext,
  now: Date,
): Promise<DonorDashboardResponse['data']> {
  const { from: monthFrom, to: monthTo } = manilaMonthBounds(now);
  const [grouped, recent, campaignsSupported, activeCampaigns, donationsThisMonth, featured] =
    await Promise.all([
      prisma.donation.groupBy({
        by: ['status'],
        where: { donorId: actor.userId },
        _count: true,
      }),
      prisma.donation.findMany({
        where: { donorId: actor.userId },
        include: { campaign: { select: { name: true } } },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 5,
      }),
      prisma.donation
        .groupBy({ by: ['campaignId'], where: { donorId: actor.userId } })
        .then((rows) => rows.length),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      prisma.donation.count({
        where: { donorId: actor.userId, submittedAt: { gte: monthFrom, lt: monthTo } },
      }),
      // Soonest-ending active campaign is the one worth featuring; campaigns
      // without an end date sort last.
      prisma.campaign.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        include: { priorityItems: true },
      }),
    ]);

  const received = await prisma.donationItem.aggregate({
    _sum: { quantityReceived: true },
    where: { donation: { donorId: actor.userId, status: 'COMPLETED' } },
  });

  let raisedUnits = 0;
  if (featured !== null) {
    const raised = await prisma.donationItem.aggregate({
      _sum: { quantityDeclared: true },
      where: {
        donation: { campaignId: featured.id, status: { in: [...GOAL_COUNTING_STATUSES] } },
      },
    });
    raisedUnits = raised._sum.quantityDeclared ?? 0;
  }

  const targets =
    featured === null
      ? []
      : featured.priorityItems
          .map((row) => row.targetQuantity)
          .filter((value): value is number => value !== null);
  const goalUnits = targets.length === 0 ? null : targets.reduce((sum, value) => sum + value, 0);

  return {
    totalDonations: grouped.reduce((sum, row) => sum + row._count, 0),
    byStatus: grouped.map((row) => ({ status: row.status, count: row._count })),
    totalItemsReceived: received._sum.quantityReceived ?? 0,
    campaignsSupported,
    activeCampaigns,
    donationsThisMonth,
    featuredCampaign:
      featured === null
        ? null
        : {
            id: featured.id,
            name: featured.name,
            slug: featured.slug,
            endDate: featured.endDate?.toISOString() ?? null,
            goalUnits,
            raisedUnits,
          },
    recent: recent.map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber,
      status: row.status,
      campaignId: row.campaignId,
      campaignName: row.campaign.name,
      submittedAt: row.submittedAt.toISOString(),
    })),
  };
}
