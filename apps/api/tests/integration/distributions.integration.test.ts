import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  DistributionStatus,
  RequestStatus,
  UserRole,
  accessTokenResponseSchema,
  calendarEventListResponseSchema,
  calendarEventResponseSchema,
  distributionListResponseSchema,
  distributionResponseSchema,
  donationResponseSchema,
  errorEnvelopeSchema,
  inventoryListResponseSchema,
  submitRequestResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

vi.mock('../../src/modules/public/turnstile.js', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}));

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
  const email = `m4-${RUN}-${seq++}@example.com`;
  const user = await prisma.user.create({
    data: {
      name: 'M4 Actor',
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
let campaignId = '';
let foodTypeId = '';
let hygieneTypeId = '';

async function setupFixtures(): Promise<void> {
  staff = await makeUser(UserRole.STAFF, true);
  donor = await makeUser(UserRole.DONOR, true);
  const campaign = await prisma.campaign.create({
    data: {
      name: `M4 Relief ${RUN}`,
      slug: `m4-relief-${RUN}`,
      description: 'M4 fixture campaign',
      calamityType: 'TYPHOON',
      status: 'ACTIVE',
      startDate: new Date(),
      createdById: staff.id,
      areas: {
        create: [{ barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' }],
      },
    },
    select: { id: true },
  });
  campaignId = campaign.id;
  const food = await prisma.itemType.create({
    data: { name: `M4 Food ${RUN}`, category: 'FOOD', unit: 'pack' },
    select: { id: true },
  });
  foodTypeId = food.id;
  const hygiene = await prisma.itemType.create({
    data: { name: `M4 Hygiene ${RUN}`, category: 'HYGIENE', unit: 'kit' },
    select: { id: true },
  });
  hygieneTypeId = hygiene.id;
  for (const itemTypeId of [foodTypeId, hygieneTypeId]) {
    const res = await staffPost('/api/v1/inventory/adjustments', {
      itemTypeId,
      campaignId,
      direction: 'IN',
      quantity: 100,
      reason: 'M4 opening stock.',
    });
    expect(res.status).toBe(200);
  }
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

async function staffPost(url: string, body: Record<string, unknown>): Promise<request.Response> {
  return request(app)
    .post(url)
    .set('X-Forwarded-For', uniqueIp())
    .set(auth(staff.token))
    .send(body);
}

async function staffGet(url: string): Promise<request.Response> {
  return request(app).get(url).set('X-Forwarded-For', uniqueIp()).set(auth(staff.token));
}

async function makeEvent(type: string, title: string): Promise<string> {
  const res = await staffPost('/api/v1/calendar/events', {
    type,
    title,
    campaignId,
    startAt: '2026-11-01T01:00:00Z',
    endAt: '2026-11-01T04:00:00Z',
    location: 'Barangay San Isidro Hall',
  });
  expect(res.status).toBe(201);
  return parse(res, calendarEventResponseSchema).data.id;
}

async function approvedRequest(): Promise<string> {
  const email = `m4bene-${RUN}-${seq++}@example.com`;
  const sub = await request(app)
    .post('/api/v1/public/assistance-requests')
    .set('X-Forwarded-For', uniqueIp())
    .send({
      fullName: 'M4 Beneficiary',
      email,
      contactNumber: '09171234567',
      barangay: 'San Isidro',
      city: 'Quezon City',
      province: 'Metro Manila',
      campaignId,
      items: [
        { itemTypeId: foodTypeId, quantity: 5 },
        { itemTypeId: hygieneTypeId, quantity: 3 },
      ],
      consent: true,
      turnstileToken: 'x',
    });
  expect(sub.status).toBe(201);
  const ref = parse(sub, submitRequestResponseSchema).data.referenceNumber;
  const row = await prisma.assistanceRequest.findUniqueOrThrow({
    where: { referenceNumber: ref },
    select: { id: true },
  });
  expect((await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {})).status).toBe(200);
  const approved = await staffPost(`/api/v1/assistance-requests/${row.id}/approve`, {});
  expect(approved.status).toBe(200);
  return row.id;
}

async function allocate(requestId: string, eventId: string): Promise<request.Response> {
  return staffPost('/api/v1/distributions', {
    requestId,
    calendarEventId: eventId,
    items: [
      { itemTypeId: foodTypeId, quantity: 5 },
      { itemTypeId: hygieneTypeId, quantity: 3 },
    ],
  });
}

async function stockOf(itemTypeId: string): Promise<{ available: number; reserved: number }> {
  const list = parse(
    await staffGet(`/api/v1/inventory?campaignId=${campaignId}&itemTypeId=${itemTypeId}`),
    inventoryListResponseSchema,
  ).data.items[0];
  if (list === undefined) throw new Error('stock row missing');
  return { available: list.available, reserved: list.reserved };
}

describe('M4 distributions and calendar', () => {
  it('seeds fixtures once', async () => {
    await setupFixtures();
    expect(campaignId).not.toBe('');
  });

  it('validates event windows and locations', async () => {
    const backwards = await staffPost('/api/v1/calendar/events', {
      type: 'DISTRIBUTION',
      title: 'Backwards',
      campaignId,
      startAt: '2026-11-01T04:00:00Z',
      endAt: '2026-11-01T01:00:00Z',
      location: 'Hall',
    });
    expect(backwards.status).toBe(400);

    const noLocation = await staffPost('/api/v1/calendar/events', {
      type: 'DISTRIBUTION',
      title: 'Nowhere',
      campaignId,
      startAt: '2026-11-01T01:00:00Z',
      endAt: '2026-11-01T04:00:00Z',
    });
    expect(noLocation.status).toBe(400);
  });

  it('reserves stock and schedules the request with mail', async () => {
    const requestId = await approvedRequest();
    const eventId = await makeEvent('DISTRIBUTION', `M4 Dist ${RUN}`);
    const before = await stockOf(foodTypeId);
    const res = await allocate(requestId, eventId);
    expect(res.status).toBe(201);
    const created = parse(res, distributionResponseSchema).data;
    expect(created.status).toBe(DistributionStatus.SCHEDULED);
    expect(created.items).toHaveLength(2);

    const after = await stockOf(foodTypeId);
    expect(after.available).toBe(before.available - 5);
    expect(after.reserved).toBe(before.reserved + 5);

    const request = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    expect(request.status).toBe(RequestStatus.SCHEDULED);
    const mails = await prisma.emailNotification.count({
      where: { type: 'DISTRIBUTION_SCHEDULED', relatedRequestId: requestId },
    });
    expect(mails).toBe(1);
  });

  it('refuses short stock with 409 and no side effects', async () => {
    const requestId = await approvedRequest();
    const eventId = await makeEvent('DISTRIBUTION', `M4 Short ${RUN}`);
    const res = await staffPost('/api/v1/distributions', {
      requestId,
      calendarEventId: eventId,
      items: [{ itemTypeId: foodTypeId, quantity: 999_999 }],
    });
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('INSUFFICIENT_STOCK');

    const request = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    expect(request.status).toBe(RequestStatus.APPROVED);
    const dists = await prisma.distribution.count({ where: { requestId } });
    expect(dists).toBe(0);
  });

  it('refuses non-approved requests, wrong events, and second live allocations', async () => {
    const pending = await request(app)
      .post('/api/v1/public/assistance-requests')
      .set('X-Forwarded-For', uniqueIp())
      .send({
        fullName: 'M4 Pending',
        email: `pending-${RUN}@example.com`,
        contactNumber: '09171234567',
        barangay: 'San Isidro',
        city: 'Quezon City',
        province: 'Metro Manila',
        campaignId,
        items: [{ itemTypeId: foodTypeId, quantity: 1 }],
        consent: true,
        turnstileToken: 'x',
      });
    const pendingRef = parse(pending, submitRequestResponseSchema).data.referenceNumber;
    const pendingRow = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: pendingRef },
      select: { id: true },
    });
    const eventId = await makeEvent('DISTRIBUTION', `M4 Guard ${RUN}`);
    const notApproved = await staffPost('/api/v1/distributions', {
      requestId: pendingRow.id,
      calendarEventId: eventId,
      items: [{ itemTypeId: foodTypeId, quantity: 1 }],
    });
    expect(notApproved.status).toBe(409);

    const collectionId = await makeEvent('COLLECTION', `M4 Collect ${RUN}`);
    const requestId = await approvedRequest();
    const wrongType = await staffPost('/api/v1/distributions', {
      requestId,
      calendarEventId: collectionId,
      items: [{ itemTypeId: foodTypeId, quantity: 1 }],
    });
    expect(wrongType.status).toBe(422);

    const first = await allocate(requestId, eventId);
    expect(first.status).toBe(201);
    const second = await allocate(requestId, eventId);
    expect(second.status).toBe(409);
  });

  it('completes partial quantities and refuses over-distribution', async () => {
    const requestId = await approvedRequest();
    const eventId = await makeEvent('DISTRIBUTION', `M4 Complete ${RUN}`);
    const created = parse(await allocate(requestId, eventId), distributionResponseSchema).data;
    const foodItem = created.items.find((item) => item.itemTypeId === foodTypeId);
    const hygieneItem = created.items.find((item) => item.itemTypeId === hygieneTypeId);
    if (foodItem === undefined || hygieneItem === undefined) throw new Error('items missing');

    const over = await staffPost(`/api/v1/distributions/${created.id}/complete`, {
      receivedByName: 'Maria Santos',
      items: [
        { distributionItemId: foodItem.id, quantity: 6 },
        { distributionItemId: hygieneItem.id, quantity: 3 },
      ],
    });
    expect(over.status).toBe(422);

    const before = await stockOf(foodTypeId);
    const done = await staffPost(`/api/v1/distributions/${created.id}/complete`, {
      receivedByName: 'Maria Santos',
      items: [
        { distributionItemId: foodItem.id, quantity: 4 },
        { distributionItemId: hygieneItem.id, quantity: 3 },
      ],
    });
    expect(done.status).toBe(200);
    expect(parse(done, distributionResponseSchema).data.status).toBe(
      DistributionStatus.DISTRIBUTED,
    );
    const after = await stockOf(foodTypeId);
    expect(after.reserved).toBe(before.reserved - 5);
    expect(after.available).toBe(before.available + 1);
    const request = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    expect(request.status).toBe(RequestStatus.DISTRIBUTED);
  });

  it('returns stock on no-show and cancels with mail', async () => {
    const requestId = await approvedRequest();
    const eventId = await makeEvent('DISTRIBUTION', `M4 Noshow ${RUN}`);
    const created = parse(await allocate(requestId, eventId), distributionResponseSchema).data;
    const before = await stockOf(foodTypeId);
    expect((await staffPost(`/api/v1/distributions/${created.id}/no-show`, {})).status).toBe(422);
    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: { endAt: new Date(Date.now() - 1000), startAt: new Date(Date.now() - 3600000) },
    });
    const noShow = await staffPost(`/api/v1/distributions/${created.id}/no-show`, {});
    expect(noShow.status).toBe(200);
    const after = await stockOf(foodTypeId);
    expect(after.available).toBe(before.available + 5);
    expect(after.reserved).toBe(before.reserved - 5);

    const requestId2 = await approvedRequest();
    const created2 = parse(
      await allocate(requestId2, await makeEvent('DISTRIBUTION', `M4 Cancel ${RUN}`)),
      distributionResponseSchema,
    ).data;
    const cancelled = await staffPost(`/api/v1/distributions/${created2.id}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(parse(cancelled, distributionResponseSchema).data.status).toBe(
      DistributionStatus.CANCELLED,
    );
    const mails = await prisma.emailNotification.count({
      where: { type: 'DISTRIBUTION_CANCELLED', relatedRequestId: requestId2 },
    });
    expect(mails).toBe(1);
  });

  it('fans event cancellation out to every live distribution', async () => {
    const eventId = await makeEvent('DISTRIBUTION', `M4 Fanout ${RUN}`);
    const requestA = await approvedRequest();
    const requestB = await approvedRequest();
    expect((await allocate(requestA, eventId)).status).toBe(201);
    expect((await allocate(requestB, eventId)).status).toBe(201);

    const current = parse(
      await staffGet(`/api/v1/calendar/events/${eventId}`),
      calendarEventResponseSchema,
    ).data;
    const cancelled = await staffPost(`/api/v1/calendar/events/${eventId}/cancel`, {
      revision: current.revision,
    });
    expect(cancelled.status).toBe(200);
    for (const requestId of [requestA, requestB]) {
      const row = await prisma.assistanceRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { status: true },
      });
      expect(row.status).toBe(RequestStatus.APPROVED);
    }
    const live = await prisma.distribution.count({
      where: { calendarEventId: eventId, status: 'SCHEDULED' },
    });
    expect(live).toBe(0);
  });

  it('schedules donation collections and cancels from scheduled', async () => {
    const email = `m4donor-${RUN}@example.com`;
    await prisma.user.create({
      data: {
        name: 'M4 Donor',
        email,
        passwordHash: await hashPassword(PASSWORD),
        role: UserRole.DONOR,
        emailVerifiedAt: new Date(),
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email, password: PASSWORD });
    const token = parse(login, accessTokenResponseSchema).data.accessToken;
    const sub = await request(app)
      .post('/api/v1/donations')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignId, items: [{ itemTypeId: hygieneTypeId, quantityDeclared: 5 }] });
    expect(sub.status).toBe(201);
    const donationId = parse(sub, donationResponseSchema).data.id;
    expect((await staffPost(`/api/v1/donations/${donationId}/verify`, {})).status).toBe(200);

    const collectionId = await makeEvent('COLLECTION', `M4 Pickup ${RUN}`);
    const scheduled = await staffPost(`/api/v1/donations/${donationId}/schedule`, {
      calendarEventId: collectionId,
    });
    expect(scheduled.status).toBe(200);
    expect(parse(scheduled, donationResponseSchema).data.status).toBe('SCHEDULED');

    const distributionId = await makeEvent('DISTRIBUTION', `M4 Wrong ${RUN}`);
    const wrongType = await staffPost(`/api/v1/donations/${donationId}/schedule`, {
      calendarEventId: distributionId,
    });
    expect(wrongType.status).toBe(422);

    const cancelled = await staffPost(`/api/v1/donations/${donationId}/cancel`, {});
    expect(cancelled.status).toBe(200);
  });

  it('settles concurrent last-unit reserves to exactly one winner', async () => {
    const scarce = await prisma.itemType.create({
      data: { name: `M4 Scarce ${RUN}`, category: 'HYGIENE', unit: 'kit' },
      select: { id: true },
    });
    expect(
      (
        await staffPost('/api/v1/inventory/adjustments', {
          itemTypeId: scarce.id,
          campaignId,
          direction: 'IN',
          quantity: 3,
          reason: 'M4 race stock.',
        })
      ).status,
    ).toBe(200);
    const eventId = await makeEvent('DISTRIBUTION', `M4 Race ${RUN}`);
    const build = async (): Promise<request.Response> => {
      const email = `race-${RUN}-${seq++}@example.com`;
      const sub = await request(app)
        .post('/api/v1/public/assistance-requests')
        .set('X-Forwarded-For', uniqueIp())
        .send({
          fullName: 'M4 Racer',
          email,
          contactNumber: '09171234567',
          barangay: 'San Isidro',
          city: 'Quezon City',
          province: 'Metro Manila',
          campaignId,
          items: [{ itemTypeId: scarce.id, quantity: 3 }],
          consent: true,
          turnstileToken: 'x',
        });
      const ref = parse(sub, submitRequestResponseSchema).data.referenceNumber;
      const row = await prisma.assistanceRequest.findUniqueOrThrow({
        where: { referenceNumber: ref },
        select: { id: true },
      });
      await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {});
      await staffPost(`/api/v1/assistance-requests/${row.id}/approve`, {});
      return staffPost('/api/v1/distributions', {
        requestId: row.id,
        calendarEventId: eventId,
        items: [{ itemTypeId: scarce.id, quantity: 3 }],
      });
    };
    const [first, second] = await Promise.all([build(), build()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('enforces the staff boundary and reports an honest resync', async () => {
    const donorForbidden = await request(app)
      .get('/api/v1/distributions')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`);
    expect(donorForbidden.status).toBe(403);

    const eventId = await makeEvent('DISTRIBUTION', `M4 Sync ${RUN}`);
    const resync = await staffPost(`/api/v1/calendar/events/${eventId}/resync`, {});
    expect(resync.status).toBe(422);

    const listed = parse(
      await staffGet('/api/v1/distributions'),
      distributionListResponseSchema,
    ).data;
    expect(listed.total).toBeGreaterThanOrEqual(1);
    const events = parse(
      await staffGet('/api/v1/calendar/events'),
      calendarEventListResponseSchema,
    ).data;
    expect(events.total).toBeGreaterThanOrEqual(1);
  });
});

