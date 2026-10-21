import { randomUUID } from 'node:crypto';
import { adminDashboardResponseSchema } from '@agapay/shared';
import { adminDashboard, donorDashboard } from '../../src/modules/dashboard/dashboard.service.js';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  UserRole,
  accessTokenResponseSchema,
  donorDashboardResponseSchema,
  errorEnvelopeSchema,
  publicStatsResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const app = createApp();
const PASSWORD = 'integration test secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let seq = 0;
const uniqueIp = (): string => `198.51.100.${((seq += 1) % 250) + 1}`;

function parse<T>(res: request.Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error('unexpected response body');
  return parsed.data;
}

interface Actor {
  token: string;
  id: string;
}

async function makeDonor(): Promise<Actor> {
  const email = `dash-${RUN}-${seq++}@example.com`;
  const user = await prisma.user.create({
    data: {
      name: 'Dash Donor',
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: UserRole.DONOR,
      emailVerifiedAt: new Date(),
    },
  });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp())
    .send({ email, password: PASSWORD });
  return { token: parse(res, accessTokenResponseSchema).data.accessToken, id: user.id };
}

describe('GET /dashboard/donor', () => {
  it('rejects unauthenticated and non-donor callers', async () => {
    const anon = await request(app)
      .get('/api/v1/dashboard/donor')
      .set('X-Forwarded-For', uniqueIp());
    expect(anon.status).toBe(401);

    const staffEmail = `dash-staff-${RUN}@example.com`;
    await prisma.user.create({
      data: {
        name: 'Dash Staff',
        email: staffEmail,
        passwordHash: await hashPassword(PASSWORD),
        role: UserRole.STAFF,
        emailVerifiedAt: new Date(),
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email: staffEmail, password: PASSWORD });
    const staffToken = parse(login, accessTokenResponseSchema).data.accessToken;
    const forbidden = await request(app)
      .get('/api/v1/dashboard/donor')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    expect(forbidden.status).toBe(403);
    expect(parse(forbidden, errorEnvelopeSchema).error.code).toBe('FORBIDDEN');
  });

  it('returns only the caller’s own aggregates', async () => {
    const donor = await makeDonor();
    const other = await makeDonor();
    const campaign = await prisma.campaign.create({
      data: {
        name: `Dash Camp ${RUN}`,
        slug: `dash-camp-${RUN}`,
        description: 'dashboard fixture',
        calamityType: 'TYPHOON',
        status: 'ACTIVE',
        startDate: new Date(),
        createdById: donor.id,
      },
      select: { id: true },
    });
    const itemType = await prisma.itemType.create({
      data: { name: `Dash Item ${RUN}`, category: 'HYGIENE', unit: 'kit' },
      select: { id: true },
    });
    const donate = async (donorId: string, ref: string): Promise<void> => {
      const created = await prisma.donation.create({
        data: {
          referenceNumber: `${ref}-${RUN}`,
          donorId,
          campaignId: campaign.id,
          status: 'COMPLETED',
          items: {
            create: [{ itemTypeId: itemType.id, quantityDeclared: 4, quantityReceived: 3 }],
          },
        },
        select: { id: true },
      });
      void created;
    };
    await donate(donor.id, 'DON-DASH-1');
    await donate(donor.id, 'DON-DASH-2');
    await donate(other.id, 'DON-DASH-3');

    const res = await request(app)
      .get('/api/v1/dashboard/donor')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`);
    expect(res.status).toBe(200);
    const body = parse(res, donorDashboardResponseSchema).data;
    expect(body.totalDonations).toBe(2);
    expect(body.totalItemsReceived).toBe(6);
    expect(body.campaignsSupported).toBe(1);
    expect(body.recent).toHaveLength(2);
    expect(body.activeCampaigns).toBeGreaterThanOrEqual(1);
    expect(body.donationsThisMonth).toBe(2);
    expect(body.featuredCampaign).not.toBeNull();
    expect(typeof body.featuredCampaign?.raisedUnits).toBe('number');
  });

  it('measures campaign goal and progress from real donations (BR-DON-06)', async () => {
    const donor = await makeDonor();
    const itemType = await prisma.itemType.create({
      data: { name: `Goal Item ${RUN}`, category: 'FOOD', unit: 'pack' },
      select: { id: true },
    });
    // Any end date beats the campaigns that have none, so this one is
    // deterministically the featured pick.
    const campaign = await prisma.campaign.create({
      data: {
        name: `Goal Camp ${RUN}`,
        slug: `goal-camp-${RUN}`,
        description: 'goal fixture',
        calamityType: 'FLOOD',
        status: 'ACTIVE',
        startDate: new Date('2000-01-01'),
        endDate: new Date('2099-01-01'),
        priorityItems: { create: [{ itemTypeId: itemType.id, targetQuantity: 10 }] },
      },
      select: { id: true },
    });
    const gift = async (
      status: 'VERIFIED' | 'PENDING',
      quantityDeclared: number,
    ): Promise<void> => {
      await prisma.donation.create({
        data: {
          referenceNumber: `DON-GOAL-${status}-${RUN}-${seq++}`,
          donorId: donor.id,
          campaignId: campaign.id,
          status,
          items: { create: [{ itemTypeId: itemType.id, quantityDeclared }] },
        },
      });
    };
    await gift('VERIFIED', 4);
    await gift('PENDING', 6);

    const res = await request(app)
      .get('/api/v1/dashboard/donor')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`);
    expect(res.status).toBe(200);
    const featured = parse(res, donorDashboardResponseSchema).data.featuredCampaign;
    // Prior runs leave their own copy of this fixture behind, so assert on the
    // fixture's values rather than this run's row id.
    expect(featured?.name.startsWith('Goal Camp')).toBe(true);
    expect(featured?.goalUnits).toBe(10);
    // Only the verified gift counts; the pending one must not move the bar.
    expect(featured?.raisedUnits).toBe(4);
  });
});

