import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  DonationStatus,
  ItemCategory,
  UserRole,
  accessTokenResponseSchema,
  donationListResponseSchema,
  donationResponseSchema,
  errorEnvelopeSchema,
  inventoryListResponseSchema,
  inventoryMovementListResponseSchema,
  type DonationDto,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const app = createApp();
const PASSWORD = 'integration test secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let seq = 0;
let ipSeq = 0;
const uniqueIp = (): string => `198.51.100.${((ipSeq += 1) % 250) + 1}`;

function parse<T>(res: request.Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error('unexpected response body');
  return parsed.data;
}

const errorCode = (res: request.Response): string => parse(res, errorEnvelopeSchema).error.code;

interface Actor {
  token: string;
  id: string;
}

async function makeUser(role: UserRole, verified: boolean): Promise<Actor> {
  const email = `m2-${RUN}-${seq++}@example.com`;
  const user = await prisma.user.create({
    data: {
      name: 'M2 Actor',
      email,
      passwordHash: await hashPassword(PASSWORD),
      role,
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp())
    .send({ email, password: PASSWORD });
  return { token: parse(res, accessTokenResponseSchema).data.accessToken, id: user.id };
}

let staff: Actor;
let donor: Actor;
let unverified: Actor;
let campaignId = '';
let foodTypeId = '';
let hygieneTypeId = '';

async function setupFixtures(): Promise<void> {
  staff = await makeUser(UserRole.STAFF, true);
  donor = await makeUser(UserRole.DONOR, true);
  unverified = await makeUser(UserRole.DONOR, false);
  const campaign = await prisma.campaign.create({
    data: {
      name: `M2 Relief ${RUN}`,
      slug: `m2-relief-${RUN}`,
      description: 'M2 fixture campaign',
      calamityType: 'TYPHOON',
      status: 'ACTIVE',
      startDate: new Date(),
      createdById: staff.id,
    },
    select: { id: true },
  });
  campaignId = campaign.id;
  const food = await prisma.itemType.create({
    data: { name: `M2 Food ${RUN}`, category: ItemCategory.FOOD, unit: 'pack' },
    select: { id: true },
  });
  foodTypeId = food.id;
  const hygiene = await prisma.itemType.create({
    data: { name: `M2 Hygiene ${RUN}`, category: ItemCategory.HYGIENE, unit: 'kit' },
    select: { id: true },
  });
  hygieneTypeId = hygiene.id;
}

const post = (url: string, token: string, body: Record<string, unknown>): request.Test =>
  request(app)
    .post(url)
    .set('X-Forwarded-For', uniqueIp())
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const get = (url: string, token: string): request.Test =>
  request(app).get(url).set('X-Forwarded-For', uniqueIp()).set('Authorization', `Bearer ${token}`);

async function submitDonation(token: string): Promise<DonationDto> {
  const res = await post('/api/v1/donations', token, {
    campaignId,
    items: [
      { itemTypeId: foodTypeId, quantityDeclared: 40 },
      { itemTypeId: hygieneTypeId, quantityDeclared: 10 },
    ],
  });
  expect(res.status).toBe(201);
  return parse(res, donationResponseSchema).data;
}

async function staffDetail(id: string): Promise<DonationDto> {
  return parse(await get(`/api/v1/donations/${id}`, staff.token), donationResponseSchema).data;
}

describe('M2 donations and inventory', () => {
  it('seeds fixtures once', async () => {
    await setupFixtures();
    expect(campaignId).not.toBe('');
  });

  it('submits with a DON- reference and queues a confirmation', async () => {
    const created = await submitDonation(donor.token);
    expect(created.referenceNumber).toMatch(/^DON-\d{4}-\d{6}$/);
    expect(created.status).toBe(DonationStatus.PENDING);
    const queued = await prisma.emailNotification.count({
      where: { type: 'DONATION_SUBMITTED', relatedDonationId: created.id },
    });
    expect(queued).toBe(1);
  });

  it('blocks unverified donors with 403', async () => {
    const res = await post('/api/v1/donations', unverified.token, {
      campaignId,
      items: [{ itemTypeId: foodTypeId, quantityDeclared: 1 }],
    });
    expect(res.status).toBe(403);
    expect(errorCode(res)).toBe('EMAIL_NOT_VERIFIED');
  });

  it('rejects unknown item types with 422', async () => {
    const res = await post('/api/v1/donations', donor.token, {
      campaignId,
      items: [{ itemTypeId: '00000000-0000-4000-8000-000000000000', quantityDeclared: 1 }],
    });
    expect(res.status).toBe(422);
    expect(errorCode(res)).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('lets a donor edit their own PENDING donation only', async () => {
    const created = await submitDonation(donor.token);
    const edit = await request(app)
      .patch(`/api/v1/donations/${created.id}`)
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ notes: 'Leave at the gate.' });
    expect(edit.status).toBe(200);

    await post(`/api/v1/donations/${created.id}/verify`, staff.token, {});
    const lateEdit = await request(app)
      .patch(`/api/v1/donations/${created.id}`)
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ notes: 'Too late.' });
    expect(lateEdit.status).toBe(409);
  });

  it('stores private pickup addresses, supports clearing, and rejects unauthorized changes', async () => {
    const address = '24 Test Street, Sample Barangay, Test City';
    const createdResponse = await post('/api/v1/donations', donor.token, {
      campaignId,
      pickupAddress: `  ${address}  `,
      items: [{ itemTypeId: foodTypeId, quantityDeclared: 2 }],
    });
    expect(createdResponse.status).toBe(201);
    const created = parse(createdResponse, donationResponseSchema).data;
    expect(created.pickupAddress).toBe(address);
    expect((await staffDetail(created.id)).pickupAddress).toBe(address);
    expect((await get(`/api/v1/donations/${created.id}`, unverified.token)).status).toBe(404);
    const patch = (token: string, pickupAddress: string | null) =>
      request(app)
        .patch(`/api/v1/donations/${created.id}`)
        .set('X-Forwarded-For', uniqueIp())
        .set('Authorization', `Bearer ${token}`)
        .send({ pickupAddress });
    expect((await patch(unverified.token, 'Other address')).status).toBe(404);
    expect((await patch(donor.token, 'x'.repeat(501))).status).toBe(400);
    const updated = await patch(donor.token, 'Updated test pickup address');
    expect(updated.status).toBe(200);
    expect(parse(updated, donationResponseSchema).data.pickupAddress).toBe(
      'Updated test pickup address',
    );
    const cleared = await patch(donor.token, '');
    expect(parse(cleared, donationResponseSchema).data.pickupAddress).toBeNull();
    const audit = await prisma.auditLog.findMany({ where: { entityId: created.id } });
    expect(JSON.stringify(audit.map((row) => row.metadata))).not.toContain('Test Street');
    expect(JSON.stringify(audit.map((row) => row.metadata))).not.toContain('Updated test pickup');
  });

  it('verifies and rejects with queued emails', async () => {
    const good = await submitDonation(donor.token);
    const verified = await post(`/api/v1/donations/${good.id}/verify`, staff.token, {});
    expect(verified.status).toBe(200);
    expect(parse(verified, donationResponseSchema).data.status).toBe(DonationStatus.VERIFIED);

    const bad = await submitDonation(donor.token);
    const noReason = await post(`/api/v1/donations/${bad.id}/reject`, staff.token, {});
    expect(noReason.status).toBe(400);
    const rejected = await post(`/api/v1/donations/${bad.id}/reject`, staff.token, {
      reason: 'Perishables without cold chain.',
    });
    expect(rejected.status).toBe(200);
    const queued = await prisma.emailNotification.count({
      where: { type: 'DONATION_REJECTED', relatedDonationId: bad.id },
    });
    expect(queued).toBe(1);
  });

  it('serializes pending address/item edits against verification', async () => {
    const created = await submitDonation(donor.token);
    const [edited, verified] = await Promise.all([
      request(app)
        .patch(`/api/v1/donations/${created.id}`)
        .set('X-Forwarded-For', uniqueIp())
        .set('Authorization', `Bearer ${donor.token}`)
        .send({
          pickupAddress: 'Race test pickup',
          items: [{ itemTypeId: foodTypeId, quantityDeclared: 17 }],
        }),
      post(`/api/v1/donations/${created.id}/verify`, staff.token, {}),
    ]);
    expect(verified.status).toBe(200);
    expect([200, 409]).toContain(edited.status);
    const current = await staffDetail(created.id);
    expect(current.status).toBe('VERIFIED');
    expect(current.items.find((item) => item.itemTypeId === foodTypeId)?.quantityDeclared).toBe(
      edited.status === 200 ? 17 : 40,
    );
    expect(current.pickupAddress).toBe(edited.status === 200 ? 'Race test pickup' : null);
  });

  it('collects received quantities into inventory, never declared', async () => {
    const created = await submitDonation(donor.token);
    await post(`/api/v1/donations/${created.id}/verify`, staff.token, {});
    const detail = await staffDetail(created.id);
    const foodItem = detail.items.find((item) => item.itemTypeId === foodTypeId);
    const hygieneItem = detail.items.find((item) => item.itemTypeId === hygieneTypeId);
    if (foodItem === undefined || hygieneItem === undefined) throw new Error('items missing');

    const collected = await post(`/api/v1/donations/${created.id}/collect`, staff.token, {
      items: [
        { donationItemId: foodItem.id, quantityReceived: 38, expiryDate: '2027-06-01' },
        { donationItemId: hygieneItem.id, quantityReceived: 0 },
      ],
    });
    expect(collected.status).toBe(200);
    expect(parse(collected, donationResponseSchema).data.status).toBe(DonationStatus.COMPLETED);

    const stock = parse(
      await get(`/api/v1/inventory?campaignId=${campaignId}`, staff.token),
      inventoryListResponseSchema,
    ).data.items;
    const food = stock.find((row) => row.itemTypeId === foodTypeId);
    expect(food?.available).toBe(38);
    expect(stock.find((row) => row.itemTypeId === hygieneTypeId)).toBeUndefined();
    if (food === undefined) throw new Error('food row missing');

    const movements = parse(
      await get(`/api/v1/inventory/${food.id}/movements`, staff.token),
      inventoryMovementListResponseSchema,
    ).data.items;
    expect(movements[0]?.type).toBe('DONATION_IN');
    expect(movements[0]?.quantity).toBe(38);
    expect(movements[0]?.availableAfter).toBe(38);
  });

  it('requires expiry dates for food at collection', async () => {
    const created = await submitDonation(donor.token);
    await post(`/api/v1/donations/${created.id}/verify`, staff.token, {});
    const detail = await staffDetail(created.id);
    const foodItem = detail.items.find((item) => item.itemTypeId === foodTypeId);
    if (foodItem === undefined) throw new Error('food item missing');
    const res = await post(`/api/v1/donations/${created.id}/collect`, staff.token, {
      items: [{ donationItemId: foodItem.id, quantityReceived: 5 }],
    });
    expect(res.status).toBe(422);
  });

  it('settles concurrent collects to exactly one COMPLETED', async () => {
    const created = await submitDonation(donor.token);
    await post(`/api/v1/donations/${created.id}/verify`, staff.token, {});
    const detail = await staffDetail(created.id);
    const body = {
      items: detail.items.map((item) => ({
        donationItemId: item.id,
        quantityReceived: 1,
        ...(item.itemTypeId === foodTypeId ? { expiryDate: '2027-06-01' } : {}),
      })),
    };
    const [first, second] = await Promise.all([
      post(`/api/v1/donations/${created.id}/collect`, staff.token, body),
      post(`/api/v1/donations/${created.id}/collect`, staff.token, body),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('adjusts stock with a reason and refuses reasonless or short outs', async () => {
    const noReason = await post('/api/v1/inventory/adjustments', staff.token, {
      itemTypeId: hygieneTypeId,
      campaignId,
      direction: 'IN',
      quantity: 5,
    });
    expect(noReason.status).toBe(400);

    const short = await post('/api/v1/inventory/adjustments', staff.token, {
      itemTypeId: hygieneTypeId,
      campaignId,
      direction: 'OUT',
      quantity: 999_999,
      reason: 'Audit test.',
    });
    expect(short.status).toBe(422);
  });

  it('restricts transfer to admins', async () => {
    const staffAttempt = await post('/api/v1/inventory/transfer', staff.token, {
      itemTypeId: foodTypeId,
      fromCampaignId: campaignId,
      toCampaignId: campaignId,
      quantity: 1,
      reason: 'Nope.',
    });
    expect(staffAttempt.status).toBe(403);
  });

  it('scopes donor lists to their own donations', async () => {
    const mine = parse(
      await get('/api/v1/donations', donor.token),
      donationListResponseSchema,
    ).data;
    expect(mine.total).toBeGreaterThanOrEqual(1);
    expect(mine.items.every((item) => item.donorEmail.includes(RUN))).toBe(true);

    const other = await get(`/api/v1/donations/${mine.items[0]?.id}`, unverified.token);
    expect(other.status).toBe(404);
  });
});
