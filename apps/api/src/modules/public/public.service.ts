import { prisma } from '../../lib/prisma.js';
import { manilaMonthBounds } from '../../lib/manila.js';

export interface PublicStats {
  beneficiariesServed: number;
  goodsDistributedThisMonth: number;
  verifiedDonations: number;
}

// Same definitions the admin dashboard already renders, so the public numbers
// never disagree with the staff view.
export async function stats(now: Date): Promise<PublicStats> {
  const { from, to } = manilaMonthBounds(now);
  const [beneficiariesServed, distributed, verifiedDonations] = await Promise.all([
    prisma.assistanceRequest.count({ where: { status: 'DISTRIBUTED' } }),
    prisma.distributionItem.aggregate({
      _sum: { quantity: true },
      where: {
        distribution: { status: 'DISTRIBUTED', distributedAt: { gte: from, lt: to } },
      },
    }),
    prisma.donation.count({ where: { status: 'VERIFIED' } }),
  ]);

  return {
    beneficiariesServed,
    goodsDistributedThisMonth: distributed._sum.quantity ?? 0,
    verifiedDonations,
  };
}
