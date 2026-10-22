import { Prisma } from '@prisma/client';
import type { Report, ReportKind, ReportQuery } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';

type DonationReport = Extract<Report, { kind: 'donations' }>;
type RequestReport = Extract<Report, { kind: 'requests' }>;
type InventoryReport = Extract<Report, { kind: 'inventory' }>;
type DistributionReport = Extract<Report, { kind: 'distributions' }>;

export async function generate(kind: ReportKind, query: ReportQuery, now: Date): Promise<Report> {
  const from = query.from ? new Date(`${query.from}T00:00:00+08:00`) : null;
  const to = query.to
    ? new Date(new Date(`${query.to}T00:00:00+08:00`).getTime() + 86400000)
    : null;
  const campaign = query.campaignId ? Prisma.sql`AND c.id = ${query.campaignId}` : Prisma.empty;
  const dates = (column: Prisma.Sql) =>
    Prisma.sql`${from ? Prisma.sql`AND ${column} >= ${from}` : Prisma.empty} ${to ? Prisma.sql`AND ${column} < ${to}` : Prisma.empty}`;
  const base = {
    asOf: now.toISOString(),
    from: query.from ?? null,
    to: query.to ?? null,
    campaignId: query.campaignId ?? null,
  };
  return prisma.$transaction(
    async (tx): Promise<Report> => {
      switch (kind) {
        case 'donations': {
          const filter = Prisma.sql`${campaign} ${dates(Prisma.sql`d."submittedAt"`)}`;
          const [byStatus, byCampaign, byItem, byMonth] = await Promise.all([
            tx.$queryRaw<
              DonationReport['byStatus']
            >`SELECT d.status::text AS status, COUNT(*)::int AS count FROM "Donation" d JOIN "Campaign" c ON c.id = d."campaignId" WHERE true ${filter} GROUP BY d.status ORDER BY d.status`,
            tx.$queryRaw<
              DonationReport['byCampaign']
            >`SELECT c.id AS "campaignId", c.name AS "campaignName", COUNT(*)::int AS count FROM "Donation" d JOIN "Campaign" c ON c.id = d."campaignId" WHERE true ${filter} GROUP BY c.id, c.name ORDER BY c.name, c.id`,
            tx.$queryRaw<
              DonationReport['byItem']
            >`SELECT t.id AS "itemTypeId", t.name AS "itemTypeName", t.unit, SUM(i."quantityDeclared")::float8 AS declared, COALESCE(SUM(i."quantityReceived"), 0)::float8 AS received FROM "DonationItem" i JOIN "Donation" d ON d.id = i."donationId" JOIN "Campaign" c ON c.id = d."campaignId" JOIN "ItemType" t ON t.id = i."itemTypeId" WHERE true ${filter} GROUP BY t.id, t.name, t.unit ORDER BY t.name, t.id`,
            tx.$queryRaw<
              DonationReport['byMonth']
            >`SELECT to_char(d."submittedAt" AT TIME ZONE 'Asia/Manila', 'YYYY-MM') AS month, COUNT(*)::int AS count FROM "Donation" d JOIN "Campaign" c ON c.id = d."campaignId" WHERE true ${filter} GROUP BY month ORDER BY month`,
          ]);
          return {
            ...base,
            kind,
            total: byStatus.reduce((sum, row) => sum + row.count, 0),
            byStatus,
            byCampaign,
            byItem,
            byMonth,
          };
        }
        case 'requests': {
          const filter = Prisma.sql`${campaign} ${dates(Prisma.sql`r."submittedAt"`)}`;
          const [summary, byStatus, byCampaign, byBarangay] = await Promise.all([
            tx.$queryRaw<
              { total: number; averageReviewHours: number | null }[]
            >`SELECT COUNT(*)::int AS total, ROUND(AVG(EXTRACT(EPOCH FROM (r."reviewedAt" - r."submittedAt")) / 3600) FILTER (WHERE r."reviewedAt" >= r."submittedAt"), 2)::float8 AS "averageReviewHours" FROM "AssistanceRequest" r JOIN "Campaign" c ON c.id = r."campaignId" WHERE true ${filter}`,
            tx.$queryRaw<
              RequestReport['byStatus']
            >`SELECT r.status::text AS status, COUNT(*)::int AS count FROM "AssistanceRequest" r JOIN "Campaign" c ON c.id = r."campaignId" WHERE true ${filter} GROUP BY r.status ORDER BY r.status`,
            tx.$queryRaw<
              RequestReport['byCampaign']
            >`SELECT c.id AS "campaignId", c.name AS "campaignName", COUNT(*)::int AS count FROM "AssistanceRequest" r JOIN "Campaign" c ON c.id = r."campaignId" WHERE true ${filter} GROUP BY c.id, c.name ORDER BY c.name, c.id`,
            tx.$queryRaw<
              RequestReport['byBarangay']
            >`SELECT r.barangay, r.city, r.province, COUNT(*)::int AS count FROM "AssistanceRequest" r JOIN "Campaign" c ON c.id = r."campaignId" WHERE true ${filter} GROUP BY r.barangay, r.city, r.province ORDER BY r.province, r.city, r.barangay`,
          ]);
          return {
            ...base,
            kind,
            total: summary[0]?.total ?? 0,
            averageReviewHours: summary[0]?.averageReviewHours ?? null,
            byStatus,
            byCampaign,
            byBarangay,
          };
        }
        case 'inventory': {
          const [stock, movements] = await Promise.all([
            tx.$queryRaw<
              InventoryReport['stock']
            >`SELECT c.name AS "campaignName", t.name AS "itemTypeName", t.unit, i.available, i.reserved, i.distributed, (i.available <= t."lowStockThreshold") AS "lowStock" FROM "InventoryItem" i JOIN "Campaign" c ON c.id = i."campaignId" JOIN "ItemType" t ON t.id = i."itemTypeId" WHERE true ${campaign} ORDER BY c.name, t.name, c.id, t.id`,
            tx.$queryRaw<
              InventoryReport['movements']
            >`SELECT c.name AS "campaignName", t.name AS "itemTypeName", t.unit, m.type::text AS type, SUM(m.quantity)::float8 AS quantity FROM "InventoryMovement" m JOIN "InventoryItem" i ON i.id = m."inventoryItemId" JOIN "Campaign" c ON c.id = i."campaignId" JOIN "ItemType" t ON t.id = i."itemTypeId" WHERE true ${campaign} ${dates(Prisma.sql`m."createdAt"`)} GROUP BY c.id, c.name, t.id, t.name, t.unit, m.type ORDER BY c.name, t.name, m.type, c.id, t.id`,
          ]);
          return {
            ...base,
            kind,
            total: stock.length,
            lowStockRows: stock.filter((row) => row.lowStock).length,
            stock,
            movements,
          };
        }
        case 'distributions': {
          const filter = Prisma.sql`${campaign} ${dates(Prisma.sql`d."distributedAt"`)}`;
          const [byCampaign, byItem, byBarangay] = await Promise.all([
            tx.$queryRaw<
              DistributionReport['byCampaign']
            >`SELECT c.id AS "campaignId", c.name AS "campaignName", COUNT(*)::int AS count FROM "Distribution" d JOIN "AssistanceRequest" r ON r.id = d."requestId" JOIN "Campaign" c ON c.id = r."campaignId" WHERE d.status = 'DISTRIBUTED' ${filter} GROUP BY c.id, c.name ORDER BY c.name, c.id`,
            tx.$queryRaw<
              DistributionReport['byItem']
            >`SELECT t.id AS "itemTypeId", t.name AS "itemTypeName", t.unit, SUM(di.quantity)::float8 AS quantity FROM "DistributionItem" di JOIN "Distribution" d ON d.id = di."distributionId" JOIN "AssistanceRequest" r ON r.id = d."requestId" JOIN "Campaign" c ON c.id = r."campaignId" JOIN "InventoryItem" i ON i.id = di."inventoryItemId" JOIN "ItemType" t ON t.id = i."itemTypeId" WHERE d.status = 'DISTRIBUTED' ${filter} GROUP BY t.id, t.name, t.unit ORDER BY t.name, t.id`,
            tx.$queryRaw<
              DistributionReport['byBarangay']
            >`SELECT r.barangay, r.city, r.province, COUNT(DISTINCT d.id)::int AS handovers, COALESCE(SUM(di.quantity), 0)::float8 AS quantity FROM "Distribution" d JOIN "AssistanceRequest" r ON r.id = d."requestId" JOIN "Campaign" c ON c.id = r."campaignId" LEFT JOIN "DistributionItem" di ON di."distributionId" = d.id WHERE d.status = 'DISTRIBUTED' ${filter} GROUP BY r.barangay, r.city, r.province ORDER BY r.province, r.city, r.barangay`,
          ]);
          return {
            ...base,
            kind,
            total: byCampaign.reduce((sum, row) => sum + row.count, 0),
            units: byItem.reduce((sum, row) => sum + row.quantity, 0),
            byCampaign,
            byItem,
            byBarangay,
          };
        }
      }
    },
    { ...txOptions, isolationLevel: 'RepeatableRead' },
  );
}
