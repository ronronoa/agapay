import {
  DistributionStatus,
  NotificationType,
  RequestStatus,
  type DistributionStatus as DistributionStatusType,
} from '@agapay/shared';
import type { AuthContext } from '../../types/express.js';
import type { Prisma } from '@prisma/client';
import type {
  CompleteDistributionInput,
  CreateDistributionInput,
  DistributionDto,
  DistributionListQuery,
  UpdateDistributionInput,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import {
  AppError,
  businessRuleViolation,
  conflict,
  insufficientStock,
  invalidTransition,
  notFound,
} from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';
import {
  distributeStock,
  ensureRow,
  releaseStock,
  reserveStock,
} from '../inventory/inventory.service.js';

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

const detailInclude = {
  request: { select: { referenceNumber: true } },
  calendarEvent: { select: { title: true } },
  items: {
    include: {
      inventoryItem: { include: { itemType: { select: { name: true, unit: true } } } },
    },
    orderBy: { id: 'asc' as const },
  },
} as const;

type DetailRow = {
  id: string;
  status: DistributionStatusType;
  requestId: string;
  calendarEventId: string;
  receivedByName: string | null;
  notes: string | null;
  createdAt: Date;
  request: { referenceNumber: string };
  calendarEvent: { title: string };
  items: {
    id: string;
    quantity: number;
    inventoryItemId: string;
    inventoryItem: { itemTypeId: string; itemType: { name: string; unit: string } };
  }[];
};

function toDto(row: DetailRow): DistributionDto {
  return {
    id: row.id,
    status: row.status,
    requestId: row.requestId,
    requestReference: row.request.referenceNumber,
    calendarEventId: row.calendarEventId,
    eventTitle: row.calendarEvent.title,
    receivedByName: row.receivedByName,
    notes: row.notes,
    items: row.items.map((item) => ({
      id: item.id,
      itemTypeId: item.inventoryItem.itemTypeId,
      itemTypeName: item.inventoryItem.itemType.name,
      unit: item.inventoryItem.itemType.unit,
      quantity: item.quantity,
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

async function getDetail(id: string): Promise<DistributionDto> {
  const row = await prisma.distribution.findUnique({ where: { id }, include: detailInclude });
  if (row === null) throw notFound('Distribution');
  return toDto(row);
}

async function flipRequestTo(
  tx: Prisma.TransactionClient,
  requestId: string,
  to: typeof RequestStatus.APPROVED | typeof RequestStatus.DISTRIBUTED,
): Promise<void> {
  const claimed = await tx.assistanceRequest.updateMany({
    where: { id: requestId, status: RequestStatus.SCHEDULED },
    data: { status: to },
  });
  if (claimed.count === 0) throw invalidTransition(RequestStatus.SCHEDULED, to);
}

async function mailCancelled(
  tx: Prisma.TransactionClient,
  requestId: string,
  distributionId: string,
): Promise<void> {
  const row = await tx.assistanceRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { fullName: true, email: true },
  });
  const dist = await tx.distribution.findUniqueOrThrow({
    where: { id: distributionId },
    select: { calendarEvent: { select: { location: true, startAt: true } } },
  });
  await tx.emailNotification.create({
    data: {
      type: NotificationType.DISTRIBUTION_CANCELLED,
      toEmail: row.email,
      subject: 'Your distribution schedule was cancelled',
      templateData: {
        name: row.fullName,
        location: dist.calendarEvent.location,
        startAt: dist.calendarEvent.startAt.toISOString(),
      },
      priority: 1,
      relatedRequestId: requestId,
      dedupeKey: `distribution-cancelled:${distributionId}`,
    },
  });
}

export async function create(
  input: CreateDistributionInput,
  actor: AuthContext,
): Promise<DistributionDto> {
  const request = await prisma.assistanceRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, campaignId: true },
  });
  if (request === null) throw notFound('Assistance request');
  if (request.status !== RequestStatus.APPROVED) {
    throw invalidTransition(request.status, DistributionStatus.SCHEDULED);
  }
  const event = await prisma.calendarEvent.findUnique({
    where: { id: input.calendarEventId },
    select: { id: true, type: true, status: true, campaignId: true },
  });
  if (event === null) throw notFound('Calendar event');
  if (event.status !== 'SCHEDULED' || event.type !== 'DISTRIBUTION') {
    throw businessRuleViolation('Distributions need a scheduled distribution event.');
  }
  if (event.campaignId !== request.campaignId) {
    throw businessRuleViolation('The event and the request belong to different campaigns.');
  }

  try {
    const id = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.assistanceRequest.updateMany({
          where: { id: request.id, status: RequestStatus.APPROVED },
          data: { status: RequestStatus.SCHEDULED },
        });
        if (claimed.count === 0) {
          throw invalidTransition(RequestStatus.APPROVED, RequestStatus.SCHEDULED);
        }
        const created = await tx.distribution.create({
          data: {
            requestId: request.id,
            calendarEventId: event.id,
            status: DistributionStatus.SCHEDULED,
          },
          select: { id: true },
        });
        for (const item of input.items) {
          const stock = await ensureRow(tx, item.itemTypeId, request.campaignId);
          const distItem = await tx.distributionItem.create({
            data: {
              distributionId: created.id,
              inventoryItemId: stock.id,
              quantity: item.quantity,
            },
            select: { id: true },
          });
          try {
            await reserveStock(tx, {
              inventoryItemId: stock.id,
              quantity: item.quantity,
              distributionItemId: distItem.id,
              actorId: actor.userId,
            });
          } catch (err) {
            if (err instanceof AppError && err.code === 'BUSINESS_RULE_VIOLATION') {
              const current = await tx.inventoryItem.findUniqueOrThrow({
                where: { id: stock.id },
                select: { available: true },
              });
              throw insufficientStock(item.itemTypeId, item.quantity, current.available);
            }
            throw err;
          }
        }
        const fullEvent = await tx.calendarEvent.findUniqueOrThrow({
          where: { id: event.id },
          select: { location: true, startAt: true },
        });
        const beneficiary = await tx.assistanceRequest.findUniqueOrThrow({
          where: { id: request.id },
          select: { fullName: true, email: true },
        });
        await tx.emailNotification.create({
          data: {
            type: NotificationType.DISTRIBUTION_SCHEDULED,
            toEmail: beneficiary.email,
            subject: 'Your goods are ready for pickup',
            templateData: {
              name: beneficiary.fullName,
              location: fullEvent.location,
              startAt: fullEvent.startAt.toISOString(),
            },
            priority: 2,
            relatedRequestId: request.id,
            dedupeKey: `distribution-scheduled:${created.id}`,
          },
        });
        await writeAudit(tx, actor, {
          action: 'distribution.create',
          entityType: 'Distribution',
          entityId: created.id,
          metadata: { requestId: request.id, eventId: event.id, itemCount: input.items.length },
        });
        return created.id;
      }, txOptions),
    );
    return getDetail(id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (prismaErrorCode(err) === 'P2002') {
      throw conflict('This request already has a live distribution.');
    }
    if (prismaErrorCode(err) === 'P2003') throw notFound('Item type');
    throw err;
  }
}

