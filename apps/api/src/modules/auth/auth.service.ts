import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  AuthTokenType,
  NotificationType,
  UserRole,
  type UserRole as UserRoleType,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { conflict, unauthenticated } from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { logger } from '../../lib/logger.js';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@agapay/shared';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  VERIFY_TOKEN_TTL_MS,
} from './auth.config.js';
import {
  generateOpaqueToken,
  hashIp,
  hashPassword,
  hashToken,
  spendPasswordTime,
  verifyPassword,
} from './password.js';
import { signAccessToken } from './tokens.js';
import { write as writeAudit } from '../audit/audit.service.js';

const GENERIC_LOGIN_FAILURE = 'Email or password is incorrect.';
const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

export interface RequestMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRoleType;
  phone: string | null;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisteredUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRoleType;
  phone: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  sessionVersion: true,
  phone: true,
  emailVerifiedAt: true,
  isActive: true,
  createdAt: true,
} as const;

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    emailVerified: row.emailVerifiedAt !== null,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export async function register(input: RegisterInput, clock: Clock): Promise<RegisteredUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing !== null) throw conflict('An account with this email already exists.');

  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          phone: input.phone ?? null,
          role: UserRole.DONOR,
        },
        select: { id: true, email: true, emailVerifiedAt: true },
      });

      const token = generateOpaqueToken();
      await tx.authToken.create({
        data: {
          userId: user.id,
          type: AuthTokenType.VERIFY_EMAIL,
          tokenHash: hashToken(token),
          expiresAt: new Date(clock.now().getTime() + VERIFY_TOKEN_TTL_MS),
        },
      });

      await tx.emailNotification.create({
        data: {
          type: NotificationType.DONOR_VERIFY_EMAIL,
          toEmail: user.email,
          subject: 'Confirm your Agapay email address',
          templateData: { name: input.name, token },
          dedupeKey: `verify-email:${user.id}:${token.slice(0, 12)}`,
        },
      });

      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
      };
    }, txOptions);
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw conflict('An account with this email already exists.');
    }
    throw err;
  }
}

async function queueEmailVerification(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; name: string },
  token: string,
  now: Date,
): Promise<void> {
  // Serialize resends with manual verification so an old read cannot queue a
  // fresh verification link after an administrator has verified the account.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  const current = await tx.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });
  if (current === null || current.emailVerifiedAt !== null) return;
  await tx.authToken.create({
    data: {
      userId: user.id,
      type: AuthTokenType.VERIFY_EMAIL,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + VERIFY_TOKEN_TTL_MS),
    },
  });
  await tx.emailNotification.create({
    data: {
      type: NotificationType.DONOR_VERIFY_EMAIL,
      toEmail: user.email,
      subject: 'Confirm your Agapay email address',
      templateData: { name: user.name, token },
      dedupeKey: `verify-email:${user.id}:${token.slice(0, 12)}`,
    },
  });
}

export async function verifyEmail(rawToken: string, clock: Clock): Promise<void> {
  const now = clock.now();
  const token = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });

  if (token === null || token.type !== AuthTokenType.VERIFY_EMAIL) {
    throw unauthenticated('This confirmation link is not valid.');
  }
  if (token.usedAt !== null) throw conflict('This link has already been used.');
  if (token.expiresAt <= now) throw conflict('This link has expired. Request a new one.');

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      // Use the same user-before-token order as manual verification and resends.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${token.userId} FOR UPDATE`;
      const claimed = await tx.authToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw conflict('This link has already been used.');
      const changed = await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      if (changed.count === 1) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: token.userId },
          select: { role: true },
        });
        await writeAudit(
          tx,
          { userId: token.userId, role: user.role },
          {
            action: 'user.email.verify.link',
            entityType: 'User',
            entityId: token.userId,
          },
        );
      }
      await tx.authToken.updateMany({
        where: { userId: token.userId, type: AuthTokenType.VERIFY_EMAIL, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailNotification.updateMany({
        where: {
          type: NotificationType.DONOR_VERIFY_EMAIL,
          status: 'QUEUED',
          dedupeKey: { startsWith: `verify-email:${token.userId}:` },
        },
        data: { status: 'SUPPRESSED' },
      });
    }, txOptions),
  );
}

export async function resendVerification(email: string, clock: Clock): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });
  if (user === null || user.emailVerifiedAt !== null) return;

  const token = generateOpaqueToken();
  await prisma.$transaction(
    async (tx) => queueEmailVerification(tx, user, token, clock.now()),
    txOptions,
  );
}

