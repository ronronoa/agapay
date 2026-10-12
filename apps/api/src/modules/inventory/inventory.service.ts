import { MovementType } from '@agapay/shared';
import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../../types/express.js';
import type {
  InventoryAdjustInput,
  InventoryDto,
  InventoryListQuery,
  InventoryMovementDto,
  InventoryTransferInput,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { businessRuleViolation, forbidden, notFound } from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

interface StockRow {
  id: string;
  itemTypeId: string;
  campaignId: string;
  itemTypeName: string;
  unit: string;
  lowStockThreshold: number;
  campaignName: string;
  available: number;
  reserved: number;
  distributed: number;
  updatedAt: Date;
}

function toDto(row: StockRow): InventoryDto {
  const total = row.available + row.reserved + row.distributed;
  return {
    id: row.id,
    itemTypeId: row.itemTypeId,
    itemTypeName: row.itemTypeName,
    unit: row.unit,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    available: row.available,
    reserved: row.reserved,
    distributed: row.distributed,
    total,
    lowStockThreshold: row.lowStockThreshold,
    lowStock: row.available <= row.lowStockThreshold,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const stockInclude = {
  itemType: { select: { name: true, unit: true, lowStockThreshold: true } },
  campaign: { select: { name: true } },
} as const;

function flatten(row: {
  id: string;
  itemTypeId: string;
  campaignId: string;
  available: number;
  reserved: number;
  distributed: number;
  updatedAt: Date;
  itemType: { name: string; unit: string; lowStockThreshold: number };
  campaign: { name: string };
}): StockRow {
  return {
    id: row.id,
    itemTypeId: row.itemTypeId,
    campaignId: row.campaignId,
    itemTypeName: row.itemType.name,
    unit: row.itemType.unit,
    lowStockThreshold: row.itemType.lowStockThreshold,
    campaignName: row.campaign.name,
    available: row.available,
    reserved: row.reserved,
    distributed: row.distributed,
    updatedAt: row.updatedAt,
  };
}

async function requireItemTypeAndCampaign(
  tx: Prisma.TransactionClient,
  itemTypeId: string,
  campaignId: string,
): Promise<void> {
  const [itemType, campaign] = await Promise.all([
    tx.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true } }),
    tx.campaign.findUnique({ where: { id: campaignId }, select: { id: true } }),
  ]);
  if (itemType === null) throw notFound('Item type');
  if (campaign === null) throw notFound('Campaign');
}

async function ensureRow(
  tx: Prisma.TransactionClient,
  itemTypeId: string,
  campaignId: string,
): Promise<{ id: string }> {
  try {
    return await tx.inventoryItem.upsert({
      where: { itemTypeId_campaignId: { itemTypeId, campaignId } },
      update: {},
      create: { itemTypeId, campaignId },
      select: { id: true },
    });
  } catch (err) {
    if (prismaErrorCode(err) !== 'P2002') throw err;
    return tx.inventoryItem.findUniqueOrThrow({
      where: { itemTypeId_campaignId: { itemTypeId, campaignId } },
      select: { id: true },
    });
  }
}

export interface DonationStockInput {
  itemTypeId: string;
  campaignId: string;
  quantity: number;
  donationItemId: string;
  actorId: string;
}

export async function addDonationStock(
  tx: Prisma.TransactionClient,
  input: DonationStockInput,
): Promise<void> {
  if (input.quantity === 0) return;
  if (input.quantity < 0) throw businessRuleViolation('Donation quantity cannot be negative.');

  const row = await ensureRow(tx, input.itemTypeId, input.campaignId);
  const updated = await tx.inventoryItem.update({
    where: { id: row.id },
    data: { available: { increment: input.quantity } },
    select: { available: true, reserved: true, distributed: true },
  });
  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: row.id,
      type: MovementType.DONATION_IN,
      quantity: input.quantity,
      availableAfter: updated.available,
      reservedAfter: updated.reserved,
      distributedAfter: updated.distributed,
      donationItemId: input.donationItemId,
      createdById: input.actorId,
    },
  });
}

