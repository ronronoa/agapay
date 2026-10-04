import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  accessTokenResponseSchema,
  authUserResponseSchema,
  errorEnvelopeSchema,
  registeredUserResponseSchema,
  verifyEmailResponseSchema,
} from '@agapay/shared';
import { prisma } from '../../src/lib/prisma.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

const app = createApp();
const CSRF = { 'x-requested-with': 'agapay' } as const;
const GOOD_PASSWORD = 'correct horse battery';

let seq = 0;
const uniqueEmail = (): string => `auth-${process.pid}-${seq++}@example.com`;

let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `203.0.113.${(ipSeq % 250) + 1}`;
}

function post(path: string): request.Test {
  return request(app).post(path).set('X-Forwarded-For', nextIp());
}

function get(path: string): request.Test {
  return request(app).get(path).set('X-Forwarded-For', nextIp());
}

function patch(path: string): request.Test {
  return request(app).patch(path).set('X-Forwarded-For', nextIp());
}

function pinnedPost(path: string, ip: string): request.Test {
  return request(app).post(path).set('X-Forwarded-For', ip);
}

async function createUser(options: { verified?: boolean; active?: boolean } = {}): Promise<string> {
  const email = uniqueEmail();
  await prisma.user.create({
    data: {
      name: 'Ana Reyes',
      email,
      passwordHash: await hashPassword(GOOD_PASSWORD),
      emailVerifiedAt: options.verified === true ? new Date() : null,
      isActive: options.active !== false,
    },
  });
  return email;
}

async function loginAs(email: string, password = GOOD_PASSWORD): Promise<request.Response> {
  return post('/api/v1/auth/login').send({ email, password });
}

