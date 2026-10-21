import type { AuthContext } from '../../types/express.js';
import type { AdminDashboardResponse, DonorDashboardResponse } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { manilaMonthBounds } from '../../lib/manila.js';
import { internal } from '../../lib/errors.js';

// BR-DON-06: a gift counts toward a campaign goal once staff have verified it;
// PENDING and REJECTED donations never move the bar.
const GOAL_COUNTING_STATUSES = ['VERIFIED', 'SCHEDULED', 'COLLECTED', 'COMPLETED'] as const;

export async function donorDashboard(
  actor: AuthContext,
  now: Date,
): Promise<DonorDashboardResponse['data']> {
  return prisma.$transaction(
    async (tx) => {
      const { from: monthFrom, to: monthTo } = manilaMonthBounds(now);
      const [grouped, recent, campaignsSupported, activeCampaigns, donationsThisMonth, featured] =
        await Promise.all([
          tx.donation.groupBy({
            by: ['status'],
            where: { donorId: actor.userId },
            _count: true,
          }),
          tx.donation.findMany({
            where: { donorId: actor.userId },
            include: { campaign: { select: { name: true } } },
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
            take: 5,
          }),
          tx.donation
            .groupBy({ by: ['campaignId'], where: { donorId: actor.userId } })
            .then((rows) => rows.length),
          tx.campaign.count({ where: { status: 'ACTIVE' } }),
          tx.donation.count({
            where: { donorId: actor.userId, submittedAt: { gte: monthFrom, lt: monthTo } },
          }),
          // Soonest-ending active campaign is the one worth featuring; campaigns
          // without an end date sort last.
          tx.campaign.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
            include: { priorityItems: true },
          }),
        ]);

      const received = await tx.donationItem.aggregate({
        _sum: { quantityReceived: true },
        where: { donation: { donorId: actor.userId, status: 'COMPLETED' } },
      });

      let raisedUnits = 0;
      if (featured !== null) {
        const raised = await tx.donationItem.aggregate({
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
      const goalUnits =
        targets.length === 0 ? null : targets.reduce((sum, value) => sum + value, 0);

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
    },
    { ...txOptions, isolationLevel: 'RepeatableRead' },
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export async function adminDashboard(now: Date): Promise<AdminDashboardResponse['data']> {
  const month = manilaMonthBounds(now);
  const lastMonth = manilaMonthBounds(new Date(month.from.getTime() - 1));
  const shifted = new Date(now.getTime() + MANILA_OFFSET_MS);
  const todayFrom = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      MANILA_OFFSET_MS,
  );
  const todayTo = new Date(todayFrom.getTime() + DAY_MS);
  const weekFrom = new Date(todayFrom.getTime() - ((shifted.getUTCDay() + 6) % 7) * DAY_MS);
  const weekTo = new Date(weekFrom.getTime() + 7 * DAY_MS);
  const previousWeekFrom = new Date(weekFrom.getTime() - 7 * DAY_MS);
  const period = (from: Date, to: Date) => ({ from: from.toISOString(), to: to.toISOString() });

  // A repeatable-read snapshot prevents cards disagreeing during staff updates.
  return prisma.$transaction(
    async (tx) => {
      const [
        donations,
        requests,
        handovers,
        weekdays,
        lowStock,
        activeCampaigns,
        upcoming,
        inventory,
        activity,
      ] = await Promise.all([
        tx.$queryRaw<
          {
            pending: number;
            verified: number;
            verifiedThisMonth: number;
            verifiedLastMonth: number;
            thisWeek: number;
            lastWeek: number;
          }[]
        >`
        SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
          COUNT(*) FILTER (WHERE status = 'VERIFIED' AND "verifiedAt" >= ${month.from} AND "verifiedAt" < ${month.to})::int AS "verifiedThisMonth",
          COUNT(*) FILTER (WHERE status = 'VERIFIED' AND "verifiedAt" >= ${lastMonth.from} AND "verifiedAt" < ${lastMonth.to})::int AS "verifiedLastMonth",
          COUNT(*) FILTER (WHERE "submittedAt" >= ${weekFrom} AND "submittedAt" < ${weekTo})::int AS "thisWeek",
          COUNT(*) FILTER (WHERE "submittedAt" >= ${previousWeekFrom} AND "submittedAt" < ${weekFrom})::int AS "lastWeek"
        FROM "Donation"`,
        tx.$queryRaw<{ review: number; awaitingStock: number }[]>`
        SELECT COUNT(*) FILTER (WHERE r.status IN ('PENDING', 'UNDER_REVIEW'))::int AS review,
          COUNT(*) FILTER (WHERE r.status = 'APPROVED' AND EXISTS (
            SELECT 1 FROM "RequestedItem" ri
            LEFT JOIN "InventoryItem" i ON i."itemTypeId" = ri."itemTypeId" AND i."campaignId" = r."campaignId"
            WHERE ri."requestId" = r.id GROUP BY ri."itemTypeId"
            HAVING SUM(ri.quantity) > COALESCE(MAX(i.available), 0)
          ))::int AS "awaitingStock"
        FROM "AssistanceRequest" r`,
        tx.$queryRaw<
          {
            served: number;
            servedThisMonth: number;
            servedLastMonth: number;
            unitsThisMonth: number;
            unitsLastMonth: number;
            unitsLastWeek: number;
          }[]
        >`
        SELECT COUNT(DISTINCT d."requestId")::int AS served,
          COUNT(DISTINCT d."requestId") FILTER (WHERE d."distributedAt" >= ${month.from} AND d."distributedAt" < ${month.to})::int AS "servedThisMonth",
          COUNT(DISTINCT d."requestId") FILTER (WHERE d."distributedAt" >= ${lastMonth.from} AND d."distributedAt" < ${lastMonth.to})::int AS "servedLastMonth",
          COALESCE(SUM(di.quantity) FILTER (WHERE d."distributedAt" >= ${month.from} AND d."distributedAt" < ${month.to}), 0)::float8 AS "unitsThisMonth",
          COALESCE(SUM(di.quantity) FILTER (WHERE d."distributedAt" >= ${lastMonth.from} AND d."distributedAt" < ${lastMonth.to}), 0)::float8 AS "unitsLastMonth",
          COALESCE(SUM(di.quantity) FILTER (WHERE d."distributedAt" >= ${previousWeekFrom} AND d."distributedAt" < ${weekFrom}), 0)::float8 AS "unitsLastWeek"
        FROM "Distribution" d LEFT JOIN "DistributionItem" di ON di."distributionId" = d.id
        WHERE d.status = 'DISTRIBUTED'`,
        tx.$queryRaw<{ day: number; count: number }[]>`
        SELECT (EXTRACT(ISODOW FROM "submittedAt" AT TIME ZONE 'Asia/Manila')::int - 1) AS day, COUNT(*)::int AS count
        FROM "Donation" WHERE "submittedAt" >= ${weekFrom} AND "submittedAt" < ${weekTo} GROUP BY day`,
        tx.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM "InventoryItem" i JOIN "ItemType" t ON t.id = i."itemTypeId"
        WHERE i.available <= t."lowStockThreshold"`,
        tx.campaign.count({ where: { status: 'ACTIVE' } }),
        tx.calendarEvent.findMany({
          where: { type: 'DISTRIBUTION', status: 'SCHEDULED', endAt: { gt: now } },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            campaign: { select: { name: true } },
          },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
          take: 4,
        }),
        tx.inventoryItem.findMany({
          select: {
            id: true,
            available: true,
            itemType: { select: { name: true, unit: true, lowStockThreshold: true } },
            campaign: { select: { name: true } },
          },
          orderBy: [{ available: 'desc' }, { id: 'asc' }],
          take: 4,
        }),
        tx.auditLog.findMany({
          select: { id: true, action: true, entityType: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 5,
        }),
      ]);
      const distributionsToday = await tx.calendarEvent.count({
        where: {
          type: 'DISTRIBUTION',
          status: 'SCHEDULED',
          startAt: { lt: todayTo },
          endAt: { gt: todayFrom },
        },
      });
      const donation = donations[0];
      const request = requests[0];
      const handover = handovers[0];
      if (!donation || !request || !handover) throw internal('Dashboard aggregates missing');
      return {
        asOf: now.toISOString(),
        periods: {
          thisMonth: period(month.from, month.to),
          lastMonth: period(lastMonth.from, lastMonth.to),
          thisWeek: period(weekFrom, weekTo),
          lastWeek: period(previousWeekFrom, weekFrom),
        },
        needsAttention: {
          donationsAwaitingVerification: donation.pending,
          requestsAwaitingReview: request.review,
          distributionsToday,
          lowStockItems: lowStock[0]?.count ?? 0,
        },
        awaitingStock: request.awaitingStock,
        donationActivity: {
          thisWeek: donation.thisWeek,
          lastWeek: donation.lastWeek,
          byWeekday: Array.from(
            { length: 7 },
            (_, day) => weekdays.find((row) => row.day === day)?.count ?? 0,
          ),
        },
        goodsDistributed: {
          thisMonth: handover.unitsThisMonth,
          lastMonth: handover.unitsLastMonth,
          lastWeek: handover.unitsLastWeek,
        },
        beneficiariesServed: {
          total: handover.served,
          thisMonth: handover.servedThisMonth,
          lastMonth: handover.servedLastMonth,
        },
        verifiedDonations: {
          total: donation.verified,
          thisMonth: donation.verifiedThisMonth,
          lastMonth: donation.verifiedLastMonth,
        },
        activeCampaigns,
        upcomingDistributions: upcoming.map((row) => ({
          id: row.id,
          title: row.title,
          campaignName: row.campaign.name,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
        })),
        inventory: inventory.map((row) => ({
          id: row.id,
          itemTypeName: row.itemType.name,
          unit: row.itemType.unit,
          campaignName: row.campaign.name,
          available: row.available,
          lowStock: row.available <= row.itemType.lowStockThreshold,
        })),
        recentActivity: activity.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      };
    },
    { ...txOptions, isolationLevel: 'RepeatableRead' },
  );
}
