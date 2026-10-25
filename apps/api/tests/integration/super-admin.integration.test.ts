import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  settingsResponseSchema,
  supportConversationResponseSchema,
  supportSendResponseSchema,
  type UserRole,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { systemClock } from '../../src/lib/clock.js';
import { hashPassword, hashToken } from '../../src/modules/auth/password.js';
import { signAccessToken } from '../../src/modules/auth/tokens.js';
import { bootstrapSuperAdmin } from '../../src/modules/users/users.service.js';

const app = createApp();
const run = `${process.pid}-${Date.now()}`;
const ids: string[] = [];
const password = 'Super Admin integration secret';
let passwordHash = '';
type Actor = { id: string; token: string };
let root: Actor;
let admin: Actor;
let staff: Actor;
let donor: Actor;
async function actor(role: UserRole): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      name: 'Permission fixture',
      email: `super-${ids.length}-${run}@example.invalid`,
      role,
      passwordHash,
    },
  });
  ids.push(user.id);
  return { id: user.id, token: await signAccessToken(user, systemClock) };
}
const auth = (a: Actor) => ({ Authorization: `Bearer ${a.token}` });
beforeAll(async () => {
  passwordHash = await hashPassword(password);
  const selected = await actor('ADMIN');
  await bootstrapSuperAdmin(selected.id, systemClock);
  root = {
    id: selected.id,
    token: await signAccessToken(
      await prisma.user.findUniqueOrThrow({ where: { id: selected.id } }),
      systemClock,
    ),
  };
  admin = await actor('ADMIN');
  staff = await actor('STAFF');
  donor = await actor('DONOR');
});
afterAll(async () => {
  const conversations = await prisma.supportConversation.findMany({
    where: { donorId: { in: ids } },
    select: { id: true },
  });
  const conversationIds = conversations.map((row) => row.id);
  await prisma.supportRead.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { conversationId: { in: conversationIds } }] },
  });
  await prisma.supportMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await prisma.supportConversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.inboxNotification.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { conversationId: { in: conversationIds } }] },
  });
  await prisma.liveEvent.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { conversationId: { in: conversationIds } }] },
  });
  await prisma.liveState.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('Super Admin authorization and lifecycle', () => {
  it('bootstraps only the selected Admin once and records the role change', async () => {
    expect(
      await prisma.user.findUnique({ where: { id: root.id }, select: { role: true } }),
    ).toEqual({ role: 'SUPER_ADMIN' });
    expect(
      await prisma.user.findUnique({ where: { id: admin.id }, select: { role: true } }),
    ).toEqual({ role: 'ADMIN' });
    await expect(bootstrapSuperAdmin(admin.id, systemClock)).rejects.toThrow(
      'Super Admin already exists',
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: root.id, action: 'user.super_admin.bootstrap' },
    });
    expect(audit?.metadata).toEqual({ role: 'SUPER_ADMIN' });
  });

  it('inherits management access but not donor-only identity', async () => {
    for (const path of [
      '/users',
      '/settings',
      '/dashboard/admin',
      '/reports/donations',
      '/campaigns',
      '/donations',
      '/assistance-requests',
      '/inventory',
      '/calendar/events',
      '/distributions',
      '/item-types',
      '/audit-logs',
      '/notifications/emails',
    ]) {
      expect((await request(app).get(`/api/v1${path}`).set(auth(root))).status, path).toBe(200);
    }
    expect((await request(app).get('/api/v1/dashboard/donor').set(auth(root))).status).toBe(403);
  });

  it('enforces Settings permission at the HTTP and service transaction boundaries', async () => {
    expect((await request(app).get('/api/v1/settings').set(auth(admin))).status).toBe(200);
    const current = settingsResponseSchema.parse(
      (await request(app).get('/api/v1/settings').set(auth(root))).body,
    ).data;
    for (const a of [admin, staff, donor]) {
      expect((await request(app).patch('/api/v1/settings').set(auth(a)).send(current)).status).toBe(
        403,
      );
    }
    for (const a of [staff, donor])
      expect((await request(app).get('/api/v1/settings').set(auth(a))).status).toBe(403);
    expect(
      (await request(app).patch('/api/v1/settings').set(auth(root)).send(current)).status,
    ).toBe(200);
    expect(
      (await request(app).patch('/api/v1/settings').set(auth(root)).send(current)).status,
    ).toBe(409);
  });

  it('blocks public role injection and Admin Super Admin creation or promotion', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .send({
            name: 'Fixture',
            email: `public-${run}@example.invalid`,
            password,
            role: 'SUPER_ADMIN',
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/v1/users')
          .set(auth(admin))
          .send({ name: 'Fixture', email: `forged-${run}@example.invalid`, role: 'SUPER_ADMIN' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${staff.id}`)
          .set(auth(admin))
          .send({ role: 'SUPER_ADMIN' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/v1/auth/me')
          .set(auth(admin))
          .send({ name: 'Fixture', role: 'SUPER_ADMIN' })
      ).status,
    ).toBe(400);
  });

  it('lets only Super Admin create and manage another Super Admin', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .set(auth(root))
      .send({
        name: 'Invited fixture',
        email: `invited-${run}@example.invalid`,
        role: 'SUPER_ADMIN',
      });
    expect(response.status).toBe(201);
    const invited = await prisma.user.findUniqueOrThrow({
      where: { email: `invited-${run}@example.invalid` },
    });
    ids.push(invited.id);
    try {
      for (const body of [{ name: 'Forbidden edit' }, { isActive: false }, { role: 'STAFF' }]) {
        expect(
          (await request(app).patch(`/api/v1/users/${invited.id}`).set(auth(admin)).send(body))
            .status,
        ).toBe(403);
      }
      expect(
        (await request(app).post(`/api/v1/users/${invited.id}/invitation`).set(auth(admin))).status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .patch(`/api/v1/users/${invited.id}`)
            .set(auth(root))
            .send({ name: 'Updated fixture' })
        ).status,
      ).toBe(200);
    } finally {
      await prisma.user.delete({ where: { id: invited.id } });
    }
  });

  it('revokes refresh sessions and rejects old access tokens after role changes', async () => {
    const target = await actor('ADMIN');
    await prisma.refreshToken.create({
      data: {
        userId: target.id,
        tokenHash: hashToken(`refresh-${run}`),
        familyId: target.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${target.id}`)
          .set(auth(root))
          .send({ role: 'STAFF' })
      ).status,
    ).toBe(200);
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      0,
    );
    expect((await request(app).get('/api/v1/reports/donations').set(auth(target))).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${target.id}`)
          .set(auth(root))
          .send({ role: 'ADMIN' })
      ).status,
    ).toBe(200);
    expect((await request(app).get('/api/v1/reports/donations').set(auth(target))).status).toBe(
      401,
    );
  });

  it('prevents self-removal and preserves a Super Admin during concurrent cross-demotions', async () => {
    for (const body of [{ role: 'ADMIN' }, { isActive: false }]) {
      expect(
        (await request(app).patch(`/api/v1/users/${root.id}`).set(auth(root)).send(body)).status,
      ).toBe(422);
    }
    const second = await actor('SUPER_ADMIN');
    try {
      const responses = await Promise.all([
        request(app).patch(`/api/v1/users/${second.id}`).set(auth(root)).send({ role: 'STAFF' }),
        request(app).patch(`/api/v1/users/${root.id}`).set(auth(second)).send({ role: 'STAFF' }),
      ]);
      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await prisma.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } })).toBe(1);
    } finally {
      const restored = await prisma.user.update({
        where: { id: root.id },
        data: { role: 'SUPER_ADMIN' },
      });
      root.token = await signAccessToken(restored, systemClock);
      await prisma.user.delete({ where: { id: second.id } });
    }
  });

  it('cannot recreate a refresh session while its role is being revoked', async () => {
    const target = await actor('ADMIN');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const agent = request.agent(app);
    expect(
      (await agent.post('/api/v1/auth/login').send({ email: user.email, password })).status,
    ).toBe(200);
    const [change, refresh] = await Promise.all([
      request(app).patch(`/api/v1/users/${target.id}`).set(auth(root)).send({ role: 'STAFF' }),
      agent.post('/api/v1/auth/refresh').set('x-requested-with', 'agapay'),
    ]);
    expect(change.status).toBe(200);
    expect([200, 401]).toContain(refresh.status);
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(
      0,
    );
  });

  it('supports Super Admin messages and includes them in live recipients', async () => {
    const conversation = supportConversationResponseSchema.parse(
      (await request(app).post('/api/v1/support/conversations').set(auth(donor))).body,
    ).data;
    const sent = await request(app)
      .post(`/api/v1/support/conversations/${conversation.id}/messages`)
      .set(auth(root))
      .send({ body: 'Operations fixture reply', clientMessageId: crypto.randomUUID() });
    expect(sent.status).toBe(200);
    expect(supportSendResponseSchema.parse(sent.body).data.senderRole).toBe('SUPER_ADMIN');
    const incoming = await request(app)
      .post(`/api/v1/support/conversations/${conversation.id}/messages`)
      .set(auth(donor))
      .send({ body: 'Fixture follow-up', clientMessageId: crypto.randomUUID() });
    expect(incoming.status).toBe(200);
    expect(
      await prisma.liveEvent.count({ where: { userId: root.id, conversationId: conversation.id } }),
    ).toBeGreaterThan(0);
  });
});
