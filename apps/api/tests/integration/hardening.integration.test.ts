import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { accessTokenResponseSchema } from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { env } from '../../src/lib/env.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import {
  assertSafeDemo,
  DEMO_DONOR_EMAIL,
  seedDemoData,
  type DemoConfig,
} from '../../prisma/demo.js';

const app = createApp();
const run = `${process.pid}-${Date.now()}`;
const tokens = { ADMIN: '', STAFF: '', DONOR: '' };
let staffId = '';
const config: DemoConfig = {
  nodeEnv: 'test',
  databaseUrl: env.DATABASE_URL,
  directUrl: env.DIRECT_URL,
  emailProvider: 'console',
  googleEnabled: false,
  password: 'local demo test secret',
};
beforeAll(async () => {
  const password = 'hardening integration secret';
  const passwordHash = await hashPassword(password);
  for (const [index, role] of (['ADMIN', 'STAFF', 'DONOR'] as const).entries()) {
    const email = `hardening-${role.toLowerCase()}-${run}@example.invalid`;
    const user = await prisma.user.create({
      data: { name: 'Hardening fixture', email, role, passwordHash },
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `198.18.10.${index + 1}`)
      .send({ email, password });
    tokens[role] = accessTokenResponseSchema.parse(res.body).data.accessToken;
    if (role === 'STAFF') staffId = user.id;
  }
});
describe('M5E authorization and demo rehearsal', () => {
  it('enforces the M5 read permission matrix and disables API caching', async () => {
    const paths = [
      '/users',
      '/settings',
      '/audit-logs',
      '/reports/donations',
      '/notifications/emails',
      '/dashboard/admin',
      '/item-types',
    ];
    for (const role of ['ADMIN', 'STAFF', 'DONOR', 'anonymous'] as const) {
      for (const path of paths) {
        const req = request(app).get(`/api/v1${path}`);
        if (role !== 'anonymous') req.set('Authorization', `Bearer ${tokens[role]}`);
        const res = await req;
        const denied =
          role === 'DONOR' || (role === 'STAFF' && ['/users', '/settings'].includes(path));
        expect(res.status, `${role} ${path}`).toBe(role === 'anonymous' ? 401 : denied ? 403 : 200);
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
  });
  it('rechecks current role and activation despite a previously issued access token', async () => {
    try {
      await prisma.user.update({ where: { id: staffId }, data: { role: 'DONOR' } });
      expect(
        (
          await request(app)
            .get('/api/v1/reports/donations')
            .set('Authorization', `Bearer ${tokens.STAFF}`)
        ).status,
      ).toBe(401);
      await prisma.user.update({ where: { id: staffId }, data: { isActive: false } });
      expect(
        (await request(app).get('/api/v1/donations').set('Authorization', `Bearer ${tokens.STAFF}`))
          .status,
      ).toBe(401);
    } finally {
      await prisma.user.update({ where: { id: staffId }, data: { role: 'STAFF', isActive: true } });
    }
  });
  it('refuses production, hosted targets, live integrations, invalid URLs and missing credentials before writes', () => {
    for (const overrides of [
      { nodeEnv: 'production' },
      { databaseUrl: 'postgresql://secret@hosted.example.invalid/db' },
      { directUrl: 'postgresql://secret@hosted.example.invalid/db' },
      { databaseUrl: 'invalid-secret-url' },
      { emailProvider: 'smtp' },
      { googleEnabled: true },
      { password: undefined },
    ])
      expect(() => assertSafeDemo({ ...config, ...overrides })).toThrow();
  });
  it('rehearses concurrent/repeated seeds with consistent stock/history and no outbound messages', async () => {
    const emailCount = await prisma.emailNotification.count();
    const results = await Promise.all([seedDemoData(prisma, config), seedDemoData(prisma, config)]);
    expect(results[0]?.campaignId).toBe(results[1]?.campaignId);
    const campaignId = results[0]?.campaignId;
    if (!campaignId) throw new Error('Demo campaign missing.');
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        donations: true,
        requests: true,
        inventoryItems: { include: { movements: { orderBy: { createdAt: 'asc' } } } },
        events: { include: { distributions: { include: { items: true } } } },
      },
    });
    expect(campaign.donations).toHaveLength(3);
    expect(campaign.requests).toHaveLength(4);
    expect(campaign.events).toHaveLength(3);
    expect(campaign.inventoryItems[0]).toMatchObject({
      available: 20,
      reserved: 5,
      distributed: 5,
    });
    expect(campaign.inventoryItems[0]?.movements.map((movement) => movement.type)).toEqual([
      'DONATION_IN',
      'RESERVE',
      'DISTRIBUTE',
      'RESERVE',
    ]);
    const allocations = campaign.events.flatMap((event) => event.distributions);
    expect(allocations).toHaveLength(2);
    expect(allocations.find((row) => row.status === 'DISTRIBUTED')?.items[0]?.quantity).toBe(5);
    expect(await prisma.emailNotification.count()).toBe(emailCount);
    expect(campaign.requests.every((row) => row.email.endsWith('@agapay-demo.invalid'))).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: DEMO_DONOR_EMAIL } })).role).toBe(
      'DONOR',
    );
    const again = await seedDemoData(prisma, config);
    expect(again).toEqual({ campaignId, created: false });
  });
});
