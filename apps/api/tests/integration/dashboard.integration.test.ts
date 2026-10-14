import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  UserRole,
  accessTokenResponseSchema,
  donorDashboardResponseSchema,
  errorEnvelopeSchema,
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
  });
});
