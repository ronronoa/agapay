import { lockCampaign } from '../campaigns/campaigns.service.js';
import type {
  CalendarEventDto,
  CalendarEventListQuery,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from '@agapay/shared';
import type { AuthContext } from '../../types/express.js';
import { prisma, txOptions } from '../../lib/prisma.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import { env } from '../../lib/env.js';
import { businessRuleViolation, conflict, notFound } from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';
import { releaseStock } from '../inventory/inventory.service.js';
import { lockEvents, queueSchedule } from './scheduling.js';

const include = {
  campaign: { select: { name: true } },
  distributions: { select: { status: true } },
  donations: { where: { status: 'SCHEDULED' as const }, select: { id: true } },
} as const;
type EventRow = NonNullable<Awaited<ReturnType<typeof find>>>;
function find(id: string) {
  return prisma.calendarEvent.findUnique({ where: { id }, include });
}
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
    revision: row.revision,
    occupied: row.distributions.filter(
      (d) => d.status === 'SCHEDULED' || d.status === 'DISTRIBUTED',
    ).length,
    outstandingDistributions: row.distributions.filter((d) => d.status === 'SCHEDULED').length,
    outstandingCollections: row.donations.length,
    syncEnabled: env.GOOGLE_CALENDAR_ENABLED,
  };
}
export async function detail(id: string): Promise<CalendarEventDto> {
  const row = await find(id);
  if (!row) throw notFound('Calendar event');
  return toDto(row);
}
export async function list(query: CalendarEventListQuery) {
  const where = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from ? { endAt: { gt: query.from } } : {}),
    ...(query.to ? { startAt: { lt: query.to } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      include,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.calendarEvent.count({ where }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}
export async function create(
  input: CreateCalendarEventInput,
  actor: AuthContext,
): Promise<CalendarEventDto> {
  if (input.type !== 'DISTRIBUTION' && input.capacity != null)
    throw businessRuleViolation('Capacity is only available for distribution events.');
  const id = await prisma.$transaction(async (tx) => {
    const campaign = await lockCampaign(tx, input.campaignId);
    if (campaign.status !== 'ACTIVE' && campaign.status !== 'DRAFT')
      throw businessRuleViolation('Closed campaigns cannot have new events.');
    const event = await tx.calendarEvent.create({
      data: {
        ...input,
        description: input.description ?? null,
        capacity: input.capacity ?? null,
        createdById: actor.userId,
      },
    });
    await writeAudit(tx, actor, {
      action: 'calendar.create',
      entityType: 'CalendarEvent',
      entityId: event.id,
      metadata: { type: input.type },
    });
    return event.id;
  }, txOptions);
  return detail(id);
}
export async function update(
  id: string,
  input: UpdateCalendarEventInput,
  actor: AuthContext,
  clock: Clock = systemClock,
): Promise<CalendarEventDto> {
  await prisma.$transaction(async (tx) => {
    await lockEvents(tx, [id]);
    const old = await tx.calendarEvent.findUnique({ where: { id } });
    if (!old) throw notFound('Calendar event');
    if (old.revision !== input.revision)
      throw conflict('This event changed. Refresh and review its assignments.');
    if (old.status !== 'SCHEDULED') throw conflict('Only scheduled events can be edited.');
    if ((input.endAt ?? old.endAt) <= (input.startAt ?? old.startAt))
      throw businessRuleViolation('End time must be after start time.');
    if (input.capacity != null) {
      if (old.type !== 'DISTRIBUTION')
        throw businessRuleViolation('Only distribution events have capacity.');
      const count = await tx.distribution.count({
        where: { calendarEventId: id, status: { in: ['SCHEDULED', 'DISTRIBUTED'] } },
      });
      if (input.capacity < count) throw conflict('Capacity cannot be lower than occupied slots.');
    }
    const { revision } = input;
    await tx.calendarEvent.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
        ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
        revision: revision + 1,
        syncStatus: 'NOT_SYNCED',
        syncAttempts: 0,
        syncNextAt: clock.now(),
      },
    });
    const changed =
      (input.startAt !== undefined && +input.startAt !== +old.startAt) ||
      (input.endAt !== undefined && +input.endAt !== +old.endAt) ||
      (input.location !== undefined && input.location !== old.location);
    if (changed) {
      const distributions = await tx.distribution.findMany({
        where: { calendarEventId: id, status: 'SCHEDULED' },
      });
      for (const d of distributions) {
        await tx.distribution.update({
          where: { id: d.id },
          data: { scheduleRevision: { increment: 1 } },
        });
        await queueSchedule(tx, 'distribution', d.id, 'schedule', clock);
      }
      const donations = await tx.donation.findMany({
        where: { collectionEventId: id, status: 'SCHEDULED' },
      });
      for (const d of donations) {
        await tx.donation.update({
          where: { id: d.id },
          data: { scheduleRevision: { increment: 1 } },
        });
        await queueSchedule(tx, 'collection', d.id, 'schedule', clock);
      }
    }
    await writeAudit(tx, actor, {
      action: 'calendar.update',
      entityType: 'CalendarEvent',
      entityId: id,
      metadata: { revision: revision + 1 },
    });
  }, txOptions);
  return detail(id);
}
export async function cancel(
  id: string,
  actor: AuthContext,
  revision: number,
  clock: Clock = systemClock,
): Promise<CalendarEventDto> {
  await prisma.$transaction(async (tx) => {
    await lockEvents(tx, [id]);
    const event = await tx.calendarEvent.findUnique({ where: { id } });
    if (!event) throw notFound('Calendar event');
    if (event.revision !== revision || event.status !== 'SCHEDULED')
      throw conflict('This event changed. Refresh before cancelling.');
    const distributions = await tx.distribution.findMany({
      where: { calendarEventId: id, status: 'SCHEDULED' },
      include: { items: true },
    });
    for (const d of distributions) {
      await tx.distribution.update({
        where: { id: d.id },
        data: { status: 'CANCELLED', scheduleRevision: { increment: 1 } },
      });
      for (const item of d.items)
        await releaseStock(tx, {
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          distributionItemId: item.id,
          actorId: actor.userId,
        });
      await tx.assistanceRequest.updateMany({
        where: { id: d.requestId, status: 'SCHEDULED' },
        data: { status: 'APPROVED' },
      });
      await queueSchedule(tx, 'distribution', d.id, 'cancel', clock);
    }
    const donations = await tx.donation.findMany({
      where: { collectionEventId: id, status: 'SCHEDULED' },
    });
    for (const d of donations) {
      await tx.donation.update({
        where: { id: d.id },
        data: { scheduleRevision: { increment: 1 } },
      });
      await queueSchedule(tx, 'collection', d.id, 'cancel', clock);
      await tx.donation.update({
        where: { id: d.id },
        data: { status: 'VERIFIED', collectionEventId: null },
      });
    }
    await tx.calendarEvent.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        revision: { increment: 1 },
        syncStatus: 'NOT_SYNCED',
        syncAttempts: 0,
        syncNextAt: clock.now(),
      },
    });
    await writeAudit(tx, actor, {
      action: 'calendar.cancel',
      entityType: 'CalendarEvent',
      entityId: id,
      metadata: { distributions: distributions.length, collections: donations.length },
    });
  }, txOptions);
  return detail(id);
}
export async function complete(
  id: string,
  revision: number,
  actor: AuthContext,
  clock: Clock = systemClock,
): Promise<CalendarEventDto> {
  await prisma.$transaction(async (tx) => {
    await lockEvents(tx, [id]);
    const e = await tx.calendarEvent.findUnique({ where: { id } });
    if (!e) throw notFound('Calendar event');
    if (e.revision !== revision || e.status !== 'SCHEDULED')
      throw conflict('This event changed. Refresh before closing.');
    if (e.endAt > clock.now()) throw businessRuleViolation('Wait until the event has ended.');
    const outstanding =
      (await tx.distribution.count({ where: { calendarEventId: id, status: 'SCHEDULED' } })) +
      (await tx.donation.count({ where: { collectionEventId: id, status: 'SCHEDULED' } }));
    if (outstanding)
      throw businessRuleViolation('Resolve every scheduled assignment before closing this event.');
    await tx.calendarEvent.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        revision: { increment: 1 },
        syncStatus: 'NOT_SYNCED',
        syncAttempts: 0,
        syncNextAt: clock.now(),
      },
    });
    await writeAudit(tx, actor, {
      action: 'calendar.complete',
      entityType: 'CalendarEvent',
      entityId: id,
      metadata: {},
    });
  }, txOptions);
  return detail(id);
}
export async function resync(id: string): Promise<CalendarEventDto> {
  if (!env.GOOGLE_CALENDAR_ENABLED) throw businessRuleViolation('Google sync is disabled.');
  await prisma.calendarEvent.update({
    where: { id },
    data: { syncStatus: 'NOT_SYNCED', syncAttempts: 0, syncNextAt: systemClock.now() },
  });
  return detail(id);
}
