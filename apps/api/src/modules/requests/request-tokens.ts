import { SignJWT, jwtVerify } from 'jose';
import { notFound } from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { env } from '../../lib/env.js';

const REQUEST_TOKEN_AUDIENCE = 'agapay-request';
const REQUEST_TOKEN_ISSUER = 'agapay';
const REQUEST_VERIFY_TTL_SECONDS = 24 * 60 * 60;

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function signRequestVerifyToken(
  input: { requestId: string; email: string },
  clock: Clock,
): Promise<string> {
  const issuedAt = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({ email: input.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.requestId)
    .setIssuer(REQUEST_TOKEN_ISSUER)
    .setAudience(REQUEST_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + REQUEST_VERIFY_TTL_SECONDS)
    .sign(secret);
}

export async function verifyRequestVerifyToken(
  token: string,
  clock: Clock,
): Promise<{ requestId: string; email: string }> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: REQUEST_TOKEN_ISSUER,
      audience: REQUEST_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
      currentDate: clock.now(),
    });
    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      typeof payload.email !== 'string' ||
      payload.email.length === 0
    ) {
      throw new Error('malformed request token claims');
    }
    return { requestId: payload.sub, email: payload.email };
  } catch {
    throw notFound('Verification link');
  }
}
