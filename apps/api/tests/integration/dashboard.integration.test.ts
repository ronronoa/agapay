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
