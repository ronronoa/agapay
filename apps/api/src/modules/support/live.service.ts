import { Prisma } from '@prisma/client';
import type { LiveTopic } from '@agapay/shared';
import { prisma } from '../../lib/prisma.js';
import { systemClock, type Clock } from '../../lib/clock.js';

export async function emitLive(
  tx: Prisma.TransactionClient,
  userIds: string[],
  topic: LiveTopic,
  conversationId: string | null = null,
  clock: Clock = systemClock,
) {
  // Sorted recipient locks serialize sequence allocation through commit and avoid deadlocks.
  const ids = [...new Set(userIds)].sort();
  if (!ids.length) return;
  const states = await tx.$queryRaw<Array<{ userId: string; revision: number }>>(Prisma.sql`
    INSERT INTO "LiveState" ("userId",revision)
    SELECT id,1 FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id
    ON CONFLICT ("userId") DO UPDATE SET revision="LiveState".revision+1
    RETURNING "userId",revision`);
  await tx.liveEvent.createMany({
    data: states.map((state) => ({
      userId: state.userId,
      sequence: state.revision,
      topic,
      conversationId,
      createdAt: clock.now(),
      nextAt: clock.now(),
    })),
  });
}
export async function catchUp(userId: string, after: number) {
  return prisma.liveEvent.findMany({
    where: { userId, sequence: { gt: after } },
    orderBy: { sequence: 'asc' },
    take: 100,
  });
}
