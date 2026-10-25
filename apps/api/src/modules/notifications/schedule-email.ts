import { z } from 'zod';
import { createEvent } from 'ics';
import { prisma } from '../../lib/prisma.js';
import type { Clock } from '../../lib/clock.js';

export const scheduleMetadataSchema = z.object({
  kind: z.enum(['distribution', 'collection']),
  id: z.string(),
  revision: z.number().int(),
  mode: z.enum(['schedule', 'cancel', 'reminder']),
  eventId: z.string(),
  eventRevision: z.number().int(),
});
const payloadSchema = z.object({
  name: z.string(),
  title: z.string(),
  location: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  schedule: scheduleMetadataSchema,
});
export function renderScheduleEmail(data: unknown) {
  const parsed = payloadSchema.safeParse(data);
  if (!parsed.success) return null;
  const p = parsed.data;
  const cancelled = p.schedule.mode === 'cancel';
  const subject = cancelled
    ? 'Your Agapay schedule was cancelled'
    : p.schedule.mode === 'reminder'
      ? 'Reminder: your Agapay schedule'
      : 'Your Agapay schedule';
  const date = new Date(p.startAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const text = `Hi ${p.name},\n\n${cancelled ? 'Your schedule was cancelled' : 'Your schedule is confirmed'}: ${p.title}, ${date} (Philippine time), at ${p.location}.\n\n${cancelled ? 'Our team will contact you about a new schedule.' : 'Please follow this latest email if your saved calendar differs.'}`;
  const escape = (v: string) =>
    v.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
    );
  const calendar = createEvent({
    start: +new Date(p.startAt),
    end: +new Date(p.endAt),
    startInputType: 'utc',
    startOutputType: 'utc',
    endInputType: 'utc',
    endOutputType: 'utc',
    title: p.title,
    location: p.location,
    uid: `${p.schedule.kind}-${p.schedule.id}@agapay`,
    sequence: p.schedule.revision,
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
    method: cancelled ? 'CANCEL' : 'PUBLISH',
  });
  if (calendar.error || !calendar.value)
    throw new Error('Calendar attachment could not be generated.');
  return {
    subject,
    text,
    html: `<p>${escape(text).replace(/\n/g, '<br>')}</p>`,
    attachments: [
      {
        filename: 'agapay-schedule.ics',
        content: calendar.value,
        contentType: 'text/calendar; charset=utf-8',
      },
    ],
  };
}
export async function isScheduleCurrent(data: unknown, clock: Clock): Promise<boolean> {
  const parsed = payloadSchema.safeParse(data);
  if (!parsed.success) return true;
  const p = parsed.data;
  const row =
    p.schedule.kind === 'distribution'
      ? await prisma.distribution.findUnique({ where: { id: p.schedule.id } })
      : await prisma.donation.findUnique({ where: { id: p.schedule.id } });
  if (!row || row.scheduleRevision !== p.schedule.revision) return false;
  if (p.schedule.mode === 'cancel') return row.status === 'CANCELLED' || row.status === 'VERIFIED';
  if (row.status !== 'SCHEDULED') return false;
  const event = await prisma.calendarEvent.findUnique({ where: { id: p.schedule.eventId } });
  return (
    event !== null &&
    event.status === 'SCHEDULED' &&
    (p.schedule.mode === 'reminder' ? event.startAt > clock.now() : event.endAt > clock.now())
  );
}
