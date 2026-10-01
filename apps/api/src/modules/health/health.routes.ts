import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

// Liveness must not touch any dependency, or a database blip would make the
// orchestrator restart a healthy instance (OPS-02).
export const healthRouter = Router();

const READINESS_TIMEOUT_MS = 2_000;

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/health/ready', async (_req, res) => {
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error('database readiness check timed out')),
      READINESS_TIMEOUT_MS,
    ).unref();
  });

  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    logger.error({ err }, 'readiness check failed');
    res.status(503).json({ status: 'unavailable' });
  }
});
