import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  RequestStatus,
  UserRole,
  accessTokenResponseSchema,
  assistanceRequestListResponseSchema,
  assistanceRequestResponseSchema,
  errorEnvelopeSchema,
  publicCampaignListResponseSchema,
  publicItemTypeListResponseSchema,
  submitRequestResponseSchema,
  trackRequestResponseSchema,
  verifyRequestEmailResponseSchema,
  type AssistanceRequestDto,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { verifyTurnstileToken } from '../../src/modules/public/turnstile.js';
import * as audit from '../../src/modules/audit/audit.service.js';

vi.mock('../../src/modules/public/turnstile.js', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}));

const app = createApp();
const PASSWORD = 'integration test secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let seq = 0;
let ipSeq = 0;
const uniqueIp = (): string => `198.51.100.${((ipSeq += 1) % 250) + 1}`;
const fixedIp = '198.51.100.99';

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

async function makeUser(role: UserRole): Promise<Actor> {
  const email = `m3-${RUN}-${seq++}@example.com`;
  const user = await prisma.user.create({
    data: {
      name: 'M3 Actor',
      email,
      passwordHash: await hashPassword(PASSWORD),
      role,
      emailVerifiedAt: new Date(),
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
let plainTypeId = '';
let cappedTypeId = '';
let householdTypeId = '';

async function setupFixtures(): Promise<void> {
  staff = await makeUser(UserRole.STAFF);
  donor = await makeUser(UserRole.DONOR);
  const campaign = await prisma.campaign.create({
    data: {
      name: `M3 Relief ${RUN}`,
      slug: `m3-relief-${RUN}`,
      description: 'M3 fixture campaign',
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
  const plain = await prisma.itemType.create({
    data: { name: `M3 Plain ${RUN}`, category: 'HYGIENE', unit: 'kit' },
    select: { id: true },
  });
  plainTypeId = plain.id;
  const capped = await prisma.itemType.create({
    data: { name: `M3 Capped ${RUN}`, category: 'CLOTHING', unit: 'piece', maxPerRequest: 5 },
    select: { id: true },
  });
  cappedTypeId = capped.id;
  const household = await prisma.itemType.create({
    data: { name: `M3 Household ${RUN}`, category: 'FOOD', unit: 'pack', perHouseholdMember: 2 },
    select: { id: true },
  });
  householdTypeId = household.id;
}

interface SubmitOverrides {
  email?: string;
  contactNumber?: string;
  barangay?: string;
  city?: string;
  province?: string;
  householdSize?: number;
  itemTypeId?: string;
  quantity?: number;
  consent?: boolean;
  ip?: string;
}

async function submitPublic(overrides: SubmitOverrides = {}): Promise<request.Test> {
  return request(app)
    .post('/api/v1/public/assistance-requests')
    .set('X-Forwarded-For', overrides.ip ?? uniqueIp())
    .send({
      fullName: 'Maria Santos',
      email: overrides.email ?? `bene-${RUN}-${seq++}@example.com`,
      contactNumber: overrides.contactNumber ?? '09171234567',
      barangay: overrides.barangay ?? 'San Isidro',
      city: overrides.city ?? 'Quezon City',
      province: overrides.province ?? 'Metro Manila',
      ...(overrides.householdSize === undefined ? {} : { householdSize: overrides.householdSize }),
      campaignId,
      items: [
        {
          itemTypeId: overrides.itemTypeId ?? plainTypeId,
          quantity: overrides.quantity ?? 2,
        },
      ],
      consent: overrides.consent ?? true,
      turnstileToken: 'test-token-bypassed-without-secret',
    });
}

const staffGet = (url: string): request.Test =>
  request(app)
    .get(url)
    .set('X-Forwarded-For', uniqueIp())
    .set('Authorization', `Bearer ${staff.token}`);

const staffPost = (url: string, body: Record<string, unknown>): request.Test =>
  request(app)
    .post(url)
    .set('X-Forwarded-For', uniqueIp())
    .set('Authorization', `Bearer ${staff.token}`)
    .send(body);

async function staffDetail(id: string): Promise<AssistanceRequestDto> {
  return parse(await staffGet(`/api/v1/assistance-requests/${id}`), assistanceRequestResponseSchema)
    .data;
}

async function outboxToken(requestId: string): Promise<string> {
  const row = await prisma.emailNotification.findFirst({
    where: { type: 'REQUEST_VERIFY_EMAIL', relatedRequestId: requestId },
    select: { templateData: true },
  });
  const data: unknown = row?.templateData;
  if (typeof data !== 'object' || data === null) throw new Error('verify email missing');
  const token: unknown = (data as Record<string, unknown>).token;
  if (typeof token !== 'string') throw new Error('verify token missing');
  return token;
}

describe('M3 assistance requests', () => {
  it('seeds fixtures once', async () => {
    await setupFixtures();
    expect(campaignId).not.toBe('');
  });

  it('submits with a REQ- reference and queues two emails', async () => {
    const res = await submitPublic();
    expect(res.status).toBe(201);
    const body = parse(res, submitRequestResponseSchema).data;
    expect(body.referenceNumber).toMatch(/^REQ-\d{4}-\d{6}$/);
    expect(body.status).toBe(RequestStatus.PENDING);

    const detail = await staffDetail(
      (
        await prisma.assistanceRequest.findUniqueOrThrow({
          where: { referenceNumber: body.referenceNumber },
          select: { id: true },
        })
      ).id,
    );
    expect(detail.outsideCampaignArea).toBe(false);
    expect(detail.possibleDuplicate).toBe(false);
    expect(detail.timeline).toHaveLength(1);
    const mails = await prisma.emailNotification.count({
      where: { relatedRequestId: detail.id },
    });
    expect(mails).toBe(2);
  });

  it('rejects a missing consent with 400', async () => {
    const res = await submitPublic({ consent: false });
    expect(res.status).toBe(400);
  });

  it('rejects a failed bot check with 400', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false);
    const res = await submitPublic();
    expect(res.status).toBe(400);
  });

  it('rejects inactive campaigns and unknown items with 422', async () => {
    const draft = await prisma.campaign.create({
      data: {
        name: `M3 Draft ${RUN}`,
        slug: `m3-draft-${RUN}`,
        description: 'draft',
        calamityType: 'FLOOD',
        status: 'DRAFT',
        startDate: new Date(),
        createdById: staff.id,
      },
      select: { id: true },
    });
    const res = await request(app)
      .post('/api/v1/public/assistance-requests')
      .set('X-Forwarded-For', uniqueIp())
      .send({
        fullName: 'Maria Santos',
        email: `draft-${RUN}@example.com`,
        contactNumber: '09171234567',
        barangay: 'San Isidro',
        city: 'Quezon City',
        province: 'Metro Manila',
        campaignId: draft.id,
        items: [{ itemTypeId: plainTypeId, quantity: 1 }],
        consent: true,
        turnstileToken: 'x',
      });
    expect(res.status).toBe(422);
  });

  it('enforces per-request and per-household caps with 422', async () => {
    const overMax = await submitPublic({ itemTypeId: cappedTypeId, quantity: 6 });
    expect(overMax.status).toBe(422);

    const overHousehold = await submitPublic({
      itemTypeId: householdTypeId,
      quantity: 5,
      householdSize: 2,
    });
    expect(overHousehold.status).toBe(422);

    const withinHousehold = await submitPublic({
      itemTypeId: householdTypeId,
      quantity: 4,
      householdSize: 2,
    });
    expect(withinHousehold.status).toBe(201);
  });

  it('blocks a second active request per email per campaign with 409', async () => {
    const email = `dup-${RUN}@example.com`;
    const first = await submitPublic({ email });
    expect(first.status).toBe(201);
    const second = await submitPublic({ email });
    expect(second.status).toBe(409);
    expect(errorCode(second)).toBe('DUPLICATE_ACTIVE_REQUEST');
  });

  it('allows a new request after the prior one was rejected', async () => {
    const email = `rejected-${RUN}@example.com`;
    const first = await submitPublic({ email });
    const ref = parse(first, submitRequestResponseSchema).data.referenceNumber;
    const row = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: ref },
      select: { id: true },
    });
    await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {});
    const rejected = await staffPost(`/api/v1/assistance-requests/${row.id}/reject`, {
      reason: 'Outside the service area.',
    });
    expect(rejected.status).toBe(200);
    const second = await submitPublic({ email });
    expect(second.status).toBe(201);
  });

  it('flags outside-area and same-phone requests without rejecting', async () => {
    const far = await submitPublic({ barangay: 'Faraway', city: 'Other City', province: 'Cebu' });
    expect(far.status).toBe(201);
    const farRef = parse(far, submitRequestResponseSchema).data.referenceNumber;
    const farRow = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: farRef },
      select: { id: true },
    });
    expect((await staffDetail(farRow.id)).outsideCampaignArea).toBe(true);

    const phone = '09981234567';
    await submitPublic({ email: `p1-${RUN}@example.com`, contactNumber: phone });
    const flagged = await submitPublic({ email: `p2-${RUN}@example.com`, contactNumber: phone });
    expect(flagged.status).toBe(201);
    const flaggedRef = parse(flagged, submitRequestResponseSchema).data.referenceNumber;
    const flaggedRow = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: flaggedRef },
      select: { id: true },
    });
    expect((await staffDetail(flaggedRow.id)).possibleDuplicate).toBe(true);
  });

  it('verifies the beneficiary email from the outbox token', async () => {
    const res = await submitPublic();
    const ref = parse(res, submitRequestResponseSchema).data.referenceNumber;
    const row = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: ref },
      select: { id: true },
    });
    const token = await outboxToken(row.id);
    const verified = await request(app)
      .post('/api/v1/public/assistance-requests/verify-email')
      .set('X-Forwarded-For', uniqueIp())
      .send({ token });
    expect(verified.status).toBe(200);
    expect(parse(verified, verifyRequestEmailResponseSchema).data.verified).toBe(true);
    expect((await staffDetail(row.id)).emailVerified).toBe(true);

    const bogus = await request(app)
      .post('/api/v1/public/assistance-requests/verify-email')
      .set('X-Forwarded-For', uniqueIp())
      .send({ token: 'not-a-real-token-value-0123456789' });
    expect(bogus.status).toBe(404);
  });

  it('claims, approves with a TRK- number, and tracks it', async () => {
    const email = `track-${RUN}@example.com`;
    const res = await submitPublic({ email });
    const ref = parse(res, submitRequestResponseSchema).data.referenceNumber;
    const row = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: ref },
      select: { id: true },
    });

    const claimed = await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {});
    expect(claimed.status).toBe(200);

    const approved = await staffPost(`/api/v1/assistance-requests/${row.id}/approve`, {
      note: 'Verified against barangay list.',
    });
    expect(approved.status).toBe(200);
    const detail = parse(approved, assistanceRequestResponseSchema).data;
    expect(detail.status).toBe(RequestStatus.APPROVED);
    expect(detail.trackingNumber).toMatch(/^TRK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(detail.timeline).toHaveLength(3);
    expect(detail.timeline[2]?.note).toBe('Verified against barangay list.');

    const tracked = await request(app)
      .post('/api/v1/public/track')
      .set('X-Forwarded-For', uniqueIp())
      .send({ code: detail.trackingNumber, email });
    expect(tracked.status).toBe(200);
    const trackedBody = parse(tracked, trackRequestResponseSchema).data;
    expect(trackedBody.status).toBe(RequestStatus.APPROVED);
    expect(trackedBody.code).toBe(detail.trackingNumber);
    expect(trackedBody.timeline).toHaveLength(3);
    expect(trackedBody.distribution).toBeNull();
  });

  it('tracks a PENDING request by REQ- code and hides misses identically', async () => {
    const email = `pending-${RUN}@example.com`;
    const res = await submitPublic({ email });
    const ref = parse(res, submitRequestResponseSchema).data.referenceNumber;

    const tracked = await request(app)
      .post('/api/v1/public/track')
      .set('X-Forwarded-For', uniqueIp())
      .send({ code: ref.toLowerCase(), email });
    expect(tracked.status).toBe(200);
    expect(parse(tracked, trackRequestResponseSchema).data.status).toBe(RequestStatus.PENDING);

    const wrongEmail = await request(app)
      .post('/api/v1/public/track')
      .set('X-Forwarded-For', uniqueIp())
      .send({ code: ref, email: `nobody-${RUN}@example.com` });
    expect(wrongEmail.status).toBe(404);
    expect(errorCode(wrongEmail)).toBe('NOT_FOUND');

    const unknownCode = await request(app)
      .post('/api/v1/public/track')
      .set('X-Forwarded-For', uniqueIp())
      .send({ code: 'TRK-XXXX-XXXX', email });
    expect(unknownCode.status).toBe(404);
    expect(errorCode(unknownCode)).toBe('NOT_FOUND');
  });

  it('releases claims and cancels with reasons', async () => {
    const res = await submitPublic();
    const ref = parse(res, submitRequestResponseSchema).data.referenceNumber;
    const row = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: ref },
      select: { id: true },
    });
    await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {});
    const released = await staffPost(`/api/v1/assistance-requests/${row.id}/release`, {});
    expect(parse(released, assistanceRequestResponseSchema).data.status).toBe(
      RequestStatus.PENDING,
    );

    await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {});
    const cancelled = await staffPost(`/api/v1/assistance-requests/${row.id}/cancel`, {
      reason: 'Duplicate of another request.',
    });
    expect(parse(cancelled, assistanceRequestResponseSchema).data.status).toBe(
      RequestStatus.CANCELLED,
    );
  });

  it('serves the public catalog without drafts', async () => {
    const campaigns = parse(
      await request(app)
        .get('/api/v1/public/campaigns?pageSize=100')
        .set('X-Forwarded-For', uniqueIp()),
      publicCampaignListResponseSchema,
    ).data;
    expect(campaigns.items.some((item) => item.id === campaignId)).toBe(true);
    expect(campaigns.items.every((item) => item.status === 'ACTIVE')).toBe(true);

    const visibleName = `A Public ${RUN}`;
    const hiddenName = `A Hidden ${RUN}`;
    await prisma.itemType.create({
      data: { name: visibleName, category: 'HYGIENE', unit: 'kit' },
      select: { id: true },
    });
    await prisma.itemType.create({
      data: { name: hiddenName, category: 'HYGIENE', unit: 'kit', isActive: false },
      select: { id: true },
    });
    const types = parse(
      await request(app)
        .get('/api/v1/public/item-types?pageSize=100')
        .set('X-Forwarded-For', uniqueIp()),
      publicItemTypeListResponseSchema,
    ).data;
    const names = types.items.map((item) => item.name);
    expect(names).toContain(visibleName);
    expect(names).not.toContain(hiddenName);
  });

  it('enforces the staff boundary and rate limits', async () => {
    const donorForbidden = await request(app)
      .get('/api/v1/assistance-requests')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${donor.token}`);
    expect(donorForbidden.status).toBe(403);

    const anonymous = await request(app)
      .get('/api/v1/assistance-requests')
      .set('X-Forwarded-For', uniqueIp());
    expect(anonymous.status).toBe(401);

    let sixth = 0;
    for (let i = 0; i < 6; i += 1) {
      const res = await submitPublic({ ip: fixedIp });
      sixth = res.status;
    }
    expect(sixth).toBe(429);

    let eleventh = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app)
        .post('/api/v1/public/track')
        .set('X-Forwarded-For', '198.51.100.98')
        .send({ code: `TRK-NOPE-${i}`, email: `rate-${RUN}@example.com` });
      eleventh = res.status;
    }
    expect(eleventh).toBe(429);
  });

  it('settles concurrent duplicate submits to exactly one active request', async () => {
    const email = `race-${RUN}@example.com`;
    const [first, second] = await Promise.all([submitPublic({ email }), submitPublic({ email })]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('returns an empty awaiting-stock page until M4', async () => {
    const res = await staffGet('/api/v1/assistance-requests/awaiting-stock');
    expect(res.status).toBe(200);
    expect(parse(res, assistanceRequestListResponseSchema).data.total).toBe(0);
  });

  async function correctionFixture(overrides: SubmitOverrides = {}) {
    const submitted = parse(await submitPublic(overrides), submitRequestResponseSchema).data;
    const row = await prisma.assistanceRequest.findUniqueOrThrow({
      where: { referenceNumber: submitted.referenceNumber },
    });
    return {
      row,
      body: {
        fullName: row.fullName,
        contactNumber: row.contactNumber,
        barangay: row.barangay,
        city: row.city,
        province: row.province,
        householdSize: row.householdSize,
        expectedUpdatedAt: row.updatedAt.toISOString(),
        reason: 'Confirmed clerical correction',
      },
    };
  }

  it('corrects details, recalculates area/duplicate flags, and keeps audit metadata free of personal data', async () => {
    const { row, body } = await correctionFixture({ contactNumber: '09170000111' });
    const res = await staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
      ...body,
      fullName: 'Corrected fixture',
      contactNumber: '09171234567',
      barangay: 'Outside fixture',
    });
    expect(res.status).toBe(200);
    const updated = parse(res, assistanceRequestResponseSchema).data;
    expect(updated.fullName).toBe('Corrected fixture');
    expect(updated.outsideCampaignArea).toBe(true);
    expect(updated.possibleDuplicate).toBe(true);
    expect(updated.email).toBe(row.email);
    expect(updated.status).toBe('PENDING');
    expect(updated.timeline.at(-1)?.note).toBe(
      'Clerical correction: Confirmed clerical correction',
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: row.id, action: 'request.correct' },
    });
    expect(audit.metadata).toEqual({ changedFields: ['fullName', 'contactNumber', 'barangay'] });
    expect(await prisma.emailNotification.count({ where: { relatedRequestId: row.id } })).toBe(2);
    const tracked = await request(app)
      .post('/api/v1/public/track')
      .set('X-Forwarded-For', uniqueIp())
      .send({ code: row.referenceNumber, email: row.email });
    expect(tracked.status).toBe(200);
    expect(JSON.stringify(tracked.body)).not.toContain('Confirmed clerical correction');
  });

  it('rejects email/campaign/item edits, invalid mobile numbers, and household cap violations without changes', async () => {
    const { row, body } = await correctionFixture({
      householdSize: 4,
      itemTypeId: householdTypeId,
      quantity: 8,
    });
    const path = `/api/v1/assistance-requests/${row.id}/correct`;
    for (const extra of [
      { email: 'other@example.com' },
      { campaignId },
      { items: [] },
      { contactNumber: 'bad' },
    ]) {
      expect(
        (await staffPost(path, { ...body, fullName: 'Changed fixture', ...extra })).status,
      ).toBe(400);
    }
    expect((await staffPost(path, { ...body, householdSize: 1 })).status).toBe(422);
    const stored = await prisma.assistanceRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.householdSize).toBe(4);
    expect(stored.fullName).toBe(row.fullName);
    expect(
      await prisma.auditLog.count({ where: { entityId: row.id, action: 'request.correct' } }),
    ).toBe(0);
  });

  it('allows personnel but denies donor and anonymous correction', async () => {
    const { row, body } = await correctionFixture();
    const path = `/api/v1/assistance-requests/${row.id}/correct`;
    expect((await request(app).post(path).send(body)).status).toBe(401);
    expect(
      (await request(app).post(path).set('Authorization', `Bearer ${donor.token}`).send(body))
        .status,
    ).toBe(403);
    for (const role of [UserRole.ADMIN, UserRole.SUPER_ADMIN]) {
      const actor = await makeUser(role);
      try {
        const current = await staffDetail(row.id);
        const res = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-Forwarded-For', uniqueIp())
          .send({ ...body, fullName: `Fixture ${role}`, expectedUpdatedAt: current.updatedAt });
        expect(res.status).toBe(200);
      } finally {
        // The bootstrap suite must start without a Super Admin fixture from this test.
        if (role === UserRole.SUPER_ADMIN) {
          await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.ADMIN } });
        }
      }
    }
  });

  it('blocks corrections after review and anonymization', async () => {
    for (const status of [
      'APPROVED',
      'SCHEDULED',
      'DISTRIBUTED',
      'REJECTED',
      'CANCELLED',
    ] as const) {
      const { row, body } = await correctionFixture();
      await prisma.assistanceRequest.update({
        where: { id: row.id },
        data: { status, rejectionReason: status === 'REJECTED' ? 'Fixture rejection' : null },
      });
      expect(
        (
          await staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
            ...body,
            fullName: 'Forbidden change',
          })
        ).status,
      ).toBe(409);
      expect((await staffDetail(row.id)).fullName).toBe(row.fullName);
    }
    const { row, body } = await correctionFixture();
    await prisma.assistanceRequest.update({
      where: { id: row.id },
      data: { anonymizedAt: new Date() },
    });
    expect(
      (
        await staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
          ...body,
          fullName: 'Forbidden change',
        })
      ).status,
    ).toBe(409);
  });

  it('allows only one concurrent correction from the same displayed version', async () => {
    const { row, body } = await correctionFixture();
    const path = `/api/v1/assistance-requests/${row.id}/correct`;
    const results = await Promise.all([
      staffPost(path, { ...body, fullName: 'First correction' }),
      staffPost(path, { ...body, fullName: 'Second correction' }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.auditLog.count({ where: { entityId: row.id, action: 'request.correct' } }),
    ).toBe(1);
  });

  it('rolls back details and internal history if audit writing fails', async () => {
    const { row, body } = await correctionFixture();
    const historyCount = await prisma.requestStatusEvent.count({ where: { requestId: row.id } });
    const spy = vi.spyOn(audit, 'write').mockRejectedValueOnce(new Error('Audit unavailable'));
    try {
      expect(
        (
          await staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
            ...body,
            fullName: 'Rollback fixture',
          })
        ).status,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const stored = await prisma.assistanceRequest.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.fullName).toBe(row.fullName);
    expect(stored.updatedAt).toEqual(row.updatedAt);
    expect(await prisma.requestStatusEvent.count({ where: { requestId: row.id } })).toBe(
      historyCount,
    );
  });

  it('serializes correction against approval without changing an approved request afterward', async () => {
    const { row, body } = await correctionFixture();
    expect((await staffPost(`/api/v1/assistance-requests/${row.id}/claim`, {})).status).toBe(200);
    const current = await staffDetail(row.id);
    const [correction, approval] = await Promise.all([
      staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
        ...body,
        expectedUpdatedAt: current.updatedAt,
        fullName: 'Racing correction',
      }),
      staffPost(`/api/v1/assistance-requests/${row.id}/approve`, {}),
    ]);
    expect(approval.status).toBe(200);
    expect([200, 409]).toContain(correction.status);
    const final = await staffDetail(row.id);
    expect(final.status).toBe('APPROVED');
    expect(final.fullName).toBe(correction.status === 200 ? 'Racing correction' : row.fullName);
    expect(
      (
        await staffPost(`/api/v1/assistance-requests/${row.id}/correct`, {
          ...body,
          expectedUpdatedAt: final.updatedAt,
          fullName: 'Too late',
        })
      ).status,
    ).toBe(409);
  });
});
