import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { z } from 'zod';
import {
  UserRole,
  accessTokenResponseSchema,
  emailListResponseSchema,
  emailRetryResponseSchema,
  emailUsageResponseSchema,
  errorEnvelopeSchema,
  type EmailDto,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { env } from '../../src/lib/env.js';
import { FixedClock } from '../../src/lib/clock.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { drainOnce, isOverBudget } from '../../src/jobs/email-worker.js';
import { createConsoleProvider } from '../../src/modules/notifications/email/console-provider.js';
import type { EmailProvider } from '../../src/modules/notifications/email/index.js';
import { retryEmail } from '../../src/modules/notifications/notification.service.js';
import { randomUUID } from 'node:crypto';

const app = createApp();
const PASSWORD = 'integration test secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let seq = 0;
let staffToken = '';
let adminToken = '';
let donorToken = '';
let ipSeq = 0;

const uniqueIp = (): string => `198.51.100.${((ipSeq += 1) % 250) + 1}`;
const uniqueDedupe = (label: string): string => `${label}:${RUN}:${seq++}`;

function parse<T>(res: request.Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) throw new Error('unexpected response body');
  return parsed.data;
}

const errorCode = (res: request.Response): string => parse(res, errorEnvelopeSchema).error.code;

beforeAll(async () => {
  const email = `notify-staff-${RUN}@example.com`;
  await prisma.user.create({
    data: {
      name: 'Notify Staff',
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: UserRole.STAFF,
    },
  });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp())
    .send({ email, password: PASSWORD });
  staffToken = parse(res, accessTokenResponseSchema).data.accessToken;
  for (const role of [UserRole.ADMIN, UserRole.DONOR]) {
    const user = await prisma.user.create({
      data: {
        name: 'Email Operations Fixture',
        email: `notify-${role.toLowerCase()}-${RUN}@example.com`,
        passwordHash: await hashPassword(PASSWORD),
        role,
      },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', uniqueIp())
      .send({ email: user.email, password: PASSWORD });
    const token = parse(login, accessTokenResponseSchema).data.accessToken;
    if (role === UserRole.ADMIN) adminToken = token;
    else donorToken = token;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function queueVerifyEmail(): Promise<string> {
  const row = await prisma.emailNotification.create({
    data: {
      type: 'DONOR_VERIFY_EMAIL',
      toEmail: `donor-${RUN}-${seq}@example.com`,
      subject: 'Confirm your Agapay email address',
      templateData: { name: 'Test Donor', token: `token-${RUN}-${seq}` },
      dedupeKey: uniqueDedupe('verify-email'),
      // Priority 1 bypasses the daily budget by design, so send-path tests
      // never depend on SENT rows left behind by previous suite runs.
      priority: 1,
    },
    select: { id: true },
  });
  seq += 1;
  return row.id;
}

describe('email outbox worker', () => {
  it('drains a queued verification email to SENT', async () => {
    const id = await queueVerifyEmail();
    const result = await drainOnce({ provider: createConsoleProvider() });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const row = await prisma.emailNotification.findUnique({ where: { id } });
    expect(row?.status).toBe('SENT');
    expect(row?.providerMessageId).toContain('console-');
    expect(row?.attempts).toBe(0);
  });

  it('marks a row FAILED after five failed attempts with backoff', async () => {
    const id = await queueVerifyEmail();
    // Pin the clock to the real now: queued rows schedule at insert time, so a
    // stale fixed date would leave the row not-due on the first pass.
    const clock = new FixedClock(new Date());
    const failing: EmailProvider = {
      send: () => Promise.reject(new Error('provider down')),
    };
    let scheduledFor: Date | undefined;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      clock.set(new Date((scheduledFor ?? clock.now()).getTime() + 13 * 3_600_000));
      await drainOnce({ clock, provider: failing });
      const row = await prisma.emailNotification.findUnique({ where: { id } });
      if (attempt < 5) {
        expect(row?.status).toBe('QUEUED');
        expect(row?.attempts).toBe(attempt);
        scheduledFor = row?.scheduledFor ?? undefined;
      } else {
        expect(row?.status).toBe('FAILED');
        expect(row?.attempts).toBe(5);
        expect(row?.lastError).toContain('provider down');
      }
    }
  });

  it('computes the daily budget without touching the database', () => {
    expect(isOverBudget(89, 90)).toBe(false);
    expect(isOverBudget(90, 90)).toBe(true);
    expect(isOverBudget(120, 90)).toBe(true);
  });
});

describe('GET /notifications/emails', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/emails')
      .set('X-Forwarded-For', uniqueIp());
    expect(res.status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('lists the outbox for staff with pagination meta', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/emails?page=1&pageSize=5')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const body = parse(res, emailListResponseSchema);
    expect(body.meta.page).toBe(1);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    const first: EmailDto | undefined = body.data[0];
    expect(first?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('POST /notifications/emails/:id/retry', () => {
  it('re-queues a FAILED email and zeroes its attempts', async () => {
    const failed = await prisma.emailNotification.create({
      data: {
        type: 'DONOR_VERIFY_EMAIL',
        toEmail: `retry-${RUN}@example.com`,
        subject: 'Confirm your Agapay email address',
        templateData: { name: 'Retry Donor', token: 'retry-token' },
        dedupeKey: uniqueDedupe('retry'),
        status: 'FAILED',
        attempts: 5,
        lastError: 'provider down',
      },
      select: { id: true },
    });
    const res = await request(app)
      .post(`/api/v1/notifications/emails/${failed.id}/retry`)
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const body = parse(res, emailRetryResponseSchema);
    expect(body.data.status).toBe('QUEUED');
    expect(body.data.attempts).toBe(0);
  });

  it('rejects retrying a non-FAILED email with 409', async () => {
    const id = await queueVerifyEmail();
    const res = await request(app)
      .post(`/api/v1/notifications/emails/${id}/retry`)
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('GET /notifications/emails/usage', () => {
  it('reports sent-today growth after a drain', async () => {
    const before = await request(app)
      .get('/api/v1/notifications/emails/usage')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    const beforeCount = parse(before, emailUsageResponseSchema).data.sentToday;
    const id = await queueVerifyEmail();
    await drainOnce({ provider: createConsoleProvider() });
    const after = await request(app)
      .get('/api/v1/notifications/emails/usage')
      .set('X-Forwarded-For', uniqueIp())
      .set('Authorization', `Bearer ${staffToken}`);
    const usage = parse(after, emailUsageResponseSchema).data;
    expect(usage.limit).toBe(env.EMAIL_DAILY_LIMIT);
    // The diff is a lower bound: stray QUEUED rows from earlier runs (or the
    // auth suite running in parallel) may drain in the same pass. The exact
    // assertion is the row's own status below.
    expect(usage.sentToday).toBeGreaterThanOrEqual(beforeCount + 1);
    expect(usage.remaining).toBe(Math.max(0, usage.limit - usage.sentToday));
    expect(usage.hourlyLimit).toBe(env.EMAIL_HOURLY_LIMIT);
    expect(usage.sentThisHour).toBeGreaterThanOrEqual(1);
    expect(usage.remainingThisHour).toBe(Math.max(0, usage.hourlyLimit - usage.sentThisHour));
    const row = await prisma.emailNotification.findUnique({ where: { id } });
    expect(row?.status).toBe('SENT');
  });
});

describe('M5C email operations', () => {
  async function failedEmail() {
    return prisma.emailNotification.create({
      data: {
        type: 'DONOR_VERIFY_EMAIL',
        toEmail: `ops-${RUN}@example.com`,
        subject: 'Operations fixture',
        templateData: { name: 'Private fixture', token: 'never-return-this-token' },
        dedupeKey: uniqueDedupe('operations'),
        status: 'FAILED',
        attempts: 5,
        lastError: 'Provider unavailable',
        priority: 3,
      },
    });
  }
  it('denies donors and anonymous callers on list, usage and retry; allows administrators', async () => {
    const row = await failedEmail();
    for (const token of ['', donorToken]) {
      for (const path of ['', '/usage', `/${row.id}/retry`]) {
        const req = path.endsWith('/retry')
          ? request(app).post(`/api/v1/notifications/emails${path}`)
          : request(app).get(`/api/v1/notifications/emails${path}`);
        if (token) req.set('Authorization', `Bearer ${token}`);
        const res = await req.set('X-Forwarded-For', uniqueIp());
        expect(res.status).toBe(token ? 403 : 401);
      }
    }
    const list = await request(app)
      .get('/api/v1/notifications/emails?status=FAILED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(list.body)).not.toContain('never-return-this-token');
    const usage = await request(app)
      .get('/api/v1/notifications/emails/usage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(usage.status).toBe(200);
    expect(usage.headers['cache-control']).toBe('no-store');
    const retry = await request(app)
      .post(`/api/v1/notifications/emails/${row.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(retry.status).toBe(200);
    expect(retry.headers['cache-control']).toBe('no-store');
  });
  it('filters status/type and gives stable non-overlapping pages for identical timestamps', async () => {
    const time = new Date('2098-01-01T00:00:00Z');
    for (let i = 0; i < 4; i++) {
      await prisma.emailNotification.create({
        data: {
          type: 'DONATION_REJECTED',
          toEmail: `page-${RUN}@example.com`,
          subject: 'Pagination fixture',
          templateData: {},
          dedupeKey: uniqueDedupe('page'),
          status: 'FAILED',
          createdAt: time,
        },
      });
    }
    const pages = [];
    for (const page of [1, 2]) {
      const res = await request(app)
        .get(
          `/api/v1/notifications/emails?status=FAILED&type=DONATION_REJECTED&pageSize=2&page=${page}`,
        )
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(200);
      const body = parse(res, emailListResponseSchema);
      expect(body.meta.total).toBeGreaterThanOrEqual(4);
      expect(body.data).toHaveLength(2);
      expect(
        body.data.every((row) => row.status === 'FAILED' && row.type === 'DONATION_REJECTED'),
      ).toBe(true);
      pages.push(...body.data.map((row) => row.id));
    }
    expect(new Set(pages).size).toBe(4);
    const bad = await request(app)
      .get('/api/v1/notifications/emails?status=UNKNOWN')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(bad.status).toBe(400);
  });
  it('serializes concurrent retries and preserves dedupe, priority, payload and recipient with one audit entry', async () => {
    const row = await failedEmail();
    const responses = await Promise.all(
      [staffToken, adminToken].map((token) =>
        request(app)
          .post(`/api/v1/notifications/emails/${row.id}/retry`)
          .set('Authorization', `Bearer ${token}`),
      ),
    );
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    const updated = await prisma.emailNotification.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      lastError: null,
      dedupeKey: row.dedupeKey,
      priority: row.priority,
      templateData: row.templateData,
      toEmail: row.toEmail,
    });
    const audits = await prisma.auditLog.findMany({
      where: { entityId: row.id, action: 'notification.retry' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toBeNull();
  });
  it('rolls back requeuing if its audit cannot be written', async () => {
    const row = await failedEmail();
    await expect(retryEmail(row.id, { userId: randomUUID(), role: 'ADMIN' })).rejects.toThrow();
    const saved = await prisma.emailNotification.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved.status).toBe('FAILED');
    expect(saved.attempts).toBe(5);
    expect(saved.lastError).toBe(row.lastError);
  });
  it('rejects invalid/missing identifiers and every non-failed status', async () => {
    for (const [id, status] of [
      ['bad-id', 400],
      [randomUUID(), 404],
    ] as const) {
      const res = await request(app)
        .post(`/api/v1/notifications/emails/${id}/retry`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(status);
    }
    const row = await failedEmail();
    for (const status of ['QUEUED', 'SENDING', 'SENT', 'SUPPRESSED'] as const) {
      await prisma.emailNotification.update({ where: { id: row.id }, data: { status } });
      const res = await request(app)
        .post(`/api/v1/notifications/emails/${row.id}/retry`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(409);
      expect(
        (await prisma.emailNotification.findUniqueOrThrow({ where: { id: row.id } })).status,
      ).toBe(status);
    }
  });
  it('suppresses an obsolete schedule after manual retry without sending it', async () => {
    const row = await failedEmail();
    await prisma.emailNotification.update({
      where: { id: row.id },
      data: {
        type: 'COLLECTION_SCHEDULED',
        priority: 1,
        templateData: {
          name: 'Fixture',
          title: 'Obsolete collection',
          location: 'Fixture site',
          startAt: '2099-01-01T00:00:00Z',
          endAt: '2099-01-01T01:00:00Z',
          schedule: {
            kind: 'collection',
            id: randomUUID(),
            revision: 1,
            mode: 'schedule',
            eventId: randomUUID(),
            eventRevision: 1,
          },
        },
      },
    });
    const res = await request(app)
      .post(`/api/v1/notifications/emails/${row.id}/retry`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    const sentKeys: string[] = [];
    await drainOnce({
      provider: {
        send: (input) => {
          if (input.dedupeKey !== undefined) sentKeys.push(input.dedupeKey);
          return Promise.resolve({ providerMessageId: 'fixture-provider' });
        },
      },
    });
    expect(
      (await prisma.emailNotification.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe('SUPPRESSED');
    expect(sentKeys).not.toContain(row.dedupeKey);
  });
});
