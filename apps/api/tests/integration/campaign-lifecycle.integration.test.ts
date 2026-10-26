import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  campaignResponseSchema,
  submitDonationSchema,
  submitRequestSchema,
  type CampaignStatus,
  type UserRole,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { systemClock } from '../../src/lib/clock.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { signAccessToken } from '../../src/modules/auth/tokens.js';
import * as campaigns from '../../src/modules/campaigns/campaigns.service.js';
import * as donations from '../../src/modules/donations/donations.service.js';
import * as requests from '../../src/modules/requests/requests.service.js';
import * as calendar from '../../src/modules/calendar/calendar.service.js';
import * as audit from '../../src/modules/audit/audit.service.js';

const app = createApp();
const ids: string[] = [];
const userIds: string[] = [];
type Actor = { userId: string; role: UserRole; token: string };
let admin: Actor;
let root: Actor;
let staff: Actor;
let donor: Actor;
let itemTypeId = '';
async function actor(role: UserRole, passwordHash: string): Promise<Actor> {
  const row = await prisma.user.create({
    data: {
      name: 'Campaign fixture',
      email: `${randomUUID()}@example.invalid`,
      passwordHash,
      role,
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(row.id);
  return { userId: row.id, role, token: await signAccessToken(row, systemClock) };
}
async function fixture(status: CampaignStatus = 'ACTIVE') {
  const row = await prisma.campaign.create({
    data: {
      name: 'Lifecycle fixture',
      slug: randomUUID(),
      description: 'Campaign fixture only.',
      calamityType: 'FLOOD',
      status,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });
  ids.push(row.id);
  return row;
}
const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });
const eventInput = (campaignId: string) => ({
  campaignId,
  title: 'Lifecycle event',
  type: 'DISTRIBUTION' as const,
  startAt: new Date('2027-01-01'),
  endAt: new Date('2027-01-02'),
  location: 'Fixture hall',
});
beforeAll(async () => {
  const hash = await hashPassword('campaign integration fixture password');
  admin = await actor('ADMIN', hash);
  root = await actor('SUPER_ADMIN', hash);
  staff = await actor('STAFF', hash);
  donor = await actor('DONOR', hash);
  const item = await prisma.itemType.findFirst({
    where: { isActive: true, category: { not: 'OTHER' } },
  });
  if (!item) throw new Error('Seeded goods required');
  itemTypeId = item.id;
});
afterAll(async () => {
  const requestRows = await prisma.assistanceRequest.findMany({
    where: { campaignId: { in: ids } },
    select: { id: true },
  });
  const donationRows = await prisma.donation.findMany({
    where: { campaignId: { in: ids } },
    select: { id: true },
  });
  await prisma.emailNotification.deleteMany({
    where: {
      OR: [
        { relatedRequestId: { in: requestRows.map((r) => r.id) } },
        { relatedDonationId: { in: donationRows.map((r) => r.id) } },
      ],
    },
  });
  await prisma.donationItem.deleteMany({
    where: { donationId: { in: donationRows.map((r) => r.id) } },
  });
  await prisma.donation.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.assistanceRequest.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.calendarEvent.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.inventoryItem.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.campaign.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('campaign lifecycle safeguards', () => {
  it('rolls back closure if the audit write fails', async () => {
    const row = await fixture();
    const write = vi.spyOn(audit, 'write').mockRejectedValueOnce(new Error('Audit unavailable'));
    try {
      await expect(campaigns.transition(row.id, 'COMPLETED', admin, systemClock)).rejects.toThrow(
        'Audit unavailable',
      );
      expect((await prisma.campaign.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        'ACTIVE',
      );
    } finally {
      write.mockRestore();
    }
  });
  it('allows Admin and Super Admin actions, but refuses Staff/Donor writes', async () => {
    for (const caller of [admin, root, staff, donor]) {
      const row = await fixture('DRAFT');
      const response = await request(app)
        .post(`/api/v1/campaigns/${row.id}/activate`)
        .set(auth(caller));
      expect(response.status).toBe(caller === staff || caller === donor ? 403 : 200);
    }
  });

  it('protects General Pool and only deletes unused drafts', async () => {
    const pool = await prisma.campaign.findUniqueOrThrow({ where: { slug: 'general-pool' } });
    expect(
      (
        await request(app)
          .patch(`/api/v1/campaigns/${pool.id}`)
          .set(auth(admin))
          .send({ name: 'Changed pool' })
      ).status,
    ).toBe(422);
    for (const status of ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const) {
      const row = await fixture(status);
      expect((await campaigns.getById(row.id)).deletable).toBe(status === 'DRAFT');
      const response = await request(app).delete(`/api/v1/campaigns/${row.id}`).set(auth(admin));
      expect(response.status).toBe(status === 'DRAFT' ? 204 : 409);
    }
  });

  it('validates merged dates when only one date is edited', async () => {
    const row = await fixture();
    for (const input of [{ startDate: '2027-01-01' }, { endDate: '2025-12-01' }]) {
      expect(
        (await request(app).patch(`/api/v1/campaigns/${row.id}`).set(auth(admin)).send(input))
          .status,
      ).toBe(422);
    }
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: row.id } })).startDate).toEqual(
      row.startDate,
    );
  });

  it('rejects stale edits and records only one winning concurrent edit', async () => {
    const row = await fixture();
    const results = await Promise.all(
      ['First edit', 'Second edit'].map((name) =>
        request(app)
          .patch(`/api/v1/campaigns/${row.id}`)
          .set(auth(admin))
          .send({ name, expectedUpdatedAt: row.updatedAt.toISOString() }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditLog.count({ where: { entityId: row.id, action: 'campaign.update' } }),
    ).toBe(1);
  });

  it('reports unresolved work and blocks closure without stock changes or audit writes', async () => {
    const row = await fixture();
    await prisma.donation.create({
      data: { campaignId: row.id, donorId: donor.userId, referenceNumber: randomUUID() },
    });
    await prisma.assistanceRequest.create({
      data: {
        campaignId: row.id,
        referenceNumber: randomUUID(),
        fullName: 'Fixture only',
        email: 'fixture@example.invalid',
        contactNumber: '09170000000',
        barangay: 'Fixture',
        city: 'Fixture',
        province: 'Fixture',
        consentAt: new Date(),
      },
    });
    await calendar.create(eventInput(row.id), admin);
    const stock = await prisma.inventoryItem.create({
      data: { campaignId: row.id, itemTypeId, available: 8, reserved: 2 },
    });
    const response = await request(app).get(`/api/v1/campaigns/${row.id}`).set(auth(admin));
    const detail = campaignResponseSchema.parse(response.body).data;
    expect(detail.closureBlockers).toEqual(
      expect.arrayContaining([
        { blocking: 'donations', count: 1 },
        { blocking: 'requests', count: 1 },
        { blocking: 'events', count: 1 },
        { blocking: 'reservedGoods', count: 2 },
      ]),
    );
    for (const action of ['complete', 'archive'])
      expect(
        (await request(app).post(`/api/v1/campaigns/${row.id}/${action}`).set(auth(admin))).status,
      ).toBe(409);
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).reserved,
    ).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { entityId: row.id, action: { in: ['campaign.completed', 'campaign.archived'] } },
      }),
    ).toBe(0);
  });

  it('preserves unreserved stock and history across completion and archival', async () => {
    const row = await fixture();
    const stock = await prisma.inventoryItem.create({
      data: { campaignId: row.id, itemTypeId, available: 5 },
    });
    await campaigns.transition(row.id, 'COMPLETED', admin, systemClock);
    await campaigns.transition(row.id, 'ARCHIVED', admin, systemClock);
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: stock.id } })).available,
    ).toBe(5);
    await expect(calendar.create(eventInput(row.id), admin)).rejects.toMatchObject({ status: 422 });
  });

  it('serializes event creation against archival and deletion', async () => {
    for (const status of ['ACTIVE', 'DRAFT'] as const) {
      const row = await fixture(status);
      const results = await Promise.allSettled([
        calendar.create(eventInput(row.id), admin),
        status === 'DRAFT'
          ? campaigns.remove(row.id, admin)
          : campaigns.transition(row.id, 'ARCHIVED', admin, systemClock),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const remaining = await prisma.campaign.findUnique({ where: { id: row.id } });
      const events = await prisma.calendarEvent.count({ where: { campaignId: row.id } });
      if (!remaining || remaining.status === 'ARCHIVED') expect(events).toBe(0);
      else expect(events).toBe(1);
    }
  });

  it('serializes donor submission against completion', async () => {
    const row = await fixture();
    const input = submitDonationSchema.parse({
      campaignId: row.id,
      items: [{ itemTypeId, quantityDeclared: 1 }],
    });
    const results = await Promise.allSettled([
      donations.submit(input, donor, systemClock),
      campaigns.transition(row.id, 'COMPLETED', admin, systemClock),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    if ((await campaigns.getById(row.id)).status === 'COMPLETED')
      expect(await prisma.donation.count({ where: { campaignId: row.id } })).toBe(0);
  });

  it('serializes public assistance submission against archival', async () => {
    const row = await fixture();
    const input = submitRequestSchema.parse({
      campaignId: row.id,
      fullName: 'Public fixture',
      email: `${randomUUID()}@example.invalid`,
      contactNumber: '09170000000',
      barangay: 'Fixture',
      city: 'Fixture',
      province: 'Fixture',
      consent: true,
      turnstileToken: 'fixture',
      items: [{ itemTypeId, quantity: 1 }],
    });
    const results = await Promise.allSettled([
      requests.submitPublic(input, undefined, systemClock),
      campaigns.transition(row.id, 'ARCHIVED', admin, systemClock),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    if ((await campaigns.getById(row.id)).status === 'ARCHIVED')
      expect(await prisma.assistanceRequest.count({ where: { campaignId: row.id } })).toBe(0);
  });
});
