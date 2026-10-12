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

const app = createApp();
const PASSWORD = 'integration test secret';
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

let seq = 0;
let staffToken = '';
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
    const row = await prisma.emailNotification.findUnique({ where: { id } });
    expect(row?.status).toBe('SENT');
  });
});
