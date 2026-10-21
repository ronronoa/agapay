import { get as getSettings } from '../settings/settings.service.js';
import type { ItemCategory } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { conflict, notFound } from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';
import type { AuthContext } from '../../types/express.js';
import type {
  CreateItemTypeInput,
  ItemTypeDto,
  ItemTypeListQuery,
  UpdateItemTypeInput,
} from '@agapay/shared';

const itemTypeSelect = {
  id: true,
  name: true,
  category: true,
  unit: true,
  lowStockThreshold: true,
  maxPerRequest: true,
  perHouseholdMember: true,
  isActive: true,
  createdAt: true,
} as const;

type ItemRow = {
  id: string;
  name: string;
  category: ItemCategory;
  unit: string;
  lowStockThreshold: number;
  maxPerRequest: number | null;
  perHouseholdMember: number | null;
  isActive: boolean;
  createdAt: Date;
};

function toDto(row: ItemRow): ItemTypeDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export async function list(query: ItemTypeListQuery): Promise<{
  items: ItemTypeDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.category === undefined ? {} : { category: query.category }),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.q === undefined
      ? {}
      : {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { unit: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }),
  };

  const [rows, total] = await Promise.all([
    prisma.itemType.findMany({
      where,
      select: itemTypeSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.itemType.count({ where }),
  ]);

  return {
    items: rows.map(toDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function create(input: CreateItemTypeInput, actor: AuthContext): Promise<ItemTypeDto> {
  const lowStockThreshold = input.lowStockThreshold ?? (await getSettings()).lowStockDefault;
  const existing = await prisma.itemType.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  if (existing !== null) throw conflict('An item type with this name already exists.');

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.itemType.create({
        data: {
          name: input.name,
          category: input.category,
          unit: input.unit,
          lowStockThreshold,
          maxPerRequest: input.maxPerRequest ?? null,
          perHouseholdMember: input.perHouseholdMember ?? null,
        },
        select: itemTypeSelect,
      });
      await writeAudit(tx, actor, {
        action: 'itemType.create',
        entityType: 'ItemType',
        entityId: created.id,
        metadata: { name: created.name },
      });
      return toDto(created);
    }, txOptions);
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw conflict('An item type with this name already exists.');
    }
    throw err;
  }
}

export async function update(
  id: string,
  input: UpdateItemTypeInput,
  actor: AuthContext,
): Promise<ItemTypeDto> {
  const existing = await prisma.itemType.findUnique({ where: { id }, select: { id: true } });
  if (existing === null) throw notFound('Item type');

  try {
    return await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const updated = await tx.itemType.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.category === undefined ? {} : { category: input.category }),
            ...(input.unit === undefined ? {} : { unit: input.unit }),
            ...(input.lowStockThreshold === undefined
              ? {}
              : { lowStockThreshold: input.lowStockThreshold }),
            ...(input.maxPerRequest === undefined ? {} : { maxPerRequest: input.maxPerRequest }),
            ...(input.perHouseholdMember === undefined
              ? {}
              : { perHouseholdMember: input.perHouseholdMember }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
          select: itemTypeSelect,
        });
        await writeAudit(tx, actor, {
          action: input.isActive === undefined ? 'itemType.update' : 'itemType.archive',
          entityType: 'ItemType',
          entityId: id,
          metadata: { ...(input.isActive === undefined ? {} : { isActive: input.isActive }) },
        });
        return toDto(updated);
      }, txOptions),
    );
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw conflict('An item type with this name already exists.');
    }
    throw err;
  }
}
