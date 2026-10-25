import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';
import { startEmailWorker, stopEmailWorker } from './jobs/email-worker.js';
import { attachRealtime } from './modules/support/realtime.js';

const app = createApp();
const server = createServer(app);
const realtime = attachRealtime(server);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
});

startEmailWorker().catch((err: unknown) => {
  logger.error({ err }, 'email worker failed to start; outbox will not drain');
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close();

    const forceExit = setTimeout(() => {
      logger.warn('graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    void realtime
      .stop()
      .then(() => stopEmailWorker())
      .catch((err: unknown) => {
        logger.error({ err }, 'failed to stop email worker cleanly');
      })
      .then(() => disconnectPrisma())
      .catch((err: unknown) => {
        logger.error({ err }, 'failed to disconnect prisma cleanly');
      })
      .then(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
  });
}