describe('GET /public/stats', () => {
  it('returns non-negative totals that move with a verified donation', async () => {
    const donor = await makeDonor();
    const campaign = await prisma.campaign.create({
      data: {
        name: `Stats Camp ${RUN}`,
        slug: `stats-camp-${RUN}`,
        description: 'stats fixture',
        calamityType: 'TYPHOON',
        status: 'ACTIVE',
        startDate: new Date(),
      },
      select: { id: true },
    });
    const itemType = await prisma.itemType.create({
      data: { name: `Stats Item ${RUN}`, category: 'WATER', unit: 'liter' },
      select: { id: true },
    });
    await prisma.donation.create({
      data: {
        referenceNumber: `DON-STATS-${RUN}`,
        donorId: donor.id,
        campaignId: campaign.id,
        status: 'VERIFIED',
        items: { create: [{ itemTypeId: itemType.id, quantityDeclared: 5 }] },
      },
    });

    const res = await request(app).get('/api/v1/public/stats').set('X-Forwarded-For', uniqueIp());
    expect(res.status).toBe(200);
    const body = parse(res, publicStatsResponseSchema).data;
    expect(body.verifiedDonations).toBeGreaterThanOrEqual(1);
    expect(body.beneficiariesServed).toBeGreaterThanOrEqual(0);
    expect(body.goodsDistributedThisMonth).toBeGreaterThanOrEqual(0);
  });
});

async function dashboardCampaign(label: string) {
  return prisma.campaign.create({
    data: {
      name: `${label}-${RUN}-${seq++}`,
      slug: `${label.toLowerCase()}-${RUN}-${seq++}`,
      description: 'Dashboard test',
      calamityType: 'FLOOD',
      status: 'ACTIVE',
      startDate: new Date('2020-01-01'),
    },
  });
}

