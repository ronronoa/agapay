import { z } from 'zod';
import { Prisma, type InboxNotification } from '@prisma/client';
import { inboxNotificationSchema, type inboxQuerySchema } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import { notFound, validationError } from '../../lib/errors.js';
import type { AuthContext } from '../../types/express.js';
import { emitLive } from './live.service.js';
import { isScheduleCurrent } from '../notifications/schedule-email.js';

function scope(actor: AuthContext) {
  return Prisma.sql`n."userId"=${actor.userId} AND ${
    actor.role !== 'DONOR'
      ? Prisma.sql`TRUE`
      : Prisma.sql`(
    EXISTS (SELECT 1 FROM "SupportConversation" c WHERE c.id=n."conversationId" AND c."donorId"=${actor.userId}) OR
    EXISTS (SELECT 1 FROM "Donation" d WHERE d.id=n."donationId" AND d."donorId"=${actor.userId}))`
  }`;
}

export async function listInbox(query: z.infer<typeof inboxQuerySchema>, actor: AuthContext) {
  let cursor: { createdAt: Date; id: string } | undefined;
  if (query.before) {
    if (query.before.split('|').length !== 2) throw validationError();
    const [date, id] = query.before.split('|');
    const parsed = z
      .object({ date: z.string().datetime(), id: z.string().uuid() })
      .safeParse({ date, id });
    if (!parsed.success) throw validationError();
    cursor = { createdAt: new Date(parsed.data.date), id: parsed.data.id };
  }
  const [rows, counts] = await prisma.$transaction(
    [
      prisma.$queryRaw<
        InboxNotification[]
      >(Prisma.sql`SELECT n.* FROM "InboxNotification" n WHERE ${scope(actor)}
      AND ${cursor ? Prisma.sql`(n."createdAt",n.id)<(${cursor.createdAt},${cursor.id})` : Prisma.sql`TRUE`}
      ORDER BY n."createdAt" DESC,n.id DESC LIMIT ${query.pageSize + 1}`),
      prisma.$queryRaw<
        Array<{ total: number }>
      >(Prisma.sql`SELECT count(*)::int AS total FROM "InboxNotification" n
      WHERE ${scope(actor)} AND n."readAt" IS NULL`),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  const unreadCount = counts[0]?.total ?? 0;
  const page = rows.slice(0, query.pageSize);
  const last = page.at(-1);
  return {
    data: page.map((row) =>
      inboxNotificationSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      }),
    ),
    meta: {
      unreadCount,
      nextCursor:
        rows.length > query.pageSize && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    },
  };
}
export async function readNotice(id: string, actor: AuthContext, clock: Clock = systemClock) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT n.id FROM "InboxNotification" n WHERE n.id=${id} AND ${scope(actor)}`,
    );
    if (!rows.length) throw notFound('Notification');
    const changed = await tx.inboxNotification.updateMany({
      where: { id, userId: actor.userId, readAt: null },
      data: { readAt: clock.now() },
    });
    if (changed.count) await emitLive(tx, [actor.userId], 'notifications', null, clock);
  }, txOptions);
}
const supportEmailSchema = z.object({
  support: z.object({
    userId: z.string(),
    conversationId: z.string(),
    sequence: z.number().int(),
    donorId: z.string(),
  }),
});
export async function isSupportEmailCurrent(data: unknown) {
  const parsed = supportEmailSchema.safeParse(data);
  if (!parsed.success) return true;
  const p = parsed.data.support;
  const user = await prisma.user.findUnique({ where: { id: p.userId } });
  if (!user?.isActive || (user.role === 'DONOR' && user.id !== p.donorId)) return false;
  const read = await prisma.supportRead.findUnique({
    where: { conversationId_userId: { conversationId: p.conversationId, userId: p.userId } },
  });
  return (read?.lastSequence ?? 0) < p.sequence;
}

export async function scanOperationalNotifications(clock: Clock = systemClock) {
  const rows = await prisma.emailNotification.findMany({
    where: { inAppProcessedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 25,
  });
  for (const row of rows) {
    const current = await isScheduleCurrent(row.templateData, clock);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailNotification.updateMany({
        where: { id: row.id, inAppProcessedAt: null },
        data: { inAppProcessedAt: clock.now() },
      });
      if (!claimed.count || !current) return;
      let title = '';
      let userIds: string[] = [];
      if (
        row.relatedDonationId &&
        [
          'DONATION_SUBMITTED',
          'DONATION_VERIFIED',
          'DONATION_REJECTED',
          'COLLECTION_SCHEDULED',
          'COLLECTION_REMINDER',
        ].includes(row.type)
      ) {
        const donation = await tx.donation.findUnique({
          where: { id: row.relatedDonationId },
          include: { donor: true },
        });
        if (!donation) return;
        title =
          row.type === 'DONATION_SUBMITTED'
            ? 'Donation submitted'
            : row.type === 'DONATION_VERIFIED'
              ? 'Donation verified'
              : row.type === 'DONATION_REJECTED'
                ? 'Donation update'
                : 'Collection schedule update';
        if (donation.donor.isActive && donation.donor.role === 'DONOR')
          userIds.push(donation.donorId);
        if (row.type === 'DONATION_SUBMITTED') {
          userIds.push(
            ...(
              await tx.user.findMany({
                where: { isActive: true, role: { in: ['ADMIN', 'STAFF'] } },
                select: { id: true },
              })
            ).map((u) => u.id),
          );
        }
      } else if (
        row.relatedRequestId &&
        ['DISTRIBUTION_SCHEDULED', 'DISTRIBUTION_COMPLETED', 'DISTRIBUTION_CANCELLED'].includes(
          row.type,
        )
      ) {
        title = 'Distribution schedule update';
        userIds = (
          await tx.user.findMany({
            where: { isActive: true, role: { in: ['ADMIN', 'STAFF'] } },
            select: { id: true },
          })
        ).map((u) => u.id);
      }
      for (const userId of [...new Set(userIds)]) {
        await tx.inboxNotification.create({
          data: {
            userId,
            kind: 'OPERATION',
            title,
            donationId: row.relatedDonationId,
            dedupeKey: `operation:${row.id}:${userId}`,
            createdAt: clock.now(),
          },
        });
      }
      if (userIds.length) await emitLive(tx, userIds, 'donations', null, clock);
    }, txOptions);
  }
}
