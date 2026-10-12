import { CalendarEventStatus, NotificationType, RequestStatus } from '@agapay/shared';
import type { AuthContext } from '../../types/express.js';
import type {
  CalendarEventDto,
  CalendarEventListQuery,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { businessRuleViolation, invalidTransition, notFound } from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';
import { releaseStock } from '../inventory/inventory.service.js';

type EventRow = {
  id: string;
  type: CalendarEventDto['type'];
  status: CalendarEventDto['status'];
  title: string;
  description: string | null;
  campaignId: string;
  startAt: Date;
  endAt: Date;
  location: string;
  capacity: number | null;
  syncStatus: CalendarEventDto['syncStatus'];
  externalEventId: string | null;
  createdAt: Date;
  campaign: { name: string };
};

function toDto(row: EventRow): CalendarEventDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    description: row.description,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    location: row.location,
    capacity: row.capacity,
    syncStatus: row.syncStatus,
    externalEventId: row.externalEventId,
    createdAt: row.createdAt.toISOString(),
  };
}

function flatten(row: {
  id: string;
  type: CalendarEventDto['type'];
  status: CalendarEventDto['status'];
  title: string;
  description: string | null;
  campaignId: string;
  startAt: Date;
  endAt: Date;
  location: string;
  capacity: number | null;
  syncStatus: CalendarEventDto['syncStatus'];
  externalEventId: string | null;
  createdAt: Date;
  campaign: { name: string };
}): EventRow {
  return row;
}

const eventInclude = {
  campaign: { select: { name: true } },
} as const;

async function getDto(id: string): Promise<CalendarEventDto> {
  const row = await prisma.calendarEvent.findUnique({ where: { id }, include: eventInclude });
  if (row === null) throw notFound('Calendar event');
  return toDto(flatten(row));
}

export async function create(
  input: CreateCalendarEventInput,
  actor: AuthContext,
): Promise<CalendarEventDto> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true },
  });
  if (campaign === null) throw notFound('Campaign');

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.calendarEvent.create({
      data: {
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        campaignId: input.campaignId,
        startAt: input.startAt,
        endAt: input.endAt,
        location: input.location,
        capacity: input.capacity ?? null,
        status: CalendarEventStatus.SCHEDULED,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await writeAudit(tx, actor, {
      action: 'calendar.create',
      entityType: 'CalendarEvent',
      entityId: created.id,
      metadata: { type: input.type, campaignId: input.campaignId },
    });
    return created.id;
  }, txOptions);

  return getDto(id);
}

export async function list(query: CalendarEventListQuery): Promise<{
  items: CalendarEventDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          startAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
  };
  const [rows, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      include: eventInclude,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.calendarEvent.count({ where }),
  ]);
  return {
    items: rows.map((row) => toDto(flatten(row))),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function detail(id: string): Promise<CalendarEventDto> {
  return getDto(id);
}

export async function update(
  id: string,
  input: UpdateCalendarEventInput,
  actor: AuthContext,
): Promise<CalendarEventDto> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { status: true, startAt: true, endAt: true },
  });
  if (existing === null) throw notFound('Calendar event');
  if (existing.status !== CalendarEventStatus.SCHEDULED) {
    throw invalidTransition(existing.status, CalendarEventStatus.SCHEDULED);
  }
  const nextStart = input.startAt ?? existing.startAt;
  const nextEnd = input.endAt ?? existing.endAt;
  if (nextEnd <= nextStart) throw businessRuleViolation('endAt must be after startAt.');

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.calendarEvent.update({
        where: { id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
          ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
          ...(input.location === undefined ? {} : { location: input.location }),
          ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
        },
      });
      await writeAudit(tx, actor, {
        action: 'calendar.update',
        entityType: 'CalendarEvent',
        entityId: id,
        metadata: {},
      });
    }, txOptions),
  );

  return getDto(id);
}

export async function cancel(id: string, actor: AuthContext): Promise<CalendarEventDto> {
  const existing = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { status: true },
  });
  if (existing === null) throw notFound('Calendar event');
  if (existing.status !== CalendarEventStatus.SCHEDULED) {
    throw invalidTransition(existing.status, CalendarEventStatus.CANCELLED);
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const live = await tx.distribution.findMany({
        where: { calendarEventId: id, status: 'SCHEDULED' },
        include: {
          items: true,
          request: { select: { id: true, fullName: true, email: true } },
        },
      });
      const event = await tx.calendarEvent.findUniqueOrThrow({
        where: { id },
        select: { location: true, startAt: true },
      });
      let released = 0;
      for (const dist of live) {
        const claimed = await tx.distribution.updateMany({
          where: { id: dist.id, status: 'SCHEDULED' },
          data: { status: 'CANCELLED' },
        });
        if (claimed.count === 0) continue;
        for (const item of dist.items) {
          await releaseStock(tx, {
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            distributionItemId: item.id,
            actorId: actor.userId,
          });
        }
        const current = await tx.assistanceRequest.findUniqueOrThrow({
          where: { id: dist.requestId },
          select: { status: true },
        });
        if (current.status !== RequestStatus.SCHEDULED) {
          throw invalidTransition(current.status, RequestStatus.APPROVED);
        }
        await tx.assistanceRequest.update({
          where: { id: dist.requestId },
          data: { status: RequestStatus.APPROVED },
        });
        await tx.emailNotification.create({
          data: {
            type: NotificationType.DISTRIBUTION_CANCELLED,
            toEmail: dist.request.email,
            subject: 'Your distribution schedule was cancelled',
            templateData: {
              name: dist.request.fullName,
              location: event.location,
              startAt: event.startAt.toISOString(),
            },
            priority: 1,
            relatedRequestId: dist.requestId,
            dedupeKey: `distribution-cancelled:${dist.id}`,
          },
        });
        await writeAudit(tx, actor, {
          action: 'distribution.cancel',
          entityType: 'Distribution',
          entityId: dist.id,
          metadata: { reason: 'event cancelled' },
        });
        released += 1;
      }
      await tx.calendarEvent.update({
        where: { id },
        data: { status: CalendarEventStatus.CANCELLED },
      });
      await writeAudit(tx, actor, {
        action: 'calendar.cancel',
        entityType: 'CalendarEvent',
        entityId: id,
        metadata: { releasedDistributions: released },
      });
    }, txOptions),
  );

  return getDto(id);
}

export async function resync(id: string): Promise<CalendarEventDto> {
  return getDto(id);
}