export async function adjust(
  input: InventoryAdjustInput,
  actor: AuthContext,
): Promise<InventoryDto> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      await requireItemTypeAndCampaign(tx, input.itemTypeId, input.campaignId);
      const row = await ensureRow(tx, input.itemTypeId, input.campaignId);

      if (input.direction === 'IN') {
        await tx.inventoryItem.update({
          where: { id: row.id },
          data: { available: { increment: input.quantity } },
        });
      } else {
        const claimed = await tx.inventoryItem.updateMany({
          where: { id: row.id, available: { gte: input.quantity } },
          data: { available: { decrement: input.quantity } },
        });
        if (claimed.count === 0) {
          throw businessRuleViolation('Not enough available stock for this adjustment.', {
            details: { itemTypeId: input.itemTypeId, requested: input.quantity },
          });
        }
      }

      const after = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: row.id },
        include: stockInclude,
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: row.id,
          type: input.direction === 'IN' ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT,
          quantity: input.quantity,
          availableAfter: after.available,
          reservedAfter: after.reserved,
          distributedAfter: after.distributed,
          reason: input.reason,
          createdById: actor.userId,
        },
      });
      await writeAudit(tx, actor, {
        action: 'inventory.adjust',
        entityType: 'InventoryItem',
        entityId: row.id,
        metadata: { direction: input.direction, quantity: input.quantity },
      });
      return toDto(flatten(after));
    }, txOptions),
  );
}

export async function transfer(
  input: InventoryTransferInput,
  actor: AuthContext,
): Promise<{ from: InventoryDto; to: InventoryDto }> {
  if (actor.role !== 'ADMIN') throw forbidden();
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      await requireItemTypeAndCampaign(tx, input.itemTypeId, input.fromCampaignId);
      await requireItemTypeAndCampaign(tx, input.itemTypeId, input.toCampaignId);
      const from = await ensureRow(tx, input.itemTypeId, input.fromCampaignId);
      const to = await ensureRow(tx, input.itemTypeId, input.toCampaignId);

      const claimed = await tx.inventoryItem.updateMany({
        where: { id: from.id, available: { gte: input.quantity } },
        data: { available: { decrement: input.quantity } },
      });
      if (claimed.count === 0) {
        throw businessRuleViolation('Not enough available stock to transfer.');
      }
      const fromAfter = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: from.id },
        include: stockInclude,
      });
      const toAfter = await tx.inventoryItem.update({
        where: { id: to.id },
        data: { available: { increment: input.quantity } },
        include: stockInclude,
      });
      const movementReason = `Transfer: ${input.reason}`;
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: from.id,
          type: MovementType.ADJUSTMENT_OUT,
          quantity: input.quantity,
          availableAfter: fromAfter.available,
          reservedAfter: fromAfter.reserved,
          distributedAfter: fromAfter.distributed,
          reason: movementReason,
          createdById: actor.userId,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: to.id,
          type: MovementType.ADJUSTMENT_IN,
          quantity: input.quantity,
          availableAfter: toAfter.available,
          reservedAfter: toAfter.reserved,
          distributedAfter: toAfter.distributed,
          reason: movementReason,
          createdById: actor.userId,
        },
      });
      await writeAudit(tx, actor, {
        action: 'inventory.transfer',
        entityType: 'InventoryItem',
        entityId: from.id,
        metadata: {
          toInventoryItemId: to.id,
          itemTypeId: input.itemTypeId,
          quantity: input.quantity,
        },
      });
      return { from: toDto(flatten(fromAfter)), to: toDto(flatten(toAfter)) };
    }, txOptions),
  );
}

export async function list(query: InventoryListQuery): Promise<{
  items: InventoryDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
    ...(query.itemTypeId === undefined ? {} : { itemTypeId: query.itemTypeId }),
  };
  if (query.lowStock === true) {
    const rows = await prisma.inventoryItem.findMany({ where, include: stockInclude });
    const items = rows.map((row) => toDto(flatten(row))).filter((dto) => dto.lowStock);
    return {
      items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }
  const [rows, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: stockInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ]);
  return {
    items: rows.map((row) => toDto(flatten(row))),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getById(id: string): Promise<InventoryDto> {
  const row = await prisma.inventoryItem.findUnique({ where: { id }, include: stockInclude });
  if (row === null) throw notFound('Inventory item');
  return toDto(flatten(row));
}

export async function listMovements(
  id: string,
  page: number,
  pageSize: number,
): Promise<{ items: InventoryMovementDto[]; page: number; pageSize: number; total: number }> {
  const existing = await prisma.inventoryItem.findUnique({ where: { id }, select: { id: true } });
  if (existing === null) throw notFound('Inventory item');
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { inventoryItemId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryMovement.count({ where: { inventoryItemId: id } }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      quantity: row.quantity,
      availableAfter: row.availableAfter,
      reservedAfter: row.reservedAfter,
      distributedAfter: row.distributedAfter,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
}
