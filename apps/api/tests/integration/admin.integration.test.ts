import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  UserRole,
  accessTokenResponseSchema,
  auditListResponseSchema,
  campaignListResponseSchema,
  errorEnvelopeSchema,
  itemTypeListResponseSchema,
  userListResponseSchema,
  adminUserResponseSchema,
  itemTypeResponseSchema,
  campaignResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const app = createApp();
const PASSWORD = 'integration test secret';

let seq = 0;
const uniqueEmail = (): string => `admin-${process.pid}-${seq++}@example.com`;

// ItemType.name and Donation.referenceNumber are globally unique and survive a
// rerun, so those values need a per-run marker or a second run collides.
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const uniqueName = (label: string): string => `${label} ${RUN}-${seq++}`;

interface Actor {
  token: string;
  id: string;
  email: string;
}

async function makeActor(role: UserRole): Promise<Actor> {
  const email = uniqueEmail();
  const user = await prisma.user.create({
    data: { name: 'Test Actor', email, passwordHash: await hashPassword(PASSWORD), role },
  });

  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  const parsed = accessTokenResponseSchema.safeParse(res.body);
  if (res.status !== 200 || !parsed.success) {
    throw new Error(`login failed with ${res.status}`);
  }
  return { token: parsed.data.data.accessToken, id: user.id, email };
}

function as(actor: Actor): Record<string, string> {
  return { Authorization: `Bearer ${actor.token}` };
}

// Supertest types `res.body` as `any`. Every read below goes through one of
// these, which parse with the schema the API actually returns, so a contract
// change fails loudly instead of yielding a silent `undefined` (API-04).
function parse<T>(
  res: request.Response,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  label: string,
): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error(`${label} returned an unexpected body`);
  return parsed.data;
}

const errorCode = (res: request.Response, label: string): string =>
  parse(res, errorEnvelopeSchema, label).error.code;

const userList = (res: request.Response, label = 'GET /users') =>
  parse(res, userListResponseSchema, label).data.items;

const itemList = (res: request.Response, label = 'GET /item-types') =>
  parse(res, itemTypeListResponseSchema, label).data.items;

const campaignList = (res: request.Response, label = 'GET /campaigns') =>
  parse(res, campaignListResponseSchema, label).data.items;

const auditEntries = (res: request.Response, label = 'GET /audit-logs') =>
  parse(res, auditListResponseSchema, label).data.items;

const campaignDetail = (res: request.Response, label = 'GET /campaigns/:id') =>
  campaignResponse(res, label);

const userDetail = (res: request.Response, label = 'user response') =>
  parse(res, adminUserResponseSchema, label).data;

const itemDetailResponse = (res: request.Response, label = 'item type response') =>
  parse(res, itemTypeResponseSchema, label).data;

const campaignResponse = (res: request.Response, label = 'campaign response') =>
  parse(res, campaignResponseSchema, label).data;

let admin: Actor;
let staff: Actor;
let donor: Actor;