describe('M5A admin summary', () => {
  it('allows admins/staff and denies donors/anonymous callers', async () => {
    expect((await request(app).get('/api/v1/dashboard/admin')).status).toBe(401);
    const donor = await makeDonor();
    expect(
      (
        await request(app)
          .get('/api/v1/dashboard/admin')
          .set('Authorization', `Bearer ${donor.token}`)
      ).status,
    ).toBe(403);
    for (const role of ['ADMIN', 'STAFF'] as const) {
      const email = `dash-${role.toLowerCase()}-${RUN}-${seq++}@example.com`;
      await prisma.user.create({
        data: {
          name: 'Dashboard Personnel',
          role,
          email,
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      const login = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', uniqueIp())
        .send({ email, password: PASSWORD });
      const token = parse(login, accessTokenResponseSchema).data.accessToken;
      const response = await request(app)
        .get('/api/v1/dashboard/admin')
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      parse(response, adminDashboardResponseSchema);
      expect(JSON.stringify(response.body)).not.toContain(email);
      expect(JSON.stringify(response.body)).not.toContain('actorName');
    }
  });

  it('counts every record, uses Manila half-open dates, and sums actual handovers', async () => {
    const now = new Date('2026-11-01T00:05:00+08:00');
    const before = await adminDashboard(now);
    const donor = await makeDonor();
    const campaign = await dashboardCampaign('Volume');
    const item = await prisma.itemType.create({
      data: { name: `Dash volume ${RUN}`, category: 'FOOD', unit: 'pack', lowStockThreshold: 2 },
    });
    const stock = await prisma.inventoryItem.create({
      data: { itemTypeId: item.id, campaignId: campaign.id, available: 2 },
    });
    const event = await prisma.calendarEvent.create({
      data: {
        type: 'DISTRIBUTION',
        campaignId: campaign.id,
        title: 'Cross-month distribution',
        location: 'Test hall',
        startAt: new Date('2026-10-31T15:00:00Z'),
        endAt: new Date('2026-11-01T01:00:00Z'),
      },
    });
    const requestIds = Array.from({ length: 122 }, () => randomUUID());
    await prisma.assistanceRequest.createMany({
      data: requestIds.map((id, index) => ({
        id,
        referenceNumber: `REQ-DASH-${RUN}-${index}`,
        fullName: 'Private Recipient',
        email: `recipient-${RUN}-${index}@example.com`,
        contactNumber: '09171234567',
        barangay: 'Test',
        city: 'Test',
        province: 'Test',
        campaignId: campaign.id,
        status: 'DISTRIBUTED' as const,
        consentAt: now,
        submittedAt: new Date('2020-01-01'),
      })),
    });
    const distributionIds = requestIds.map(() => randomUUID());
    await prisma.distribution.createMany({
      data: distributionIds.map((id, index) => ({
        id,
        requestId: requestIds[index] ?? '',
        calendarEventId: event.id,
        status: 'DISTRIBUTED' as const,
        receivedByName: 'Private Recipient',
        distributedAt:
          index < 121 ? new Date('2026-10-31T16:00:00Z') : new Date('2026-10-31T15:59:59.999Z'),
      })),
    });
    await prisma.distributionItem.createMany({
      data: distributionIds.map((distributionId) => ({
        distributionId,
        inventoryItemId: stock.id,
        quantity: 2,
      })),
    });
    await prisma.donation.createMany({
      data: Array.from({ length: 122 }, (_, index) => ({
        referenceNumber: `DON-DASH-VOLUME-${RUN}-${index}`,
        donorId: donor.id,
        campaignId: campaign.id,
        status: 'PENDING' as const,
        submittedAt:
          index < 121 ? new Date('2026-10-31T16:00:00Z') : new Date('2026-10-25T16:00:00Z'),
      })),
    });
    const after = await adminDashboard(now);
    expect(
      after.needsAttention.donationsAwaitingVerification -
        before.needsAttention.donationsAwaitingVerification,
    ).toBe(122);
    expect(after.goodsDistributed.thisMonth - before.goodsDistributed.thisMonth).toBe(242);
    expect(after.goodsDistributed.lastMonth - before.goodsDistributed.lastMonth).toBe(2);
    expect(after.beneficiariesServed.total - before.beneficiariesServed.total).toBe(122);
    expect(after.beneficiariesServed.thisMonth - before.beneficiariesServed.thisMonth).toBe(121);
    expect(after.beneficiariesServed.lastMonth - before.beneficiariesServed.lastMonth).toBe(1);
    expect(after.donationActivity.thisWeek - before.donationActivity.thisWeek).toBe(122);
    expect(
      (after.donationActivity.byWeekday[6] ?? 0) - (before.donationActivity.byWeekday[6] ?? 0),
    ).toBe(121);
    expect(
      (after.donationActivity.byWeekday[0] ?? 0) - (before.donationActivity.byWeekday[0] ?? 0),
    ).toBe(1);
    expect(after.needsAttention.distributionsToday - before.needsAttention.distributionsToday).toBe(
      1,
    );
    expect(after.needsAttention.lowStockItems - before.needsAttention.lowStockItems).toBe(1);
    expect(after.periods.thisMonth.from).toBe('2026-10-31T16:00:00.000Z');
    const monday = await adminDashboard(new Date('2026-11-02T00:00:00+08:00'));
    expect(monday.periods.thisWeek.from).toBe('2026-11-01T16:00:00.000Z');
    // Sunday gifts cannot spill into Monday's week.
    expect(monday.donationActivity.lastWeek).toBe(after.donationActivity.thisWeek);
  });

  it('counts review/shortage queues and excludes cancelled, closed and ended events from upcoming', async () => {
    const now = new Date('2026-11-10T12:00:00+08:00');
    const before = await adminDashboard(now);
    const campaign = await dashboardCampaign('Queues');
    const item = await prisma.itemType.create({
      data: { name: `Dash queues ${RUN}`, category: 'WATER', unit: 'bottle' },
    });
    await prisma.inventoryItem.create({
      data: { itemTypeId: item.id, campaignId: campaign.id, available: 2 },
    });
    for (const [index, status] of (
      ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'APPROVED'] as const
    ).entries()) {
      await prisma.assistanceRequest.create({
        data: {
          referenceNumber: `REQ-DASH-QUEUE-${RUN}-${index}`,
          fullName: 'Private Queue',
          email: `queue-${RUN}-${index}@example.com`,
          contactNumber: '09171234567',
          barangay: 'Test',
          city: 'Test',
          province: 'Test',
          campaignId: campaign.id,
          status,
          consentAt: now,
          items: { create: [{ itemTypeId: item.id, quantity: index === 2 ? 3 : 2 }] },
        },
      });
    }
    for (const status of ['CANCELLED', 'COMPLETED'] as const) {
      await prisma.calendarEvent.create({
        data: {
          type: 'DISTRIBUTION',
          campaignId: campaign.id,
          title: `Excluded ${status}`,
          location: 'Test hall',
          status,
          startAt: now,
          endAt: new Date('2026-11-10T22:00:00+08:00'),
        },
      });
    }
    const endingAtMidnight = await prisma.calendarEvent.create({
      data: {
        type: 'DISTRIBUTION',
        campaignId: campaign.id,
        title: 'Ended at day boundary',
        location: 'Test hall',
        startAt: new Date('2026-11-09T18:00:00+08:00'),
        endAt: new Date('2026-11-10T00:00:00+08:00'),
      },
    });
    await prisma.donation.create({
      data: {
        referenceNumber: `DON-DASH-VERIFIED-${RUN}`,
        donorId: (await makeDonor()).id,
        campaignId: campaign.id,
        status: 'VERIFIED',
        submittedAt: new Date('2020-01-01'),
        verifiedAt: now,
      },
    });
    const after = await adminDashboard(now);
    expect(
      after.needsAttention.requestsAwaitingReview - before.needsAttention.requestsAwaitingReview,
    ).toBe(2);
    expect(after.awaitingStock - before.awaitingStock).toBe(1);
    expect(after.needsAttention.distributionsToday).toBe(before.needsAttention.distributionsToday);
    expect(after.upcomingDistributions.some((event) => event.id === endingAtMidnight.id)).toBe(
      false,
    );
    expect(after.upcomingDistributions.every((event) => new Date(event.endAt) > now)).toBe(true);
    expect(after.verifiedDonations.thisMonth - before.verifiedDonations.thisMonth).toBe(1);
  });

  it('keeps donor totals independent of recent-list limits and isolates another donor', async () => {
    const donor = await makeDonor();
    const other = await makeDonor();
    const campaign = await dashboardCampaign('DonorVolume');
    const item = await prisma.itemType.create({
      data: { name: `Dash donor ${RUN}`, category: 'HYGIENE', unit: 'kit' },
    });
    const now = new Date('2026-11-01T00:05:00+08:00');
    const ids = Array.from({ length: 121 }, () => randomUUID());
    await prisma.donation.createMany({
      data: ids.map((id, index) => ({
        id,
        referenceNumber: `DON-DASH-OWN-${RUN}-${index}`,
        donorId: donor.id,
        campaignId: campaign.id,
        status: 'COMPLETED' as const,
        submittedAt: new Date('2026-10-31T16:00:00Z'),
      })),
    });
    await prisma.donationItem.createMany({
      data: ids.map((donationId) => ({
        donationId,
        itemTypeId: item.id,
        quantityDeclared: 10,
        quantityReceived: 3,
      })),
    });
    await prisma.donation.create({
      data: {
        referenceNumber: `DON-DASH-OTHER-${RUN}`,
        donorId: other.id,
        campaignId: campaign.id,
        status: 'COMPLETED',
        items: { create: [{ itemTypeId: item.id, quantityDeclared: 999, quantityReceived: 999 }] },
      },
    });
    const result = await donorDashboard({ userId: donor.id, role: 'DONOR' }, now);
    expect(result.totalDonations).toBe(121);
    expect(result.donationsThisMonth).toBe(121);
    expect(result.totalItemsReceived).toBe(363);
    expect(result.recent).toHaveLength(5);
    expect(result.byStatus).toEqual([{ status: 'COMPLETED', count: 121 }]);
    expect(result.campaignsSupported).toBe(1);
  });
});

describe('M5A bounded dashboard previews', () => {
  it('selects upcoming events and highest stock globally beyond 100 rows', async () => {
    const latest = await prisma.calendarEvent.aggregate({ _max: { endAt: true } });
    const now = new Date(
      Math.ceil(
        Math.max(
          Date.parse('2199-01-01T00:00:00Z'),
          (latest._max.endAt?.getTime() ?? 0) + 86400000,
        ) / 86400000,
      ) * 86400000,
    );
    const before = await adminDashboard(now);
    const campaign = await dashboardCampaign('Previews');
    const itemIds = Array.from({ length: 121 }, () => randomUUID());
    await prisma.itemType.createMany({
      data: itemIds.map((id, index) => ({
        id,
        name: `Dash preview ${RUN}-${index}`,
        category: 'FOOD' as const,
        unit: 'pack',
        lowStockThreshold: 0,
      })),
    });
    const top = (before.inventory[0]?.available ?? 0) + 10;
    await prisma.inventoryItem.createMany({
      data: itemIds.map((itemTypeId, index) => ({
        itemTypeId,
        campaignId: campaign.id,
        available: index === 120 ? top : 1,
        updatedAt: new Date('2020-01-01'),
      })),
    });
    const eventIds = Array.from({ length: 121 }, () => randomUUID());
    await prisma.calendarEvent.createMany({
      data: eventIds.map((id, index) => ({
        id,
        campaignId: campaign.id,
        type: 'DISTRIBUTION' as const,
        title: `Preview ${index}`,
        location: 'Test hall',
        startAt: new Date(now.getTime() + (121 - index) * 60000),
        endAt: new Date(now.getTime() + (122 - index) * 60000),
      })),
    });
    await prisma.calendarEvent.create({
      data: {
        campaignId: campaign.id,
        type: 'DISTRIBUTION',
        title: 'Cancelled earlier event',
        location: 'Test hall',
        status: 'CANCELLED',
        startAt: now,
        endAt: new Date(now.getTime() + 30000),
      },
    });
    const result = await adminDashboard(now);
    expect(result.upcomingDistributions).toHaveLength(4);
    expect(result.upcomingDistributions.map((event) => event.id)).toEqual(
      eventIds.slice(-4).reverse(),
    );
    expect(
      result.needsAttention.distributionsToday - before.needsAttention.distributionsToday,
    ).toBe(121);
    expect(result.inventory).toHaveLength(4);
    expect(result.inventory[0]).toMatchObject({
      itemTypeName: `Dash preview ${RUN}-120`,
      available: top,
      campaignName: campaign.name,
    });
    expect(result.activeCampaigns - before.activeCampaigns).toBe(1);
  });
});
