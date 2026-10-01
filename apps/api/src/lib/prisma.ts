import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

// One client per process (DB-23). The global cache stops tsx and vitest reloads
// from opening a fresh pool per test file and exhausting free-tier connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Interactive-transaction limits, shared so every service uses the same ones. */
export const txOptions = {
  maxWait: 5_000,
  timeout: 10_000,
} as const;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('prisma disconnected');
}
