import { SignJWT, jwtVerify } from 'jose';
import { UserRole, type UserRole as UserRoleType } from '@agapay/shared';
import { unauthenticated } from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { env } from '../../lib/env.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_SECONDS,
} from './auth.config.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  userId: string;
  role: UserRoleType;
}

export async function signAccessToken(
  user: { id: string; role: UserRoleType },
  clock: Clock,
): Promise<string> {
  const issuedAt = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret);
}

export function isUserRole(value: unknown): value is UserRoleType {
  return typeof value === 'string' && (Object.values(UserRole) as string[]).includes(value);
}

export async function verifyAccessToken(token: string, clock: Clock): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
      currentDate: clock.now(),
    });
    if (!payload.sub || !isUserRole(payload.role)) throw new Error('malformed access token claims');
    return { userId: payload.sub, role: payload.role };
  } catch {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
}
