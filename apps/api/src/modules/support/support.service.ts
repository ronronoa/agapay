import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  conversationSchema,
  supportMessageSchema,
  type SupportListQuery,
  type SupportMessagesQuery,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors.js';
import { withRetry } from '../../lib/retry.js';
import type { AuthContext } from '../../types/express.js';
import { write as audit } from '../audit/audit.service.js';
import { emitLive } from './live.service.js';

async function access(tx: Prisma.TransactionClient, id: string, actor: AuthContext, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM "SupportConversation" WHERE id=${id} FOR UPDATE`;
  const row = await tx.supportConversation.findUnique({ where: { id }, include: { donor: true } });
  if (!row || (actor.role === 'DONOR' && row.donorId !== actor.userId))
    throw notFound('Conversation');
  return row;
}
async function participants(tx: Prisma.TransactionClient, donorId: string) {
  return tx.user.findMany({
    where: {
      isActive: true,
      OR: [{ id: donorId, role: 'DONOR' }, { role: { in: ['STAFF', 'ADMIN'] } }],
    },
    orderBy: { id: 'asc' },
    select: { id: true, role: true, email: true },
  });
}
export async function ensureConversation(actor: AuthContext, clock: Clock = systemClock) {
  if (actor.role !== 'DONOR') throw forbidden();
  const row = await prisma.supportConversation.upsert({
    where: { donorId: actor.userId },
    update: {},
    create: { donorId: actor.userId, createdAt: clock.now(), lastMessageAt: clock.now() },
  });
  return detail(row.id, actor);
}
export async function list(query: SupportListQuery, actor: AuthContext) {
  const base = Prisma.sql`SELECT c.id,c."donorId",c.status,c.revision,c."lastSequence",c."lastMessageAt",
    u.name AS "donorName",u.email AS "donorEmail",
    (SELECT count(*)::int FROM "SupportMessage" m WHERE m."conversationId"=c.id AND m."senderId"<>${actor.userId}
      AND m.sequence>COALESCE(r."lastSequence",0)) AS "unreadCount"
    FROM "SupportConversation" c JOIN "User" u ON u.id=c."donorId"
    LEFT JOIN "SupportRead" r ON r."conversationId"=c.id AND r."userId"=${actor.userId}
    WHERE ${actor.role === 'DONOR' ? Prisma.sql`c."donorId"=${actor.userId}` : Prisma.sql`TRUE`}
      AND ${query.status ? Prisma.sql`c.status=${query.status}` : Prisma.sql`TRUE`}
      AND (u.name ILIKE ${`%${query.q}%`} OR u.email ILIKE ${`%${query.q}%`})`;
  const filter = query.unread === 'true' ? Prisma.sql`"unreadCount">0` : Prisma.sql`TRUE`;
  const result = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ lastMessageAt: Date } & Record<string, unknown>>
      >(Prisma.sql`
      SELECT * FROM (${base}) x WHERE ${filter} ORDER BY "lastMessageAt" DESC,id DESC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
      const count = await tx.$queryRaw<Array<{ total: number }>>(
        Prisma.sql`SELECT count(*)::int AS total FROM (${base}) x WHERE ${filter}`,
      );
      return { rows, total: count[0]?.total ?? 0 };
    },
    { isolationLevel: 'RepeatableRead' },
  );
  return {
    data: z
      .array(conversationSchema)
      .parse(
        result.rows.map((row) => ({ ...row, lastMessageAt: row.lastMessageAt.toISOString() })),
      ),
    meta: { total: result.total, page: query.page, pageSize: query.pageSize },
  };
}
export async function detail(id: string, actor: AuthContext) {
  const row = await access(prisma, id, actor);
  const read = await prisma.supportRead.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: actor.userId } },
  });
  const unreadCount = await prisma.supportMessage.count({
    where: {
      conversationId: id,
      senderId: { not: actor.userId },
      sequence: { gt: read?.lastSequence ?? 0 },
    },
  });
  return conversationSchema.parse({
    ...row,
    donorName: row.donor.name,
    donorEmail: row.donor.email,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unreadCount,
  });
}
export async function messages(id: string, query: SupportMessagesQuery, actor: AuthContext) {
  await access(prisma, id, actor);
  const rows = await prisma.supportMessage.findMany({
    where: {
      conversationId: id,
      ...(query.before === undefined ? {} : { sequence: { lt: query.before } }),
      ...(query.after === undefined ? {} : { sequence: { gt: query.after } }),
    },
    include: { sender: { select: { name: true } } },
    orderBy: { sequence: query.after === undefined ? 'desc' : 'asc' },
    take: query.pageSize + 1,
  });
  const more = rows.length > query.pageSize;
  const page = rows.slice(0, query.pageSize);
  if (query.after === undefined) page.reverse();
  return {
    data: page.map(messageDto),
    meta: {
      nextBefore: more && query.after === undefined ? (page[0]?.sequence ?? null) : null,
      nextAfter: more && query.after !== undefined ? (page.at(-1)?.sequence ?? null) : null,
    },
  };
}
function messageDto(row: {
  id: string;
  conversationId: string;
  sequence: number;
  senderId: string;
  senderRole: string;
  body: string;
  createdAt: Date;
  sender: { name: string };
}) {
  return supportMessageSchema.parse({
    ...row,
    senderName: row.sender.name,
    createdAt: row.createdAt.toISOString(),
  });
}
export async function send(
  id: string,
  input: { body: string; clientMessageId: string },
  actor: AuthContext,
  clock: Clock = systemClock,
) {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const conversation = await access(tx, id, actor, true);
      const existing = await tx.supportMessage.findUnique({
        where: {
          conversationId_senderId_clientMessageId: {
            conversationId: id,
            senderId: actor.userId,
            clientMessageId: input.clientMessageId,
          },
        },
        include: { sender: { select: { name: true } } },
      });
      if (existing) {
        if (existing.body !== input.body)
          throw conflict('This send identifier was already used for different text.');
        return messageDto(existing);
      }
      if (conversation.status === 'CLOSED' && actor.role !== 'DONOR')
        throw conflict('Reopen this conversation before replying.');
      const updated = await tx.supportConversation.update({
        where: { id },
        data: {
          lastSequence: { increment: 1 },
          revision: { increment: 1 },
          lastMessageAt: clock.now(),
          status: 'OPEN',
        },
      });
      const message = await tx.supportMessage.create({
        data: {
          conversationId: id,
          sequence: updated.lastSequence,
          senderId: actor.userId,
          senderRole: actor.role,
          body: input.body,
          clientMessageId: input.clientMessageId,
          createdAt: clock.now(),
        },
        include: { sender: { select: { name: true } } },
      });
      await tx.supportRead.upsert({
        where: { conversationId_userId: { conversationId: id, userId: actor.userId } },
        create: { conversationId: id, userId: actor.userId, lastSequence: message.sequence },
        update: { lastSequence: message.sequence },
      });
      await tx.inboxNotification.updateMany({
        where: { userId: actor.userId, conversationId: id, readAt: null },
        data: { readAt: clock.now() },
      });
      const users = await participants(tx, conversation.donorId);
      const recipients = users.filter((user) => user.id !== actor.userId);
      const reads = await tx.supportRead.findMany({ where: { conversationId: id } });
      const lastEmails = new Map(reads.map((read) => [read.userId, read.lastEmailAt]));
      const emailRecipients = recipients.filter(
        (user) => (lastEmails.get(user.id)?.getTime() ?? 0) <= clock.now().getTime() - 3_600_000,
      );
      if (recipients.length)
        await tx.inboxNotification.createMany({
          data: recipients.map((user) => ({
            userId: user.id,
            kind: 'MESSAGE',
            title: 'New support message',
            conversationId: id,
            messageSequence: message.sequence,
            dedupeKey: `message:${message.id}:${user.id}`,
            createdAt: clock.now(),
          })),
        });
      if (emailRecipients.length) {
        await tx.emailNotification.createMany({
          data: emailRecipients.map((user) => ({
            type: 'SUPPORT_UNREAD',
            toEmail: user.email,
            subject: 'You have an unread Agapay support message',
            priority: 3,
            scheduledFor: new Date(clock.now().getTime() + 300_000),
            dedupeKey: `support:${message.id}:${user.id}`,
            createdAt: clock.now(),
            inAppProcessedAt: clock.now(),
            templateData: {
              conversationPath: `${user.role === 'DONOR' ? '/donor' : '/admin'}/messages?conversation=${id}`,
              support: {
                userId: user.id,
                conversationId: id,
                sequence: message.sequence,
                donorId: conversation.donorId,
              },
            },
          })),
        });
        await tx.supportRead.createMany({
          data: emailRecipients.map((user) => ({ conversationId: id, userId: user.id })),
          skipDuplicates: true,
        });
        await tx.supportRead.updateMany({
          where: { conversationId: id, userId: { in: emailRecipients.map((user) => user.id) } },
          data: { lastEmailAt: clock.now() },
        });
      }
      await emitLive(
        tx,
        users.map((user) => user.id),
        'messages',
        id,
        clock,
      );
      await audit(tx, actor, {
        action: 'support.message.send',
        entityType: 'SupportConversation',
        entityId: id,
      });
      return messageDto(message);
    }, txOptions),
  );
}
export async function markRead(
  id: string,
  sequence: number,
  actor: AuthContext,
  clock: Clock = systemClock,
) {
  await prisma.$transaction(async (tx) => {
    const row = await access(tx, id, actor, true);
    if (sequence > row.lastSequence) throw validationError();
    const key = { conversationId: id, userId: actor.userId };
    const read = await tx.supportRead.findUnique({ where: { conversationId_userId: key } });
    if ((read?.lastSequence ?? 0) >= sequence) return;
    await tx.supportRead.upsert({
      where: { conversationId_userId: key },
      create: { ...key, lastSequence: sequence },
      update: { lastSequence: sequence },
    });
    await tx.inboxNotification.updateMany({
      where: {
        userId: actor.userId,
        conversationId: id,
        messageSequence: { lte: sequence },
        readAt: null,
      },
      data: { readAt: clock.now() },
    });
    await emitLive(tx, [actor.userId], 'messages', id, clock);
  }, txOptions);
}
export async function setStatus(
  id: string,
  input: { status: 'OPEN' | 'CLOSED'; revision: number },
  actor: AuthContext,
  clock: Clock = systemClock,
) {
  if (actor.role === 'DONOR') throw forbidden();
  await prisma.$transaction(async (tx) => {
    const row = await access(tx, id, actor, true);
    const updated = await tx.supportConversation.updateMany({
      where: { id, revision: input.revision },
      data: { status: input.status, revision: { increment: 1 } },
    });
    if (!updated.count) throw conflict('Conversation changed. Review the latest messages.');
    const users = await participants(tx, row.donorId);
    await emitLive(
      tx,
      users.map((user) => user.id),
      'messages',
      id,
      clock,
    );
    await audit(tx, actor, {
      action: 'support.conversation.status',
      entityType: 'SupportConversation',
      entityId: id,
      metadata: { status: input.status },
    });
  }, txOptions);
  return detail(id, actor);
}