async function eventRevision(id: string): Promise<number> {
  return parse(await staffGet(`/api/v1/calendar/events/${id}`), calendarEventResponseSchema).data
    .revision;
}
async function patchEvent(id: string, body: object): Promise<request.Response> {
  return request(app)
    .patch(`/api/v1/calendar/events/${id}`)
    .set(auth(staff.token))
    .set('X-Forwarded-For', uniqueIp())
    .send(body);
}

describe('M4 scheduling safeguards', () => {
  it('allows exactly one concurrent allocation to the last slot', async () => {
    const event = await makeEvent('DISTRIBUTION', `Capacity ${RUN}`);
    expect(
      (await patchEvent(event, { revision: await eventRevision(event), capacity: 1 })).status,
    ).toBe(200);
    const a = await approvedRequest();
    const b = await approvedRequest();
    const results = await Promise.all([allocate(a, event), allocate(b, event)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const revision = await eventRevision(event);
    expect((await patchEvent(event, { revision, capacity: 0 })).status).toBe(400);
    const summary = parse(
      await staffGet(`/api/v1/calendar/events/${event}`),
      calendarEventResponseSchema,
    ).data;
    expect(summary.occupied).toBe(1);
  });
  it('rejects stale event edits and includes cross-month events', async () => {
    const event = await makeEvent('DISTRIBUTION', `Overlap ${RUN}`);
    const revision = await eventRevision(event);
    expect(
      (
        await patchEvent(event, {
          revision,
          startAt: '2026-10-31T12:00:00Z',
          endAt: '2026-11-02T00:00:00Z',
        })
      ).status,
    ).toBe(200);
    expect((await patchEvent(event, { revision, title: 'Stale title' })).status).toBe(409);
    const rows = parse(
      await staffGet(
        '/api/v1/calendar/events?from=2026-11-01T00:00:00Z&to=2026-11-01T23:00:00Z&pageSize=100',
      ),
      calendarEventListResponseSchema,
    ).data.items;
    expect(rows.some((e) => e.id === event)).toBe(true);
  });
  it('edits all event fields and rejects closed campaign targets', async () => {
    const event = await makeEvent('DISTRIBUTION', `Editable ${RUN}`);
    const target = await prisma.campaign.create({
      data: {
        name: `Target ${RUN}`,
        slug: `event-target-${RUN}`,
        description: 'Event move fixture',
        calamityType: 'OTHER',
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });
    const revision = await eventRevision(event);
    const response = await patchEvent(event, {
      revision,
      campaignId: target.id,
      type: 'COLLECTION',
      title: 'Updated collection',
      description: 'Updated description',
      startAt: '2026-11-02T01:00:00Z',
      endAt: '2026-11-02T04:00:00Z',
      location: 'New hall',
      capacity: null,
    });
    expect(response.status).toBe(200);
    const current = parse(response, calendarEventResponseSchema).data;
    expect(current).toMatchObject({
      campaignId: target.id,
      type: 'COLLECTION',
      title: 'Updated collection',
      description: 'Updated description',
      location: 'New hall',
      capacity: null,
      revision: revision + 1,
      syncStatus: 'NOT_SYNCED',
    });
    expect((await patchEvent(event, { revision, title: 'Stale' })).status).toBe(409);
    const closed = await prisma.campaign.create({
      data: {
        name: `Closed ${RUN}`,
        slug: `closed-target-${RUN}`,
        description: 'Closed fixture',
        calamityType: 'OTHER',
        status: 'COMPLETED',
        startDate: new Date(),
      },
    });
    expect(
      (await patchEvent(event, { revision: current.revision, campaignId: closed.id })).status,
    ).toBe(422);
  });
  it('protects assigned and historical event identity and serializes new assignments', async () => {
    const linkedEvent = await makeEvent('DISTRIBUTION', `Linked identity ${RUN}`);
    const linked = await allocate(await approvedRequest(), linkedEvent);
    expect(linked.status).toBe(201);
    expect(
      (
        await patchEvent(linkedEvent, {
          revision: await eventRevision(linkedEvent),
          type: 'COLLECTION',
        })
      ).status,
    ).toBe(409);
    const linkedId = parse(linked, distributionResponseSchema).data.id;
    expect((await staffPost(`/api/v1/distributions/${linkedId}/cancel`, {})).status).toBe(200);
    expect(
      (
        await patchEvent(linkedEvent, {
          revision: await eventRevision(linkedEvent),
          type: 'COLLECTION',
        })
      ).status,
    ).toBe(409);
    const event = await makeEvent('DISTRIBUTION', `Identity race ${RUN}`);
    const requestId = await approvedRequest();
    const revision = await eventRevision(event);
    const [changed, allocated] = await Promise.all([
      patchEvent(event, { revision, type: 'COLLECTION', capacity: null }),
      allocate(requestId, event),
    ]);
    expect([200, 409]).toContain(changed.status);
    if (changed.status === 200) {
      expect(allocated.status).toBe(422);
    } else {
      expect(allocated.status).toBe(201);
      const distribution = parse(allocated, distributionResponseSchema).data;
      expect(
        (
          await patchEvent(event, {
            revision: await eventRevision(event),
            campaignId: '00000000-0000-4000-8000-000000000000',
          })
        ).status,
      ).toBe(404);
      expect((await staffPost(`/api/v1/distributions/${distribution.id}/cancel`, {})).status).toBe(
        200,
      );
      expect(
        (await patchEvent(event, { revision: await eventRevision(event), type: 'COLLECTION' }))
          .status,
      ).toBe(409);
    }
  });
  it('rejects duplicate goods and incomplete or empty handovers without changing stock', async () => {
    const id = await approvedRequest();
    const event = await makeEvent('DISTRIBUTION', `Validation ${RUN}`);
    const duplicate = await staffPost('/api/v1/distributions', {
      requestId: id,
      calendarEventId: event,
      items: [
        { itemTypeId: hygieneTypeId, quantity: 1 },
        { itemTypeId: hygieneTypeId, quantity: 1 },
      ],
    });
    expect(duplicate.status).toBe(422);
    const dist = parse(await allocate(id, event), distributionResponseSchema).data;
    const first = dist.items[0];
    if (!first) throw new Error('Missing item');
    const before = await stockOf(foodTypeId);
    for (const items of [
      [{ distributionItemId: first.id, quantity: 1 }],
      dist.items.map((i) => ({ distributionItemId: i.id, quantity: 0 })),
      [
        { distributionItemId: first.id, quantity: 1 },
        { distributionItemId: first.id, quantity: 1 },
      ],
    ]) {
      expect(
        (
          await staffPost(`/api/v1/distributions/${dist.id}/complete`, {
            receivedByName: 'Test Recipient',
            items,
          })
        ).status,
      ).toBe(422);
    }
    expect(await stockOf(foodTypeId)).toEqual(before);
    const completion = {
      receivedByName: 'Test Recipient',
      items: dist.items.map((i) => ({ distributionItemId: i.id, quantity: i.quantity })),
    };
    const results = await Promise.all([
      staffPost(`/api/v1/distributions/${dist.id}/complete`, completion),
      staffPost(`/api/v1/distributions/${dist.id}/complete`, completion),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await prisma.distribution.findUniqueOrThrow({ where: { id: dist.id } });
    expect(row.distributedAt).not.toBeNull();
    expect(row.recordedById).toBe(staff.id);
  });
  it('serializes cancellation against concurrent assignment', async () => {
    const event = await makeEvent('DISTRIBUTION', `Cancel race ${RUN}`);
    const id = await approvedRequest();
    const revision = await eventRevision(event);
    await Promise.all([
      allocate(id, event),
      staffPost(`/api/v1/calendar/events/${event}/cancel`, { revision }),
    ]);
    const e = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: event } });
    const live = await prisma.distribution.count({
      where: { calendarEventId: event, status: 'SCHEDULED' },
    });
    if (e.status === 'CANCELLED') expect(live).toBe(0);
    else expect(live).toBe(1);
  });
  it('preserves reservations and supersedes old email on rescheduling', async () => {
    const event = await makeEvent('DISTRIBUTION', `Reschedule ${RUN}`);
    const id = await approvedRequest();
    const dist = parse(await allocate(id, event), distributionResponseSchema).data;
    const before = await stockOf(foodTypeId);
    const oldMail = await prisma.emailNotification.findFirstOrThrow({
      where: { relatedRequestId: id, type: 'DISTRIBUTION_SCHEDULED' },
    });
    expect(
      (
        await patchEvent(event, {
          revision: await eventRevision(event),
          location: 'Updated relief hall',
        })
      ).status,
    ).toBe(200);
    expect(await stockOf(foodTypeId)).toEqual(before);
    const updated = await prisma.distribution.findUniqueOrThrow({ where: { id: dist.id } });
    expect(updated.scheduleRevision).toBe(2);
    const { isScheduleCurrent } = await import('../../src/modules/notifications/schedule-email.js');
    const { FixedClock } = await import('../../src/lib/clock.js');
    expect(
      await isScheduleCurrent(
        oldMail.templateData,
        new FixedClock(new Date('2026-10-21T00:00:00Z')),
      ),
    ).toBe(false);
    expect(
      (await patchEvent(event, { revision: await eventRevision(event), capacity: 1 })).status,
    ).toBe(200);
  });
  it('unschedules collection donations on event cancellation and supports reassignment', async () => {
    const event = await makeEvent('COLLECTION', `Collection one ${RUN}`);
    const target = await makeEvent('COLLECTION', `Collection two ${RUN}`);
    const donation = await prisma.donation.create({
      data: {
        donorId: donor.id,
        campaignId,
        status: 'VERIFIED',
        referenceNumber: `DON-M4-${RUN}-${seq++}`,
      },
    });
    expect(
      (await staffPost(`/api/v1/donations/${donation.id}/schedule`, { calendarEventId: event }))
        .status,
    ).toBe(200);
    expect(
      (await staffPost(`/api/v1/donations/${donation.id}/schedule`, { calendarEventId: target }))
        .status,
    ).toBe(200);
    expect((await staffPost(`/api/v1/donations/${donation.id}/unschedule`, {})).status).toBe(200);
    expect(
      (await staffPost(`/api/v1/donations/${donation.id}/schedule`, { calendarEventId: event }))
        .status,
    ).toBe(200);
    expect(
      (
        await staffPost(`/api/v1/calendar/events/${event}/cancel`, {
          revision: await eventRevision(event),
        })
      ).status,
    ).toBe(200);
    const after = await prisma.donation.findUniqueOrThrow({ where: { id: donation.id } });
    expect(after.status).toBe('VERIFIED');
    expect(after.collectionEventId).toBeNull();
  });
  it('blocks closure until the event ends and assignments are resolved', async () => {
    const event = await makeEvent('DISTRIBUTION', `Close ${RUN}`);
    const id = await approvedRequest();
    const dist = parse(await allocate(id, event), distributionResponseSchema).data;
    expect(
      (
        await staffPost(`/api/v1/calendar/events/${event}/complete`, {
          revision: await eventRevision(event),
        })
      ).status,
    ).toBe(422);
    await prisma.calendarEvent.update({
      where: { id: event },
      data: { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) },
    });
    expect(
      (
        await staffPost(`/api/v1/calendar/events/${event}/complete`, {
          revision: await eventRevision(event),
        })
      ).status,
    ).toBe(422);
    expect((await staffPost(`/api/v1/distributions/${dist.id}/no-show`, {})).status).toBe(200);
    expect(
      (
        await staffPost(`/api/v1/calendar/events/${event}/complete`, {
          revision: await eventRevision(event),
        })
      ).status,
    ).toBe(200);
  });
  it('queues one reminder per revision, skips short-notice schedules, and retries Google failures', async () => {
    const { FixedClock } = await import('../../src/lib/clock.js');
    const { scanReminders } = await import('../../src/jobs/reminders.js');
    const { syncCalendars, googleEventId } = await import('../../src/jobs/calendar-sync.js');
    const event = await makeEvent('DISTRIBUTION', `Reminder ${RUN}`);
    const id = await approvedRequest();
    const dist = parse(await allocate(id, event), distributionResponseSchema).data;
    const clock = new FixedClock(new Date('2026-10-31T12:00:00Z'));
    await prisma.distribution.update({
      where: { id: dist.id },
      data: { scheduleNotifiedAt: new Date('2026-10-30T00:00:00Z') },
    });
    await scanReminders(clock);
    await scanReminders(clock);
    expect(
      await prisma.emailNotification.count({
        where: { relatedRequestId: id, type: 'DISTRIBUTION_REMINDER' },
      }),
    ).toBe(1);
    await prisma.distribution.update({
      where: { id: dist.id },
      data: {
        scheduleRevision: { increment: 1 },
        scheduleNotifiedAt: clock.now(),
        reminderSentAt: null,
      },
    });
    await scanReminders(clock);
    expect(
      await prisma.emailNotification.count({
        where: { relatedRequestId: id, type: 'DISTRIBUTION_REMINDER' },
      }),
    ).toBe(1);
    const ids: string[] = [];
    await syncCalendars({
      enabled: true,
      clock,
      eventId: event,
      mirror: { upsert: () => Promise.reject(new Error('Offline')) },
    });
    expect(
      (await prisma.calendarEvent.findUniqueOrThrow({ where: { id: event } })).syncStatus,
    ).toBe('FAILED');
    clock.advance(60000);
    const mirror = {
      upsert: (e: { id: string }) => {
        ids.push(googleEventId(e.id));
        return Promise.resolve(googleEventId(e.id));
      },
    };
    await syncCalendars({ enabled: true, clock, eventId: event, mirror });
    expect(ids).toEqual([googleEventId(event)]);
    expect(
      (await prisma.calendarEvent.findUniqueOrThrow({ where: { id: event } })).syncStatus,
    ).toBe('SYNCED');
  });
});
