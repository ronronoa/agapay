import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { adminUserResponseSchema, userListResponseSchema, type UserRole } from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { systemClock } from '../../src/lib/clock.js';
import { hashPassword, hashToken } from '../../src/modules/auth/password.js';
import { signAccessToken } from '../../src/modules/auth/tokens.js';
import { resendVerification } from '../../src/modules/auth/auth.service.js';
import { verifyDonorEmail } from '../../src/modules/users/users.service.js';
import * as audit from '../../src/modules/audit/audit.service.js';

const app = createApp();
const ids: string[] = [];
let passwordHash = '';
type Actor = { id: string; role: UserRole; token: string };
let admin: Actor;
let root: Actor;
let staff: Actor;
let donor: Actor;
async function account(role: UserRole, active = true): Promise<Actor> {
  const row = await prisma.user.create({
    data: {
      name: 'Verification fixture',
      email: `${randomUUID()}@example.invalid`,
      role,
      passwordHash,
      isActive: active,
    },
  });
  ids.push(row.id);
  return { id: row.id, role, token: await signAccessToken(row, systemClock) };
}
const verify = (actor: Actor, id: string) =>
  request(app)
    .post(`/api/v1/users/${id}/verify-email`)
    .set('Authorization', `Bearer ${actor.token}`)
    .send({ method: 'PHONE_CALL' });