function setCookieHeaders(res: request.Response): string[] {
  const raw: unknown = res.headers['set-cookie'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string');
  return [];
}

function cookieOf(res: request.Response): string {
  const first = setCookieHeaders(res)[0];
  if (first === undefined) throw new Error('expected a set-cookie header');
  return first.split(';')[0] ?? '';
}

function errorCode(res: request.Response): string {
  return errorEnvelopeSchema.parse(res.body).error.code;
}

function accessTokenOf(res: request.Response): string {
  return accessTokenResponseSchema.parse(res.body).data.accessToken;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('register (D-03)', () => {
  it('creates a donor and queues a verification email instead of sending it', async () => {
    const email = uniqueEmail();
    const res = await post('/api/v1/auth/register').send({
      name: 'Ana Reyes',
      email,
      password: GOOD_PASSWORD,
    });

    expect(res.status).toBe(201);
    const body = registeredUserResponseSchema.parse(res.body);
    expect(body.data.email).toBe(email);
    expect(body.data.emailVerified).toBe(false);
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/);

    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    expect(user?.role).toBe('DONOR');

    const queued = await prisma.emailNotification.count({ where: { toEmail: email } });
    expect(queued).toBe(1);
  });

  it('never stores the password in the clear', async () => {
    const email = uniqueEmail();
    await post('/api/v1/auth/register').send({ name: 'Ana Reyes', email, password: GOOD_PASSWORD });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });
    expect(user?.passwordHash).not.toContain(GOOD_PASSWORD);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('refuses a second account on the same email regardless of case', async () => {
    const email = await createUser();
    const res = await post('/api/v1/auth/register').send({
      name: 'Someone Else',
      email: email.toUpperCase(),
      password: GOOD_PASSWORD,
    });

    expect(res.status).toBe(409);
    expect(errorCode(res)).toBe('CONFLICT');
  });

  it('rejects an unexpected field rather than ignoring it', async () => {
    const res = await post('/api/v1/auth/register').send({
      name: 'Ana Reyes',
      email: uniqueEmail(),
      password: GOOD_PASSWORD,
      role: 'ADMIN',
    });

    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('rejects a password below the documented minimum', async () => {
    const res = await post('/api/v1/auth/register').send({
      name: 'Ana Reyes',
      email: uniqueEmail(),
      password: 'short',
    });

    expect(res.status).toBe(400);
  });
});

describe('verify email', () => {
  it('marks the address verified and refuses a second use of the same token', async () => {
    const email = uniqueEmail();
    await post('/api/v1/auth/register').send({ name: 'Ana Reyes', email, password: GOOD_PASSWORD });

    const queued = await prisma.emailNotification.findFirst({
      where: { toEmail: email },
      select: { templateData: true },
    });
    const token = (queued?.templateData as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') throw new Error('expected a queued token');

    const first = await post('/api/v1/auth/verify-email').send({ token });
    expect(first.status).toBe(200);
    expect(verifyEmailResponseSchema.parse(first.body).data.verified).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { emailVerifiedAt: true },
    });
    expect(user?.emailVerifiedAt).not.toBeNull();

    const second = await post('/api/v1/auth/verify-email').send({ token });
    expect(second.status).toBe(409);
  });

  it('rejects an unknown token', async () => {
    const res = await post('/api/v1/auth/verify-email').send({ token: 'a'.repeat(43) });
    expect(res.status).toBe(401);
  });
});

describe('login', () => {
  it('sets an httpOnly SameSite=Lax refresh cookie and returns an access token', async () => {
    const email = await createUser();
    const res = await loginAs(email);

    expect(res.status).toBe(200);
    const body = accessTokenResponseSchema.parse(res.body);
    expect(body.data.expiresIn).toBe(900);
    expect(body.data.user.email).toBe(email);

    const header = setCookieHeaders(res)[0] ?? '';
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/api/v1/auth');
  });

  it('gives the same answer for an unknown email and a wrong password (SEC-01)', async () => {
    const email = await createUser();

    const wrongPassword = await loginAs(email, 'not the right one');
    const unknownEmail = await loginAs(uniqueEmail(), 'not the right one');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(errorEnvelopeSchema.parse(wrongPassword.body).error.message).toBe(
      errorEnvelopeSchema.parse(unknownEmail.body).error.message,
    );
  });

  it('refuses a suspended account', async () => {
    const email = await createUser({ active: false });
    const res = await loginAs(email);
    expect(res.status).toBe(401);
  });

  it('lets an unverified donor in, since D-03 gates donations instead', async () => {
    const email = await createUser({ verified: false });
    const res = await loginAs(email);
    expect(res.status).toBe(200);
    expect(accessTokenResponseSchema.parse(res.body).data.user.emailVerified).toBe(false);
  });

  it('records lastLoginAt', async () => {
    const email = await createUser();
    await loginAs(email);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { lastLoginAt: true },
    });
    expect(user?.lastLoginAt).not.toBeNull();
  });

  it('never returns a token hash or a password hash', async () => {
    const email = await createUser();
    const res = await loginAs(email);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('tokenHash');
    expect(serialised).not.toContain('passwordHash');
  });
});

describe('refresh rotation and reuse detection (SEC-02)', () => {
  it('rotates the token and keeps it in one family', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const rotated = await post('/api/v1/auth/refresh').set(CSRF).set('Cookie', cookieOf(login));

    expect(rotated.status).toBe(200);
    expect(accessTokenResponseSchema.parse(rotated.body).data.accessToken).toBeTruthy();

    const rows = await prisma.refreshToken.findMany({
      where: { user: { email } },
      select: { familyId: true },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.familyId)).size).toBe(1);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const email = await createUser();
    const login = await loginAs(email);
    const cookie = cookieOf(login);

    await post('/api/v1/auth/refresh').set(CSRF).set('Cookie', cookie);

    const replay = await post('/api/v1/auth/refresh').set(CSRF).set('Cookie', cookie);
    expect(replay.status).toBe(401);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('lets exactly one of two simultaneous refreshes win (TEST-03)', async () => {
    const email = await createUser();
    const login = await loginAs(email);
    const cookie = cookieOf(login);

    const results = await Promise.all([
      post('/api/v1/auth/refresh').set(CSRF).set('Cookie', cookie),
      post('/api/v1/auth/refresh').set(CSRF).set('Cookie', cookie),
    ]);

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 401)).toHaveLength(1);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('refuses a refresh without the CSRF header', async () => {
    const res = await post('/api/v1/auth/refresh');
    expect(res.status).toBe(403);
  });

  it('refuses a refresh with no cookie at all', async () => {
    const res = await post('/api/v1/auth/refresh').set(CSRF);
    expect(res.status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the family and clears the cookie', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const res = await post('/api/v1/auth/logout').set(CSRF).set('Cookie', cookieOf(login));
    expect(res.status).toBe(204);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);
  });
});

