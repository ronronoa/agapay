import { randomBytes } from 'node:crypto';
import {
  AuthTokenType,
  NotificationType,
  UserRole,
  type UserRole as UserRoleType,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { businessRuleViolation, conflict, notFound } from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { generateOpaqueToken, hashPassword, hashToken } from '../auth/password.js';
import { write as writeAudit } from '../audit/audit.service.js';
import type { AuthContext } from '../../types/express.js';
import type { CreateUserInput, UpdateUserInput, UserListQuery } from '@agapay/shared';
import { RESET_TOKEN_TTL_MS } from '../auth/auth.config.js';

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
): Promise<UserListRow> {
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
      return toDto(row);
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
  const target = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (target === null) throw notFound('User');

  // api.md section 13: an admin cannot demote or disable themselves. Without
  // this, the last admin can lock every admin account out of the system.
  const demotesSelf = input.role !== undefined && input.role !== target.role;
  const disablesSelf = input.isActive === false && target.isActive;
  if (actor.userId === id && (demotesSelf || disablesSelf)) {
    throw businessRuleViolation('You cannot change your own role or disable your own account.');
  }

  if (input.isActive === false) {
    const wouldOrphan = await countOtherActiveAdmins(id);
    if (wouldOrphan === 0) {
      throw businessRuleViolation('At least one active admin account must remain.');
    }
  }

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
        },
        select: userSelect,
      });

      if (input.isActive === false) {
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
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
      });

      return toDto(updated);
    }, txOptions),
  );
}

async function countOtherActiveAdmins(excludeId: string): Promise<number> {
  return prisma.user.count({
    where: { role: UserRole.ADMIN, isActive: true, id: { not: excludeId } },
  });
}
