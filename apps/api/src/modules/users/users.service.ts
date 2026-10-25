import { randomBytes } from 'node:crypto';
import {
  AuthTokenType,
  NotificationType,
  UserRole,
  hasRole,
  type UserRole as UserRoleType,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { businessRuleViolation, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { Prisma } from '@prisma/client';
import type { Clock } from '../../lib/clock.js';
import { generateOpaqueToken, hashPassword, hashToken } from '../auth/password.js';
import { write as writeAudit } from '../audit/audit.service.js';
import type { AuthContext } from '../../types/express.js';
import type { CreateUserInput, UpdateUserInput, UserListQuery } from '@agapay/shared';
import { RESET_TOKEN_TTL_MS } from '../auth/auth.config.js';
import { env } from '../../lib/env.js';
import { RESET_PASSWORD_PATH } from '../notifications/templates/render.js';
import type { PersonnelInvitation } from '@agapay/shared';

function invitationDetails(token: string, now: Date): PersonnelInvitation {
  const url = new URL(RESET_PASSWORD_PATH, env.WEB_ORIGIN);
  url.searchParams.set('token', token);
  return {
    url: url.toString(),
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString(),
  };
}

async function requireManager(
  tx: Prisma.TransactionClient,
  actor: AuthContext,
  protectedAccount = false,
) {
  // The same lock covers bootstrap, invitations, Settings, and role changes.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(52501)`;
  const current = await tx.user.findUnique({
    where: { id: actor.userId },
    select: { role: true, isActive: true, sessionVersion: true },
  });
  if (
    !current?.isActive ||
    current.role !== actor.role ||
    (actor.sessionVersion !== undefined && current.sessionVersion !== actor.sessionVersion) ||
    !hasRole(current.role, ['ADMIN']) ||
    (protectedAccount && current.role !== UserRole.SUPER_ADMIN)
  )
    throw forbidden();
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  emailVerifiedAt: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export interface UserListRow {
  id: string;
  name: string;
  email: string;
  role: UserRoleType;
  phone: string | null;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toDto(row: {
  id: string;
  name: string;
  email: string;
  role: UserRoleType;
  phone: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserListRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    emailVerified: row.emailVerifiedAt !== null,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt === null ? null : row.lastLoginAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export async function list(query: UserListQuery): Promise<{
  items: UserListRow[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.role === undefined ? {} : { role: query.role }),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.q === undefined
      ? {}
      : {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function create(
  input: CreateUserInput,
  actor: AuthContext,
  clock: Clock,
): Promise<{ user: UserListRow; invitation: PersonnelInvitation }> {
  if (
    !hasRole(actor.role, ['ADMIN']) ||
    (input.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN)
  )
    throw forbidden();
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing !== null) throw conflict('A user with this email already exists.');

  const token = generateOpaqueToken();
  const now = clock.now();

  // No password is chosen here, so the account gets a hash of random bytes that
  // nobody holds. Hashed outside the transaction to keep it short (hard rule 4).
  const unusableHash = await hashPassword(randomBytes(32).toString('hex'));

  try {
    return await prisma.$transaction(async (tx) => {
      await requireManager(tx, actor, input.role === UserRole.SUPER_ADMIN);
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          phone: input.phone ?? null,
          passwordHash: unusableHash,
        },
        select: { id: true },
      });

      await tx.authToken.create({
        data: {
          userId: created.id,
          type: AuthTokenType.RESET_PASSWORD,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
        },
      });

      // Hard rule 6: the set-password mail is queued, never sent here.
      await tx.emailNotification.create({
        data: {
          type: NotificationType.DONOR_PASSWORD_RESET,
          toEmail: input.email,
          subject: 'Set your Agapay password',
          templateData: { name: input.name, token },
          priority: 1,
          dedupeKey: `set-password:${created.id}:${token.slice(0, 12)}`,
        },
      });

      await writeAudit(tx, actor, {
        action: 'user.create',
        entityType: 'User',
        entityId: created.id,
        metadata: { role: input.role },
      });

      const row = await tx.user.findUniqueOrThrow({
        where: { id: created.id },
        select: userSelect,
      });
      return { user: toDto(row), invitation: invitationDetails(token, now) };
    }, txOptions);
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw conflict('A user with this email already exists.');
    }
    throw err;
  }
}

export async function update(
  id: string,
  input: UpdateUserInput,
  actor: AuthContext,
  clock: Clock,
): Promise<UserListRow> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      // Serialize personnel changes so concurrent removals cannot lose the last admin.
      await requireManager(tx, actor);
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (target === null) throw notFound('User');
      if (
        (target.role === UserRole.SUPER_ADMIN || input.role === UserRole.SUPER_ADMIN) &&
        actor.role !== UserRole.SUPER_ADMIN
      )
        throw forbidden();

      // api.md section 13: an admin cannot demote or disable themselves. Without
      // this, the last admin can lock every admin account out of the system.
      const changesRole = input.role !== undefined && input.role !== target.role;
      const disablesSelf = input.isActive === false && target.isActive;
      if (actor.userId === id && (changesRole || disablesSelf)) {
        throw businessRuleViolation('You cannot change your own role or disable your own account.');
      }

      if (
        (target.role === UserRole.ADMIN || target.role === UserRole.SUPER_ADMIN) &&
        target.isActive &&
        (input.isActive === false || (input.role !== undefined && input.role !== target.role))
      ) {
        const wouldOrphan = await tx.user.count({
          where: {
            role:
              target.role === UserRole.SUPER_ADMIN
                ? UserRole.SUPER_ADMIN
                : { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
            isActive: true,
            id: { not: id },
          },
        });
        if (wouldOrphan === 0) {
          throw businessRuleViolation(
            target.role === UserRole.SUPER_ADMIN
              ? 'At least one active Super Admin account must remain.'
              : 'At least one active admin account must remain.',
          );
        }
      }

      const changed = await tx.user.updateMany({
        where: { id, role: target.role, isActive: target.isActive },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(changesRole || disablesSelf ? { sessionVersion: { increment: 1 } } : {}),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
        },
      });
      if (changed.count !== 1) throw conflict('Account changed. Reload before saving.');
      const updated = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });

      if (input.isActive === false || changesRole) {
        // Disabling must end live sessions immediately, not at token expiry.
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: clock.now() },
        });
      }

      await writeAudit(tx, actor, {
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        metadata: {
          ...(input.name === undefined ? {} : { nameChanged: true }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });

      return toDto(updated);
    }, txOptions),
  );
}