beforeAll(async () => {
  passwordHash = await hashPassword('manual verification test password');
  admin = await account('ADMIN');
  root = await account('SUPER_ADMIN');
  staff = await account('STAFF');
  donor = await account('DONOR');
});
afterAll(async () => {
  await prisma.emailNotification.deleteMany({
    where: { dedupeKey: { startsWith: 'manual-test:' } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { email: true } });
  await prisma.emailNotification.deleteMany({
    where: { toEmail: { in: users.map((u) => u.email) } },
  });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('manual donor email verification', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)(
    '%s verifies an active donor and records attribution',
    async (role) => {
      const target = await account('DONOR');
      const actor = role === 'ADMIN' ? admin : root;
      const res = await verify(actor, target.id);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(adminUserResponseSchema.parse(res.body).data.emailVerified).toBe(true);
      expect(
        await prisma.auditLog.findFirst({
          where: { entityId: target.id, action: 'user.email.verify' },
        }),
      ).toMatchObject({
        actorId: actor.id,
        metadata: { method: 'manual', offlineMethod: 'PHONE_CALL' },
      });
      expect(adminUserResponseSchema.parse(res.body).data).toMatchObject({
        verificationSource: 'ADMIN',
        verificationMethod: 'PHONE_CALL',
      });
    },
  );

  it('rejects anonymous, Staff, and Donor callers', async () => {
    expect((await request(app).post(`/api/v1/users/${donor.id}/verify-email`)).status).toBe(401);
    for (const actor of [staff, donor]) expect((await verify(actor, donor.id)).status).toBe(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: donor.id } })).emailVerifiedAt,
    ).toBeNull();
  });

  it('rejects invalid IDs, missing accounts, personnel, and disabled donors', async () => {
    expect((await verify(admin, 'invalid')).status).toBe(400);
    expect((await verify(admin, randomUUID())).status).toBe(404);
    for (const target of [admin, root, staff, await account('DONOR', false)]) {
      expect((await verify(admin, target.id)).status).toBe(422);
    }
  });

  it('invalidates verification links, suppresses queued mail, and preserves password resets', async () => {
    const target = await account('DONOR');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const token = randomUUID();
    await prisma.authToken.createMany({
      data: [
        {
          userId: target.id,
          type: 'VERIFY_EMAIL',
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60000),
        },
        {
          userId: target.id,
          type: 'RESET_PASSWORD',
          tokenHash: hashToken(randomUUID()),
          expiresAt: new Date(Date.now() + 60000),
        },
      ],
    });
    const mail = await prisma.emailNotification.create({
      data: {
        type: 'DONOR_VERIFY_EMAIL',
        toEmail: user.email,
        subject: 'Verify fixture',
        templateData: { name: user.name, token },
        dedupeKey: `verify-email:${target.id}:${token}`,
      },
    });
    expect((await verify(admin, target.id)).status).toBe(200);
    expect(
      await prisma.authToken.count({
        where: { userId: target.id, type: 'VERIFY_EMAIL', usedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.authToken.count({
        where: { userId: target.id, type: 'RESET_PASSWORD', usedAt: null },
      }),
    ).toBe(1);
    expect(
      (await prisma.emailNotification.findUniqueOrThrow({ where: { id: mail.id } })).status,
    ).toBe('SUPPRESSED');
    expect((await request(app).post('/api/v1/auth/verify-email').send({ token })).status).toBe(409);
    await resendVerification(user.email, systemClock);
    expect(await prisma.emailNotification.count({ where: { toEmail: user.email } })).toBe(1);
  });

  it('handles repeated concurrent verification once without duplicate audits', async () => {
    const target = await account('DONOR');
    const responses = await Promise.all([verify(admin, target.id), verify(root, target.id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { entityId: target.id, action: 'user.email.verify' } }),
    ).toBe(1);
  });

  it('does not queue an obsolete resend racing with manual verification', async () => {
    const target = await account('DONOR');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    await Promise.all([resendVerification(user.email, systemClock), verify(admin, target.id)]);
    expect(
      await prisma.emailNotification.count({ where: { toEmail: user.email, status: 'QUEUED' } }),
    ).toBe(0);
    expect(
      await prisma.authToken.count({
        where: { userId: target.id, type: 'VERIFY_EMAIL', usedAt: null },
      }),
    ).toBe(0);
  });

  it('rechecks a stale manager role inside the transaction', async () => {
    const target = await account('DONOR');
    const manager = await account('ADMIN');
    await prisma.user.update({ where: { id: manager.id }, data: { role: 'STAFF' } });
    await expect(
      verifyDonorEmail(
        target.id,
        { method: 'IN_PERSON' },
        { userId: manager.id, role: 'ADMIN' },
        systemClock,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('requires a predefined ownership-check method without accepting private evidence', async () => {
    const target = await account('DONOR');
    for (const body of [
      {},
      { method: 'unknown' },
      { method: 'IN_PERSON', evidence: 'private details' },
    ]) {
      expect(
        (
          await request(app)
            .post(`/api/v1/users/${target.id}/verify-email`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).emailVerifiedAt,
    ).toBeNull();
  });

  async function listTarget(target: Actor) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: user.email })
      .set('Authorization', `Bearer ${admin.token}`);
    return userListResponseSchema.parse(res.body).data.items.find((row) => row.id === target.id);
  }

  async function emailLink(target: Actor) {
    const token = randomUUID();
    const row = await prisma.authToken.create({
      data: {
        userId: target.id,
        type: 'VERIFY_EMAIL',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    return { token, id: row.id };
  }

  it('displays email-link, manual legacy, and unknown legacy sources without guessing', async () => {
    const linked = await account('DONOR');
    const link = await emailLink(linked);
    expect(
      (await request(app).post('/api/v1/auth/verify-email').send({ token: link.token })).status,
    ).toBe(200);
    expect(await listTarget(linked)).toMatchObject({
      verificationSource: 'EMAIL_LINK',
      verificationMethod: null,
    });
    const legacy = await account('DONOR');
    await prisma.user.update({ where: { id: legacy.id }, data: { emailVerifiedAt: new Date() } });
    expect(await listTarget(legacy)).toMatchObject({ verificationSource: 'UNKNOWN' });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        entityType: 'User',
        entityId: legacy.id,
        action: 'user.email.verify',
        metadata: { method: 'manual' },
      },
    });
    expect(await listTarget(legacy)).toMatchObject({
      verificationSource: 'ADMIN',
      verificationMethod: null,
    });
  });

  it('records one source when manual and email-link verification race', async () => {
    const target = await account('DONOR');
    const link = await emailLink(target);
    const [manual, linked] = await Promise.all([
      verify(admin, target.id),
      request(app).post('/api/v1/auth/verify-email').send({ token: link.token }),
    ]);
    expect(manual.status).toBe(200);
    expect([200, 409]).toContain(linked.status);
    const events = await prisma.auditLog.findMany({
      where: {
        entityId: target.id,
        action: { in: ['user.email.verify', 'user.email.verify.link'] },
      },
    });
    expect(events).toHaveLength(1);
    expect((await listTarget(target))?.verificationSource).toBe(
      events[0]?.action === 'user.email.verify' ? 'ADMIN' : 'EMAIL_LINK',
    );
  });

  it('rolls back email-link verification and token consumption if attribution cannot be recorded', async () => {
    const target = await account('DONOR');
    const link = await emailLink(target);
    const spy = vi.spyOn(audit, 'write').mockRejectedValueOnce(new Error('Audit unavailable'));
    try {
      expect(
        (await request(app).post('/api/v1/auth/verify-email').send({ token: link.token })).status,
      ).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).emailVerifiedAt,
    ).toBeNull();
    expect(
      (await prisma.authToken.findUniqueOrThrow({ where: { id: link.id } })).usedAt,
    ).toBeNull();
  });

  it('attributes personnel password acceptance to the personnel link', async () => {
    const target = await account('STAFF');
    const token = randomUUID();
    await prisma.authToken.create({
      data: {
        userId: target.id,
        type: 'RESET_PASSWORD',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (
        await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token, password: 'a fresh personnel password' })
      ).status,
    ).toBe(204);
    expect(await listTarget(target)).toMatchObject({
      verificationSource: 'PERSONNEL_LINK',
      emailVerified: true,
    });
  });
});
