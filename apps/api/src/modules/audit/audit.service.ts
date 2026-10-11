import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthContext } from '../../types/express.js';
import type { AuditListQuery, AuditLogDto } from '@agapay/shared';
import { prisma } from '../../lib/prisma.js';

export interface AuditWriteInput {
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function write(
  tx: Tx,
  actor: AuthContext | undefined,
  input: AuditWriteInput,
  ipHash?: string,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor?.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ipHash: ipHash ?? null,
    },
  });
}

interface Cursor {
  createdAt: Date;
  id: string;
}

function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (raw === undefined) return undefined;
  const separator = raw.indexOf('|');
  if (separator === -1) return undefined;
  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || id.length === 0) return undefined;
  return { createdAt, id };
}

export function encodeCursor(row: { id: string; createdAt: Date }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

export async function list(query: AuditListQuery): Promise<{
  items: AuditLogDto[];
  nextCursor: string | null;
}> {
  const cursor = decodeCursor(query.cursor);
  const where = {
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          createdAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
    ...(cursor === undefined
      ? {}
      : {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
  };

  // DB-19: audit grows without bound, so keyset rather than offset. The extra
  // row is how we know another page exists without a second count query.
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      actorId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      actorName: row.actor?.name ?? null,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
  };
}
