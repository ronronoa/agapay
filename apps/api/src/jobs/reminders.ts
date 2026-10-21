import { prisma, txOptions } from '../lib/prisma.js';
import { systemClock, type Clock } from '../lib/clock.js';
import { lockDistribution, lockDonation } from '../modules/calendar/assignment-locks.js';
import { queueSchedule } from '../modules/calendar/scheduling.js';
import { AppError } from '../lib/errors.js';

export async function scanReminders(clock: Clock = systemClock): Promise<number> {
  const now = clock.now();
  const deadline = new Date(+now + 86_400_000);
  const distributions = await prisma.distribution.findMany({
    where: {
      status: 'SCHEDULED',
      calendarEvent: { status: 'SCHEDULED', startAt: { gt: now, lte: deadline } },
    },
    select: { id: true },
  });
  const donations = await prisma.donation.findMany({
    where: {
      status: 'SCHEDULED',
      collectionEvent: { status: 'SCHEDULED', startAt: { gt: now, lte: deadline } },
    },
    select: { id: true },
  });
  let queued = 0;
  for (const candidate of [
    ...distributions.map((d) => ({ ...d, kind: 'distribution' as const })),
    ...donations.map((d) => ({ ...d, kind: 'collection' as const })),
  ]) {
    try {
      const added = await prisma.$transaction(async (tx) => {
        const row =
          candidate.kind === 'distribution'
            ? await lockDistribution(tx, candidate.id)
            : await lockDonation(tx, candidate.id);
        const eventId = 'calendarEventId' in row ? row.calendarEventId : row.collectionEventId;
        if (!eventId || row.status !== 'SCHEDULED' || row.reminderSentAt) return false;
        const event = await tx.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
        if (
          event.status !== 'SCHEDULED' ||
          event.startAt <= now ||
          event.startAt > deadline ||
          !row.scheduleNotifiedAt ||
          +row.scheduleNotifiedAt > +event.startAt - 86_400_000
        )
          return false;
        await queueSchedule(tx, candidate.kind, candidate.id, 'reminder', clock);
        if (candidate.kind === 'distribution')
          await tx.distribution.update({
            where: { id: candidate.id },
            data: { reminderSentAt: now },
          });
        else
          await tx.donation.update({ where: { id: candidate.id }, data: { reminderSentAt: now } });
        return true;
      }, txOptions);
      if (added) queued++;
    } catch (error) {
      if (!(error instanceof AppError && error.status === 409)) throw error;
    }
  }
  return queued;
}