export async function verifyDonorEmail(
  id: string,
  actor: AuthContext,
  clock: Clock,
): Promise<UserListRow> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      await requireManager(tx, actor);
      const target = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (target === null) throw notFound('User');
      if (target.role !== UserRole.DONOR || !target.isActive)
        throw businessRuleViolation('Only active donor accounts can be verified here.');
      if (target.emailVerifiedAt !== null) return toDto(target);

      const now = clock.now();
      const changed = await tx.user.updateMany({
        where: { id, role: UserRole.DONOR, isActive: true, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      if (changed.count !== 1) throw conflict('Account changed. Reload before verifying.');
      await tx.authToken.updateMany({
        where: { userId: id, type: AuthTokenType.VERIFY_EMAIL, usedAt: null },
        data: { usedAt: now },
      });
      await tx.emailNotification.updateMany({
        where: {
          type: NotificationType.DONOR_VERIFY_EMAIL,
          status: 'QUEUED',
          dedupeKey: { startsWith: `verify-email:${id}:` },
        },
        data: { status: 'SUPPRESSED' },
      });
      await writeAudit(tx, actor, {
        action: 'user.email.verify',
        entityType: 'User',
        entityId: id,
        metadata: { method: 'manual' },
      });
      return toDto(await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect }));
    }, txOptions),
  );
}

export async function resendInvitation(
  id: string,
  actor: AuthContext,
  clock: Clock,
): Promise<PersonnelInvitation> {
  const now = clock.now();
  const token = generateOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await requireManager(tx, actor);
    const user = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (user === null) throw notFound('User');
    if (user.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN)
      throw forbidden();
    if (!user.isActive || user.role === UserRole.DONOR || user.lastLoginAt !== null) {
      throw businessRuleViolation('Only active personnel who have not signed in can be invited.');
    }
    const recent = await tx.authToken.findFirst({
      where: {
        userId: id,
        type: AuthTokenType.RESET_PASSWORD,
        usedAt: null,
        createdAt: { gt: new Date(now.getTime() - 60_000) },
      },
    });
    if (recent !== null) throw conflict('Wait one minute before resending an invitation.');
    await tx.authToken.updateMany({
      where: { userId: id, type: AuthTokenType.RESET_PASSWORD, usedAt: null },
      data: { usedAt: now },
    });
    await tx.emailNotification.updateMany({
      where: { status: 'QUEUED', dedupeKey: { startsWith: `set-password:${id}:` } },
      data: { status: 'SUPPRESSED' },
    });
    await tx.authToken.create({
      data: {
        userId: id,
        type: AuthTokenType.RESET_PASSWORD,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    });
    await tx.emailNotification.create({
      data: {
        type: NotificationType.DONOR_PASSWORD_RESET,
        toEmail: user.email,
        subject: 'Set your Agapay password',
        templateData: { name: user.name, token },
        priority: 1,
        dedupeKey: `set-password:${id}:${token.slice(0, 12)}`,
      },
    });
    await writeAudit(tx, actor, {
      action: 'user.invitation.resend',
      entityType: 'User',
      entityId: id,
    });
  }, txOptions);
  return invitationDetails(token, now);
}

// Owner-run bootstrap only; never exposed through an HTTP route or public registration.
export async function bootstrapSuperAdmin(id: string, clock: Clock): Promise<void> {
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(52501)`;
      if (await tx.user.count({ where: { role: UserRole.SUPER_ADMIN } }))
        throw conflict('Super Admin already exists. Use personnel management instead.');
      const target = await tx.user.findUnique({
        where: { id },
        select: { role: true, isActive: true },
      });
      if (!target?.isActive || target.role !== UserRole.ADMIN)
        throw businessRuleViolation('Select an existing active Admin account.');
      const changed = await tx.user.updateMany({
        where: { id, role: UserRole.ADMIN, isActive: true },
        data: { role: UserRole.SUPER_ADMIN, sessionVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw conflict('Account changed. Review it before retrying.');
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: clock.now() },
      });
      await writeAudit(
        tx,
        { userId: id, role: UserRole.ADMIN },
        {
          action: 'user.super_admin.bootstrap',
          entityType: 'User',
          entityId: id,
          metadata: { role: UserRole.SUPER_ADMIN },
        },
      );
    }, txOptions),
  );
}
