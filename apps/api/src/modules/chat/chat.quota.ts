import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../lib/env.js';
import type { Clock } from '../../lib/clock.js';

function day(now: Date) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export async function status(actorKey: string, clock: Clock) {
  const rows = await prisma.chatUsage.findMany({
    where: { day: day(clock.now()), actorKey: { in: ['global', actorKey] } },
  });
  const actorRemaining =
    env.CHAT_USER_DAILY_LIMIT - (rows.find((row) => row.actorKey === actorKey)?.count ?? 0);
  const globalRemaining =
    env.CHAT_GLOBAL_DAILY_LIMIT - (rows.find((row) => row.actorKey === 'global')?.count ?? 0);
  const remainingToday = Math.max(0, Math.min(actorRemaining, globalRemaining));
  return {
    available: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY && env.GEMINI_MODEL) && remainingToday > 0,
    remainingToday,
  };
}

export async function reserveCall(actorKey: string, clock: Clock): Promise<void> {
  const now = clock.now();
  const usageDay = day(now);
  const limits = [
    { actorKey: 'global', limit: env.CHAT_GLOBAL_DAILY_LIMIT },
    { actorKey, limit: env.CHAT_USER_DAILY_LIMIT },
    { actorKey: `${actorKey}:minute:${now.toISOString().slice(0, 16)}`, limit: 10 },
  ];
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      // ponytail: one lock fits the small global daily budget; shard only with a higher-volume quota design.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(52503)`;
      for (const entry of limits) {
        await tx.chatUsage.upsert({
          where: { actorKey_day: { actorKey: entry.actorKey, day: usageDay } },
          create: { actorKey: entry.actorKey, day: usageDay, count: 0 },
          update: {},
        });
        const changed = await tx.chatUsage.updateMany({
          where: { actorKey: entry.actorKey, day: usageDay, count: { lt: entry.limit } },
          data: { count: { increment: 1 } },
        });
        if (!changed.count)
          throw new AppError(
            'CHAT_QUOTA_EXCEEDED',
            'The assistant limit has been reached. Use the FAQ or request pages.',
          );
      }
    }, txOptions),
  );
}
