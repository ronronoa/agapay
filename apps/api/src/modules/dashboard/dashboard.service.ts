import type { AuthContext } from '../../types/express.js';
import type { DonorDashboardResponse } from '@agapay/shared';
import { prisma } from '../../lib/prisma.js';

export async function donorDashboard(actor: AuthContext): Promise<DonorDashboardResponse['data']> {
  const [grouped, recent, campaignsSupported, activeCampaigns] = await Promise.all([
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
  ]);

  const received = await prisma.donationItem.aggregate({
    _sum: { quantityReceived: true },
    where: { donation: { donorId: actor.userId, status: 'COMPLETED' } },
  });

  return {
    totalDonations: grouped.reduce((sum, row) => sum + row._count, 0),
    byStatus: grouped.map((row) => ({ status: row.status, count: row._count })),
    totalItemsReceived: received._sum.quantityReceived ?? 0,
    campaignsSupported,
    activeCampaigns,
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
