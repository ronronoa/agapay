import type { Prisma } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors.js';
import { lockEvents } from './scheduling.js';

export async function lockDistribution(tx: Prisma.TransactionClient, id: string, target?: string) {
  const before = await tx.distribution.findUnique({ where: { id } });
  if (!before) throw notFound('Distribution');
  await lockEvents(tx, [before.calendarEventId, ...(target ? [target] : [])]);
  await tx.$queryRaw`SELECT id FROM "Distribution" WHERE id = ${id} FOR UPDATE`;
  const current = await tx.distribution.findUniqueOrThrow({ where: { id } });
  if (current.calendarEventId !== before.calendarEventId || current.status !== 'SCHEDULED')
    throw conflict('This distribution changed. Refresh before continuing.');
  return current;
}

export async function lockDonation(tx: Prisma.TransactionClient, id: string, target?: string) {
  const before = await tx.donation.findUnique({ where: { id } });
  if (!before) throw notFound('Donation');
  await lockEvents(tx, [
    ...(before.collectionEventId ? [before.collectionEventId] : []),
    ...(target ? [target] : []),
  ]);
  await tx.$queryRaw`SELECT id FROM "Donation" WHERE id = ${id} FOR UPDATE`;
  const current = await tx.donation.findUniqueOrThrow({ where: { id } });
  if (current.collectionEventId !== before.collectionEventId)
    throw conflict('This collection changed. Refresh before continuing.');
  return current;
}
