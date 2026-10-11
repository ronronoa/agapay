import type { EmailNotification, Prisma } from '@prisma/client';
import type { EmailDto, EmailListQuery } from '@agapay/shared';
import type { AuthContext } from '../../types/express.js';
import { prisma } from '../../lib/prisma.js';
import { systemClock, type Clock } from '../../lib/clock.js';
import { startOfUtcDay } from '../../lib/dates.js';
import { env } from '../../lib/env.js';
import { invalidTransition, notFound } from '../../lib/errors.js';
import { write as writeAudit } from '../audit/audit.service.js';

function toDto(row: EmailNotification): EmailDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    toEmail: row.toEmail,
    subject: row.subject,
    priority: row.priority,
    attempts: row.attempts,
    lastError: row.lastError,
    providerMessageId: row.providerMessageId,
    relatedRequestId: row.relatedRequestId,
    relatedDonationId: row.relatedDonationId,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listEmails(query: EmailListQuery): Promise<{
  items: EmailDto[];
  meta: { page: number; pageSize: number; total: number };
}> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const where: Prisma.EmailNotificationWhereInput = {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
  const [total, rows] = await Promise.all([
    prisma.emailNotification.count({ where }),
    prisma.emailNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items: rows.map(toDto), meta: { page, pageSize, total } };
}

export async function retryEmail(
  id: string,
  actor: AuthContext,
  clock: Clock = systemClock,
): Promise<EmailDto> {
  const updated = await prisma.emailNotification.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'QUEUED', attempts: 0, scheduledFor: clock.now(), lastError: null },
  });
  if (updated.count === 0) {
    const existing = await prisma.emailNotification.findUnique({
      where: { id },
      select: { status: true },
    });
    if (existing === null) throw notFound('Email notification');
    throw invalidTransition(existing.status, 'QUEUED');
  }
  const row = await prisma.emailNotification.findUnique({ where: { id } });
  if (row === null) throw notFound('Email notification');
  await writeAudit(prisma, actor, {
    action: 'notification.retry',
    entityType: 'EmailNotification',
    entityId: id,
  });
  return toDto(row);
}

export async function emailUsage(
  clock: Clock = systemClock,
): Promise<{ sentToday: number; limit: number; remaining: number }> {
  const sentToday = await prisma.emailNotification.count({
    where: { status: 'SENT', sentAt: { gte: startOfUtcDay(clock.now()) } },
  });
  const limit = env.EMAIL_DAILY_LIMIT;
  return { sentToday, limit, remaining: Math.max(0, limit - sentToday) };
}
