import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';
import type { CalendarEvent } from '@prisma/client';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { systemClock, type Clock } from '../lib/clock.js';

export interface CalendarMirror {
  upsert(event: CalendarEvent & { campaign: { name: string } }): Promise<string>;
}
export function googleEventId(id: string): string {
  return `a${id.replace(/-/g, '')}`;
}
export function mirrorBody(event: CalendarEvent & { campaign: { name: string } }) {
  return {
    summary: `${event.status === 'COMPLETED' ? '[Completed] ' : ''}${event.title}`,
    location: event.location,
    description: `${event.type} | ${event.campaign.name}\n${env.WEB_ORIGIN}/admin/calendar?event=${event.id}`,
    start: { dateTime: event.startAt.toISOString(), timeZone: 'Asia/Manila' },
    end: { dateTime: event.endAt.toISOString(), timeZone: 'Asia/Manila' },
    status: event.status === 'CANCELLED' ? 'cancelled' : 'confirmed',
  };
}
export function createGoogleMirror(clock: Clock = systemClock): CalendarMirror {
  return {
    async upsert(event) {
      if (
        !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
        !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
        !env.GOOGLE_CALENDAR_ID
      )
        throw new Error('Google configuration is incomplete.');
      const key = await importPKCS8(
        env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        'RS256',
      );
      const now = Math.floor(+clock.now() / 1000);
      const assertion = await new SignJWT({
        scope: 'https://www.googleapis.com/auth/calendar.events',
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
        .setAudience('https://oauth2.googleapis.com/token')
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(key);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok)
        throw new Error(`Google authentication failed (${tokenResponse.status}).`);
      const token = z.object({ access_token: z.string() }).parse(await tokenResponse.json());
      const id = event.externalEventId ?? googleEventId(event.id);
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`;
      const headers = {
        authorization: `Bearer ${token.access_token}`,
        'content-type': 'application/json',
      };
      const body = mirrorBody(event);
      const update = () =>
        fetch(`${base}/${id}?sendUpdates=none`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
      let response = await update();
      if (response.status === 404) {
        response = await fetch(`${base}?sendUpdates=none`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, id }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 409) response = await update();
      }
      if (!response.ok && !(event.status === 'CANCELLED' && response.status === 410))
        throw new Error(`Google event sync failed (${response.status}).`);
      return id;
    },
  };
}
export async function syncCalendars(
  options: { clock?: Clock; mirror?: CalendarMirror; enabled?: boolean; eventId?: string } = {},
): Promise<number> {
  if (!(options.enabled ?? env.GOOGLE_CALENDAR_ENABLED)) return 0;
  const clock = options.clock ?? systemClock;
  const mirror = options.mirror ?? createGoogleMirror(clock);
  const now = clock.now();
  const rows = await prisma.calendarEvent.findMany({
    where: {
      ...(options.eventId ? { id: options.eventId } : {}),
      syncStatus: { in: ['NOT_SYNCED', 'FAILED'] },
      syncAttempts: { lt: 5 },
      syncNextAt: { lte: now },
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: now } }],
    },
    include: { campaign: { select: { name: true } } },
    take: 10,
    orderBy: { syncNextAt: 'asc' },
  });
  let synced = 0;
  for (const row of rows) {
    const lease = new Date(+clock.now() + 120_000);
    const claimed = await prisma.calendarEvent.updateMany({
      where: {
        id: row.id,
        revision: row.revision,
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: clock.now() } }],
      },
      data: { syncLeaseUntil: lease },
    });
    if (!claimed.count) continue;
    try {
      const externalEventId = await mirror.upsert(row);
      const result = await prisma.calendarEvent.updateMany({
        where: { id: row.id, revision: row.revision, syncLeaseUntil: lease },
        data: { externalEventId, syncStatus: 'SYNCED', syncError: null, syncAttempts: 0 },
      });
      synced += result.count;
    } catch {
      await prisma.calendarEvent.updateMany({
        where: { id: row.id, revision: row.revision, syncLeaseUntil: lease },
        data: {
          syncStatus: 'FAILED',
          syncError: 'Google sync failed. Check calendar sharing and credentials, then retry.',
          syncAttempts: { increment: 1 },
          syncNextAt: new Date(+clock.now() + Math.min(43_200_000, 60_000 * 5 ** row.syncAttempts)),
        },
      });
    } finally {
      await prisma.calendarEvent.updateMany({
        where: { id: row.id, syncLeaseUntil: lease },
        data: { syncLeaseUntil: null },
      });
    }
  }
  return synced;
}
