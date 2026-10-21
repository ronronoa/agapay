import type { Prisma } from '@prisma/client';
import { businessRuleViolation, conflict, notFound } from '../../lib/errors.js';
import { systemClock, type Clock } from '../../lib/clock.js';

export async function lockEvents(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "CalendarEvent" WHERE id = ${id} FOR UPDATE`;
  }
}

export async function requireEvent(
  tx: Prisma.TransactionClient,
  id: string,
  type: 'COLLECTION' | 'DISTRIBUTION',
  campaignId: string,
  clock: Clock = systemClock,
) {
  const event = await tx.calendarEvent.findUnique({ where: { id } });
  if (!event) throw notFound('Calendar event');
  if (event.status !== 'SCHEDULED' || event.type !== type || event.endAt <= clock.now()) {
    throw businessRuleViolation('Choose a scheduled event that has not ended.');
  }
  if (event.campaignId !== campaignId)
    throw businessRuleViolation('The event and assignment must belong to the same campaign.');
  return event;
}

export async function requireCapacity(
  tx: Prisma.TransactionClient,
  id: string,
  excludeId?: string,
): Promise<void> {
  const event = await tx.calendarEvent.findUniqueOrThrow({ where: { id } });
  if (event.capacity === null) return;
  const occupied = await tx.distribution.count({
    where: {
      calendarEventId: id,
      status: { in: ['SCHEDULED', 'DISTRIBUTED'] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (occupied >= event.capacity) throw conflict('This event has reached its capacity.');
}

export async function queueSchedule(
  tx: Prisma.TransactionClient,
  kind: 'distribution' | 'collection',
  id: string,
  mode: 'schedule' | 'cancel' | 'reminder',
  clock: Clock = systemClock,
): Promise<void> {
  const distribution =
    kind === 'distribution'
      ? await tx.distribution.findUniqueOrThrow({
          where: { id },
          include: { request: true, calendarEvent: true },
        })
      : null;
  const donation =
    kind === 'collection'
      ? await tx.donation.findUniqueOrThrow({
          where: { id },
          include: { donor: true, collectionEvent: true },
        })
      : null;
  const event = distribution?.calendarEvent ?? donation?.collectionEvent;
  if (!event) throw notFound('Calendar event');
  const revision = distribution?.scheduleRevision ?? donation?.scheduleRevision ?? 1;
  const name = distribution?.request.fullName ?? donation?.donor.name ?? '';
  const email = distribution?.request.email ?? donation?.donor.email ?? '';
  const type =
    mode === 'cancel' && kind === 'distribution'
      ? 'DISTRIBUTION_CANCELLED'
      : mode === 'reminder'
        ? kind === 'distribution'
          ? 'DISTRIBUTION_REMINDER'
          : 'COLLECTION_REMINDER'
        : kind === 'distribution'
          ? 'DISTRIBUTION_SCHEDULED'
          : 'COLLECTION_SCHEDULED';
  await tx.emailNotification.upsert({
    where: { dedupeKey: `${kind}:${id}:${revision}:${mode}` },
    update: {},
    create: {
      type,
      toEmail: email,
      subject:
        mode === 'cancel'
          ? 'Your schedule was cancelled'
          : mode === 'reminder'
            ? 'Your Agapay schedule reminder'
            : 'Your Agapay schedule',
      templateData: {
        name,
        referenceNumber: donation?.referenceNumber ?? distribution?.request.referenceNumber ?? '',
        location: event.location,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        title: event.title,
        schedule: { kind, id, revision, mode, eventId: event.id, eventRevision: event.revision },
      },
      priority: mode === 'cancel' ? 1 : mode === 'reminder' ? 3 : 2,
      ...(distribution ? { relatedRequestId: distribution.requestId } : { relatedDonationId: id }),
      dedupeKey: `${kind}:${id}:${revision}:${mode}`,
    },
  });
  if (mode === 'schedule') {
    if (kind === 'distribution')
      await tx.distribution.update({
        where: { id },
        data: { scheduleNotifiedAt: clock.now(), reminderSentAt: null },
      });
    else
      await tx.donation.update({
        where: { id },
        data: { scheduleNotifiedAt: clock.now(), reminderSentAt: null },
      });
  }
}

export async function touchAssignments(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  await tx.calendarEvent.updateMany({
    where: { id: { in: [...new Set(ids)] } },
    data: {
      revision: { increment: 1 },
      syncStatus: 'NOT_SYNCED',
      syncAttempts: 0,
      syncNextAt: systemClock.now(),
    },
  });
}