export async function login(
  input: LoginInput,
  meta: RequestMeta,
  clock: Clock,
): Promise<AuthResult> {
  const now = clock.now();
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });

  if (user === null) {
    await spendPasswordTime();
    throw unauthenticated(GENERIC_LOGIN_FAILURE);
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw unauthenticated(GENERIC_LOGIN_FAILURE);
  }
  if (!user.isActive) throw unauthenticated('This account is no longer active.');

  const refreshToken = generateOpaqueToken();

  const accessToken = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          userAgent: meta.userAgent ?? null,
          ipHash: hashIp(meta.ip) ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      return signAccessToken(user, clock);
    }, txOptions),
  );

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    user: toAuthUser(user),
  };
}

export async function refresh(
  rawToken: string,
  meta: RequestMeta,
  clock: Clock,
): Promise<AuthResult> {
  const now = clock.now();
  const rotated = await prisma.$transaction(async (tx) => {
    // ponytail: this global lock serializes refresh with personnel changes; use ordered per-user locks if refresh throughput becomes a bottleneck.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(52501)`;
    const existing = await tx.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      select: { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true },
    });

    if (existing === null || existing.expiresAt <= now)
      return { kind: 'error' as const, message: SESSION_EXPIRED };

    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      await tx.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      logger.warn({ userId: existing.userId }, 'refresh token reuse detected; family revoked');
      // Commit family revocation before reporting failure; throwing here would roll it back.
      return { kind: 'error' as const, message: SESSION_EXPIRED };
    }

    const user = await tx.user.findUnique({ where: { id: existing.userId }, select: userSelect });
    if (user === null) return { kind: 'error' as const, message: SESSION_EXPIRED };
    if (!user.isActive)
      return { kind: 'error' as const, message: 'This account is no longer active.' };

    const refreshToken = generateOpaqueToken();
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId: existing.familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        userAgent: meta.userAgent ?? null,
        ipHash: hashIp(meta.ip) ?? null,
      },
    });
    return { kind: 'rotated' as const, user, refreshToken };
  }, txOptions);
  if (rotated.kind === 'error') throw unauthenticated(rotated.message);
  const { user, refreshToken } = rotated;

  return {
    accessToken: await signAccessToken(user, clock),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    user: toAuthUser(user),
  };
}

export async function logout(rawToken: string, clock: Clock): Promise<void> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: { familyId: true },
  });
  if (existing === null) return;

  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

export async function forgotPassword(email: string, clock: Clock): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isActive: true },
  });
  if (user === null || !user.isActive) return;

  const token = generateOpaqueToken();
  const now = clock.now();

  await prisma.$transaction(async (tx) => {
    await tx.authToken.create({
      data: {
        userId: user.id,
        type: AuthTokenType.RESET_PASSWORD,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    });
    await tx.emailNotification.create({
      data: {
        type: NotificationType.DONOR_PASSWORD_RESET,
        toEmail: user.email,
        subject: 'Reset your Agapay password',
        templateData: { name: user.name, token },
        dedupeKey: `reset-password:${user.id}:${token.slice(0, 12)}`,
      },
    });
  }, txOptions);
}

export async function resetPassword(input: ResetPasswordInput, clock: Clock): Promise<void> {
  const now = clock.now();
  const token = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });

  if (token === null || token.type !== AuthTokenType.RESET_PASSWORD) {
    throw unauthenticated('This reset link is not valid.');
  }
  if (token.usedAt !== null) throw conflict('This link has already been used.');
  if (token.expiresAt <= now) throw conflict('This link has expired. Request a new one.');

  const passwordHash = await hashPassword(input.password);

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw conflict('This link has already been used.');

      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      const verified = await tx.user.updateMany({
        where: {
          id: token.userId,
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] },
          emailVerifiedAt: null,
        },
        data: { emailVerifiedAt: now },
      });
      if (verified.count === 1) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: token.userId },
          select: { role: true },
        });
        await writeAudit(
          tx,
          { userId: token.userId, role: user.role },
          {
            action: 'user.invitation.accept',
            entityType: 'User',
            entityId: token.userId,
          },
        );
      }
      await tx.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    }, txOptions),
  );
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  clock: Clock,
): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (row === null || !(await verifyPassword(row.passwordHash, input.currentPassword))) {
    throw unauthenticated('Your current password is incorrect.');
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = clock.now();

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    }, txOptions),
  );
}

export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (user === null) throw unauthenticated();
  return toAuthUser(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name, phone: input.phone ?? null },
    select: userSelect,
  });
  return toAuthUser(user);
}