beforeAll(async () => {
  admin = await makeActor(UserRole.ADMIN);
  staff = await makeActor(UserRole.STAFF);
  donor = await makeActor(UserRole.DONOR);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('RBAC (SEC-03, API-06)', () => {
  it('refuses every admin route without a token', async () => {
    for (const path of [
      '/api/v1/users',
      '/api/v1/item-types',
      '/api/v1/campaigns',
      '/api/v1/audit-logs',
    ]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('refuses a donor every admin route', async () => {
    for (const path of ['/api/v1/users', '/api/v1/campaigns', '/api/v1/audit-logs']) {
      const res = await request(app).get(path).set(as(donor));
      expect(res.status, path).toBe(403);
    }
  });

  it('lets staff read but not write', async () => {
    expect((await request(app).get('/api/v1/item-types').set(as(staff))).status).toBe(200);
    const write = await request(app)
      .post('/api/v1/item-types')
      .set(as(staff))
      .send({ name: uniqueName('Staff Attempt'), category: 'FOOD', unit: 'pack' });
    expect(write.status).toBe(403);
  });
});

describe('users (api.md section 13)', () => {
  it('creates staff and queues a set-password email instead of setting one', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/users')
      .set(as(admin))
      .send({ name: 'New Staff', email, role: 'STAFF' });

    expect(res.status).toBe(201);
    expect(userDetail(res, 'POST /users')).toMatchObject({ email, role: 'STAFF', isActive: true });

    const queued = await prisma.emailNotification.count({ where: { toEmail: email } });
    expect(queued).toBe(1);

    const stored = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });
    expect(stored?.passwordHash).not.toBe('');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('never exposes a password hash in the list payload', async () => {
    const res = await request(app).get('/api/v1/users').set(as(admin));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects a duplicate email regardless of case', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/v1/users')
      .set(as(admin))
      .send({ name: 'First', email, role: 'STAFF' });

    const res = await request(app)
      .post('/api/v1/users')
      .set(as(admin))
      .send({ name: 'Second', email: email.toUpperCase(), role: 'STAFF' });

    expect(res.status).toBe(409);
    expect(errorCode(res, 'POST /users duplicate')).toBe('CONFLICT');
  });

  it('refuses to let an admin demote themselves', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set(as(admin))
      .send({ role: 'DONOR' });
    expect(res.status).toBe(422);
    expect(errorCode(res, 'PATCH /users self-demote')).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('refuses to let the last active admin disable themselves', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set(as(admin))
      .send({ isActive: false });
    expect(res.status).toBe(422);
  });

  it('disabling a user ends their live sessions immediately', async () => {
    const victim = await makeActor(UserRole.STAFF);

    expect((await request(app).get('/api/v1/auth/me').set(as(victim))).status).toBe(200);

    const disable = await request(app)
      .patch(`/api/v1/users/${victim.id}`)
      .set(as(admin))
      .send({ isActive: false });
    expect(disable.status).toBe(200);

    expect((await request(app).get('/api/v1/auth/me').set(as(victim))).status).toBe(401);
    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: victim.email, password: PASSWORD });
    expect(relogin.status).toBe(401);
  });

  it('filters by role', async () => {
    const res = await request(app).get('/api/v1/users?role=DONOR').set(as(admin));
    expect(res.status).toBe(200);
    expect(userList(res, 'GET /users?role=DONOR').every((row) => row.role === 'DONOR')).toBe(true);
  });

  it('rejects an empty patch', async () => {
    const res = await request(app).patch(`/api/v1/users/${staff.id}`).set(as(admin)).send({});
    expect(res.status).toBe(400);
  });
});

describe('item types (api.md section 6)', () => {
  it('creates an item type and keeps null limits as no cap', async () => {
    const name = uniqueName('Test Canned Goods');
    const res = await request(app)
      .post('/api/v1/item-types')
      .set(as(admin))
      .send({ name, category: 'FOOD', unit: 'can' });

    expect(res.status).toBe(201);
    expect(itemDetailResponse(res, 'POST /item-types')).toMatchObject({
      name,
      maxPerRequest: null,
      perHouseholdMember: null,
    });
  });

  it('rejects a duplicate name', async () => {
    const name = uniqueName('Duplicate Item');
    const payload = { name, category: 'WATER', unit: 'liter' };
    expect(
      (await request(app).post('/api/v1/item-types').set(as(admin)).send(payload)).status,
    ).toBe(201);
    const second = await request(app).post('/api/v1/item-types').set(as(admin)).send(payload);
    expect(second.status).toBe(409);
    expect(errorCode(second, 'POST /item-types duplicate')).toBe('CONFLICT');
  });

  it('archives rather than deletes', async () => {
    const name = uniqueName('Archivable Item');
    const created = await request(app)
      .post('/api/v1/item-types')
      .set(as(admin))
      .send({ name, category: 'OTHER', unit: 'piece' });
    const id = itemDetailResponse(created, 'POST /item-types').id;

    const res = await request(app)
      .patch(`/api/v1/item-types/${id}`)
      .set(as(admin))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(itemDetailResponse(res, 'PATCH /item-types').isActive).toBe(false);

    const stillThere = await prisma.itemType.findUnique({ where: { id }, select: { id: true } });
    expect(stillThere).not.toBeNull();

    const active = await request(app).get('/api/v1/item-types?isActive=true').set(as(admin));
    expect(itemList(active, 'GET /item-types?isActive=true').map((row) => row.id)).not.toContain(
      id,
    );
  });
});

describe('campaigns lifecycle (api.md section 5)', () => {
  async function createCampaign(): Promise<string> {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(as(admin))
      .send({
        name: `Typhoon Test ${RUN}-${seq++}`,
        description: 'Integration test campaign.',
        calamityType: 'TYPHOON',
        startDate: '2026-09-15',
      });
    if (res.status !== 201) throw new Error(`create failed with ${res.status}`);
    return campaignDetail(res, 'POST /campaigns').id;
  }

  it('creates in DRAFT and can activate then complete', async () => {
    const id = await createCampaign();

    const detail = await request(app).get(`/api/v1/campaigns/${id}`).set(as(admin));
    expect(campaignDetail(detail).status).toBe('DRAFT');

    const activated = await request(app).post(`/api/v1/campaigns/${id}/activate`).set(as(admin));
    expect(activated.status).toBe(200);
    expect(campaignDetail(activated, 'POST activate').status).toBe('ACTIVE');

    const completed = await request(app).post(`/api/v1/campaigns/${id}/complete`).set(as(admin));
    expect(completed.status).toBe(200);
    expect(campaignDetail(completed, 'POST complete').status).toBe('COMPLETED');
  });

  it('refuses an illegal transition', async () => {
    const id = await createCampaign();
    const res = await request(app).post(`/api/v1/campaigns/${id}/complete`).set(as(admin));
    expect(res.status).toBe(409);
    expect(errorCode(res, 'POST complete on DRAFT')).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects an endDate before startDate', async () => {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(as(admin))
      .send({
        name: `Bad Dates ${RUN}-${seq++}`,
        description: 'Dates are inverted.',
        calamityType: 'FLOOD',
        startDate: '2026-09-20',
        endDate: '2026-09-10',
      });
    expect(res.status).toBe(400);
  });

  it('protects the General Pool system campaign from archive and delete', async () => {
    const pool = await prisma.campaign.findUnique({ where: { slug: 'general-pool' } });
    if (pool === null) throw new Error('seed did not create the General Pool campaign');

    const archive = await request(app).post(`/api/v1/campaigns/${pool.id}/archive`).set(as(admin));
    expect(archive.status).toBe(422);

    const remove = await request(app).delete(`/api/v1/campaigns/${pool.id}`).set(as(admin));
    expect(remove.status).toBe(422);

    expect(await prisma.campaign.findUnique({ where: { id: pool.id } })).not.toBeNull();
  });

  it('stores areas and priority goods, and reports them as deletable', async () => {
    const itemType = await prisma.itemType.findFirst({ select: { id: true } });
    if (itemType === null) throw new Error('seed did not create item types');

    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(as(admin))
      .send({
        name: `With Areas ${RUN}-${seq++}`,
        description: 'Has areas and priority goods.',
        calamityType: 'FLOOD',
        startDate: '2026-09-15',
        areas: [{ barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' }],
        priorityItems: [{ itemTypeId: itemType.id, targetQuantity: 500 }],
      });

    expect(res.status).toBe(201);
    const created = campaignDetail(res, 'POST /campaigns with areas');
    expect(created.areas).toHaveLength(1);
    expect(created.priorityItems).toHaveLength(1);
    expect(created.deletable).toBe(true);

    const removed = await request(app).delete(`/api/v1/campaigns/${created.id}`).set(as(admin));
    expect(removed.status).toBe(204);
  });

  it('refuses to delete a campaign that has dependents (BR-CAM-03)', async () => {
    const id = await createCampaign();
    await prisma.donation.create({
      data: {
        referenceNumber: `DON-TEST-${RUN}-${seq++}`,
        campaignId: id,
        status: 'PENDING',
        donorId: donor.id,
      },
    });

    const res = await request(app).delete(`/api/v1/campaigns/${id}`).set(as(admin));
    expect(res.status).toBe(409);
    expect(errorCode(res, 'DELETE /campaigns with dependents')).toBe('CONFLICT');
  });

  it('lists campaigns for staff', async () => {
    const res = await request(app).get('/api/v1/campaigns').set(as(staff));
    expect(res.status).toBe(200);
    expect(Array.isArray(campaignList(res))).toBe(true);
  });
});

describe('audit log (DB-19, DB-29)', () => {
  it('writes an entry in the same transaction as the change', async () => {
    const name = uniqueName('Audited Item');
    await request(app)
      .post('/api/v1/item-types')
      .set(as(admin))
      .send({ name, category: 'FOOD', unit: 'pack' });

    const created = await prisma.itemType.findUnique({ where: { name }, select: { id: true } });
    if (created === null) throw new Error('item type was not created');

    // Scoped to this row: earlier runs and other actors also wrote
    // itemType.create entries, so a bare action filter would assert against
    // unrelated history.
    const res = await request(app)
      .get(`/api/v1/audit-logs?action=itemType.create&entityType=ItemType&entityId=${created.id}`)
      .set(as(admin));
    expect(res.status).toBe(200);

    const entries = auditEntries(res, 'GET /audit-logs itemType.create');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.actorId === admin.id)).toBe(true);
    expect(entries.every((entry) => entry.entityType === 'ItemType')).toBe(true);
  });

  it('records campaign lifecycle transitions', async () => {
    const id = await createCampaignForAudit();
    await request(app).post(`/api/v1/campaigns/${id}/activate`).set(as(admin));

    const res = await request(app)
      .get(`/api/v1/audit-logs?entityType=Campaign&entityId=${id}`)
      .set(as(admin));

    const actions = auditEntries(res, 'GET /audit-logs campaign').map((row) => row.action);
    expect(actions).toContain('campaign.create');
    expect(actions).toContain('campaign.active');
  });

  async function createCampaignForAudit(): Promise<string> {
    const res = await request(app)
      .post('/api/v1/campaigns')
      .set(as(admin))
      .send({
        name: `Audited Campaign ${RUN}-${seq++}`,
        description: 'For audit assertions.',
        calamityType: 'FIRE',
        startDate: '2026-09-15',
      });
    if (res.status !== 201) throw new Error(`create failed with ${res.status}`);
    return campaignDetail(res, 'POST /campaigns for audit').id;
  }

  it('paginates with a keyset cursor and does not repeat rows', async () => {
    const first = await request(app).get('/api/v1/audit-logs?limit=3').set(as(admin));
    expect(first.status).toBe(200);

    const page1 = auditEntries(first, 'GET /audit-logs?limit=3');
    expect(page1.length).toBeLessThanOrEqual(3);

    const cursor = parse(first, auditListResponseSchema, 'GET /audit-logs?limit=3').data.nextCursor;
    expect(cursor).toBeTruthy();

    const second = await request(app)
      .get(`/api/v1/audit-logs?limit=3&cursor=${encodeURIComponent(String(cursor))}`)
      .set(as(admin));

    const page2 = auditEntries(second, 'GET /audit-logs page 2');
    const overlap = page1.filter((row) => page2.some((next) => next.id === row.id));
    expect(overlap).toHaveLength(0);
  });

  it('never returns personal data in metadata', async () => {
    const res = await request(app).get('/api/v1/audit-logs?limit=100').set(as(admin));
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain(PASSWORD);
  });
});
