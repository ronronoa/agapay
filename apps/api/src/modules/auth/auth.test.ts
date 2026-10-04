import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, registerSchema } from '@agapay/shared';
import { FixedClock } from '../../lib/clock.js';
import { env } from '../../lib/env.js';
import { ACCESS_TOKEN_AUDIENCE } from './auth.config.js';
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from './password.js';
import { signAccessToken, verifyAccessToken } from './tokens.js';

describe('password hashing (SEC-01)', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false);
  });

  it('reads a malformed stored hash as a wrong password rather than throwing', async () => {
    expect(await verifyPassword('not-an-argon2-hash', 'anything')).toBe(false);
  });

  it('salts, so the same password never yields the same hash', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
  });

  it('produces an argon2id digest', async () => {
    expect(await hashPassword('correct horse battery')).toMatch(/^\$argon2id\$/);
  });
});

describe('password policy', () => {
  it('rejects anything under the documented minimum of 10', () => {
    expect(passwordSchema.safeParse('abcdefghi').success).toBe(false);
    expect(passwordSchema.safeParse('abcdefghij').success).toBe(true);
  });

  it('rejects a common password that clears the length check', () => {
    expect(passwordSchema.safeParse('password123').success).toBe(false);
  });

  it('rejects an unbounded password', () => {
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('does not re-apply the policy on login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
  });
});

describe('register schema (SEC-05)', () => {
  it('rejects an unexpected key instead of ignoring it', () => {
    const parsed = registerSchema.safeParse({
      name: 'Ana Reyes',
      email: 'ana@example.com',
      password: 'longenough1',
      role: 'ADMIN',
    });
    expect(parsed.success).toBe(false);
  });

  it('lowercases the email so two cases of one address cannot both register', () => {
    const parsed = registerSchema.parse({
      name: 'Ana Reyes',
      email: 'Ana@Example.COM',
      password: 'longenough1',
    });
    expect(parsed.email).toBe('ana@example.com');
  });

  it('rejects a malformed phone number', () => {
    const parsed = registerSchema.safeParse({
      name: 'Ana Reyes',
      email: 'ana@example.com',
      password: 'longenough1',
      phone: '12345',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('opaque tokens (SEC-02)', () => {
  it('is 256 bits of randomness, base64url encoded', () => {
    expect(generateOpaqueToken()).toHaveLength(43);
  });

  it('is different every call', () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });

  it('hashes deterministically and never returns the token', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });
});

describe('access tokens (SEC-02)', () => {
  it('round-trips the subject and role', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const token = await signAccessToken({ id: 'user-1', role: 'ADMIN' }, clock);
    expect(await verifyAccessToken(token, clock)).toEqual({ userId: 'user-1', role: 'ADMIN' });
  });

  it('is rejected once it is past its 15 minute life', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const token = await signAccessToken({ id: 'user-1', role: 'DONOR' }, clock);
    clock.advance(901 * 1000);
    await expect(verifyAccessToken(token, clock)).rejects.toThrow(/expired/i);
  });

  it('is still valid one second before expiry', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const token = await signAccessToken({ id: 'user-1', role: 'DONOR' }, clock);
    clock.advance(899 * 1000);
    await expect(verifyAccessToken(token, clock)).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('is rejected when the issuer does not match', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const issuedAt = Math.floor(clock.now().getTime() / 1000);
    const foreign = await new SignJWT({ role: 'DONOR' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('somebody-else')
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(foreign, clock)).rejects.toThrow();
  });

  it('is rejected when the role claim is not a known role', async () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const issuedAt = Math.floor(clock.now().getTime() / 1000);
    const forged = await new SignJWT({ role: 'SUPERUSER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('agapay-api')
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    await expect(verifyAccessToken(forged, clock)).rejects.toThrow();
  });
});