describe('me', () => {
  it('returns the caller and never a password hash', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const res = await get('/api/v1/auth/me').set('Authorization', `Bearer ${accessTokenOf(login)}`);

    expect(res.status).toBe(200);
    const body = authUserResponseSchema.parse(res.body).data;
    expect(body.email).toBe(email);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('is a 401 without a token', async () => {
    const res = await get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('is a 401 for a malformed token', async () => {
    const res = await get('/api/v1/auth/me').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });

  it('refuses a donor suspended after the token was issued', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    await prisma.user.update({ where: { email }, data: { isActive: false } });

    const res = await get('/api/v1/auth/me').set('Authorization', `Bearer ${accessTokenOf(login)}`);
    expect(res.status).toBe(401);
  });
});

describe('profile and password', () => {
  it('updates the name and phone', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const res = await patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessTokenOf(login)}`)
      .send({ name: 'Ana Reyes Santos', phone: '09171234567' });

    expect(res.status).toBe(200);
    const body = authUserResponseSchema.parse(res.body).data;
    expect(body).toMatchObject({ name: 'Ana Reyes Santos', phone: '09171234567' });
  });

  it('changes the password and ends every existing session', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const res = await post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessTokenOf(login)}`)
      .send({ currentPassword: GOOD_PASSWORD, newPassword: 'a brand new secret' });

    expect(res.status).toBe(204);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);

    expect((await loginAs(email)).status).toBe(401);
    expect((await loginAs(email, 'a brand new secret')).status).toBe(200);
  });

  it('refuses a password change when the current password is wrong', async () => {
    const email = await createUser();
    const login = await loginAs(email);

    const res = await post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessTokenOf(login)}`)
      .send({ currentPassword: 'not it', newPassword: 'a brand new secret' });

    expect(res.status).toBe(401);
  });
});

describe('rate limits (api.md §2)', () => {
  it('stops the 11th login from one address, since the limit is 10 per 15 min', async () => {
    const attackerIp = '198.51.100.7';
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await pinnedPost('/api/v1/auth/login', attackerIp).send({
        email: uniqueEmail(),
        password: 'not the right one',
      });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('answers a throttled request with the shared error envelope', async () => {
    const attackerIp = '198.51.100.8';
    let last: request.Response | undefined;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      last = await pinnedPost('/api/v1/auth/login', attackerIp).send({
        email: uniqueEmail(),
        password: 'not the right one',
      });
    }

    if (last === undefined) throw new Error('expected a response');
    expect(last.status).toBe(429);
    expect(errorCode(last)).toBe('RATE_LIMITED');
    expect(last.headers['retry-after']).toBeDefined();
  });
});

describe('forgot password', () => {
  it('answers 204 for an unknown email so it cannot enumerate accounts', async () => {
    const res = await post('/api/v1/auth/forgot-password').send({ email: uniqueEmail() });
    expect(res.status).toBe(204);
  });

  it('queues a reset email for a real account', async () => {
    const email = await createUser();
    const res = await post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(204);

    const queued = await prisma.emailNotification.count({
      where: { toEmail: email, type: 'DONOR_PASSWORD_RESET' },
    });
    expect(queued).toBe(1);
  });
});