export async function list(query: DistributionListQuery): Promise<{
  items: DistributionDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.eventId === undefined ? {} : { calendarEventId: query.eventId }),
    ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
    ...(query.campaignId === undefined ? {} : { request: { campaignId: query.campaignId } }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          // Dated on completion: a scheduled distribution has no distributedAt,
          // so a range only returns distributions that actually happened.
          distributedAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
  };
  const [rows, total] = await Promise.all([
    prisma.distribution.findMany({
      where,
      include: detailInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.distribution.count({ where }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function detail(id: string): Promise<DistributionDto> {
  return getDetail(id);
}

export async function update(
  id: string,
  input: UpdateDistributionInput,
  actor: AuthContext,
): Promise<DistributionDto> {
  const existing = await prisma.distribution.findUnique({
    where: { id },
    select: { status: true, requestId: true },
  });
  if (existing === null) throw notFound('Distribution');
  if (existing.status !== DistributionStatus.SCHEDULED) {
    throw invalidTransition(existing.status, DistributionStatus.SCHEDULED);
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      if (input.calendarEventId !== undefined) {
        const event = await tx.calendarEvent.findUnique({
          where: { id: input.calendarEventId },
          select: { type: true, status: true, campaignId: true },
        });
        if (event === null) throw notFound('Calendar event');
        const request = await tx.assistanceRequest.findUniqueOrThrow({
          where: { id: existing.requestId },
          select: { campaignId: true },
        });
        if (event.status !== 'SCHEDULED' || event.type !== 'DISTRIBUTION') {
          throw businessRuleViolation('Distributions need a scheduled distribution event.');
        }
        if (event.campaignId !== request.campaignId) {
          throw businessRuleViolation('The event and the request belong to different campaigns.');
        }
        await tx.distribution.update({
          where: { id },
          data: { calendarEventId: input.calendarEventId },
        });
      }
      if (input.items !== undefined) {
        const rows = await tx.distributionItem.findMany({
          where: { distributionId: id },
          select: {
            id: true,
            quantity: true,
            inventoryItemId: true,
            inventoryItem: { select: { itemTypeId: true } },
          },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const item of input.items) {
          const current = byId.get(item.distributionItemId);
          if (current === undefined) {
            throw businessRuleViolation('One or more items do not belong to this distribution.');
          }
          if (item.quantity > current.quantity) {
            const extra = item.quantity - current.quantity;
            try {
              await reserveStock(tx, {
                inventoryItemId: current.inventoryItemId,
                quantity: extra,
                distributionItemId: current.id,
                actorId: actor.userId,
              });
            } catch (err) {
              if (err instanceof AppError && err.code === 'BUSINESS_RULE_VIOLATION') {
                const available = await tx.inventoryItem.findUniqueOrThrow({
                  where: { id: current.inventoryItemId },
                  select: { available: true },
                });
                throw insufficientStock(
                  current.inventoryItem.itemTypeId,
                  extra,
                  available.available,
                );
              }
              throw err;
            }
          } else if (item.quantity < current.quantity) {
            await releaseStock(tx, {
              inventoryItemId: current.inventoryItemId,
              quantity: current.quantity - item.quantity,
              distributionItemId: current.id,
              actorId: actor.userId,
            });
          }
          await tx.distributionItem.update({
            where: { id: current.id },
            data: { quantity: item.quantity },
          });
        }
      }
      await writeAudit(tx, actor, {
        action: 'distribution.update',
        entityType: 'Distribution',
        entityId: id,
        metadata: {},
      });
    }, txOptions),
  );

  return getDetail(id);
}

export async function complete(
  id: string,
  input: CompleteDistributionInput,
  actor: AuthContext,
): Promise<DistributionDto> {
  const existing = await prisma.distribution.findUnique({
    where: { id },
    select: { status: true, requestId: true },
  });
  if (existing === null) throw notFound('Distribution');
  if (existing.status !== DistributionStatus.SCHEDULED) {
    throw invalidTransition(existing.status, DistributionStatus.DISTRIBUTED);
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.distributionItem.findMany({
        where: { distributionId: id },
        select: { id: true, quantity: true, inventoryItemId: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const item of input.items) {
        const planned = byId.get(item.distributionItemId);
        if (planned === undefined) {
          throw businessRuleViolation('One or more items do not belong to this distribution.');
        }
        if (item.quantity > planned.quantity) {
          throw businessRuleViolation('Cannot distribute more than was reserved.');
        }
        if (item.quantity < planned.quantity) {
          await releaseStock(tx, {
            inventoryItemId: planned.inventoryItemId,
            quantity: planned.quantity - item.quantity,
            distributionItemId: planned.id,
            actorId: actor.userId,
          });
        }
        if (item.quantity > 0) {
          await distributeStock(tx, {
            inventoryItemId: planned.inventoryItemId,
            quantity: item.quantity,
            distributionItemId: planned.id,
            actorId: actor.userId,
          });
        }
        await tx.distributionItem.update({
          where: { id: planned.id },
          data: { quantity: item.quantity },
        });
      }
      const claimedDist = await tx.distribution.updateMany({
        where: { id, status: DistributionStatus.SCHEDULED },
        data: {
          status: DistributionStatus.DISTRIBUTED,
          receivedByName: input.receivedByName,
          notes: input.notes ?? null,
        },
      });
      if (claimedDist.count === 0) {
        throw invalidTransition(DistributionStatus.SCHEDULED, DistributionStatus.DISTRIBUTED);
      }
      await flipRequestTo(tx, existing.requestId, RequestStatus.DISTRIBUTED);
      const request = await tx.assistanceRequest.findUniqueOrThrow({
        where: { id: existing.requestId },
        select: { fullName: true, email: true, trackingNumber: true },
      });
      await tx.emailNotification.create({
        data: {
          type: NotificationType.DISTRIBUTION_COMPLETED,
          toEmail: request.email,
          subject: 'Your goods were released',
          templateData: {
            name: request.fullName,
            trackingNumber: request.trackingNumber ?? '',
          },
          priority: 2,
          relatedRequestId: existing.requestId,
          dedupeKey: `distribution-completed:${id}`,
        },
      });
      await writeAudit(tx, actor, {
        action: 'distribution.complete',
        entityType: 'Distribution',
        entityId: id,
        metadata: { receivedByName: input.receivedByName },
      });
    }, txOptions),
  );

  return getDetail(id);
}

async function release(
  id: string,
  to: typeof DistributionStatus.NO_SHOW | typeof DistributionStatus.CANCELLED,
  actor: AuthContext,
  auditAction: string,
  mail: boolean,
): Promise<DistributionDto> {
  const existing = await prisma.distribution.findUnique({
    where: { id },
    select: { status: true, requestId: true },
  });
  if (existing === null) throw notFound('Distribution');
  if (existing.status !== DistributionStatus.SCHEDULED) {
    throw invalidTransition(existing.status, to);
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.distribution.updateMany({
        where: { id, status: DistributionStatus.SCHEDULED },
        data: { status: to },
      });
      if (claimed.count === 0) throw invalidTransition(DistributionStatus.SCHEDULED, to);
      const rows = await tx.distributionItem.findMany({
        where: { distributionId: id },
        select: { id: true, quantity: true, inventoryItemId: true },
      });
      for (const item of rows) {
        await releaseStock(tx, {
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          distributionItemId: item.id,
          actorId: actor.userId,
        });
      }
      await flipRequestTo(tx, existing.requestId, RequestStatus.APPROVED);
      if (mail) await mailCancelled(tx, existing.requestId, id);
      await writeAudit(tx, actor, {
        action: auditAction,
        entityType: 'Distribution',
        entityId: id,
        metadata: {},
      });
    }, txOptions),
  );

  return getDetail(id);
}

export async function noShow(id: string, actor: AuthContext): Promise<DistributionDto> {
  return release(id, DistributionStatus.NO_SHOW, actor, 'distribution.no-show', false);
}

export async function cancel(id: string, actor: AuthContext): Promise<DistributionDto> {
  return release(id, DistributionStatus.CANCELLED, actor, 'distribution.cancel', true);
}
