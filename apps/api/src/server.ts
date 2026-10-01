import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

// A deploy must not cut an in-flight request in half (OPS-01).
// TODO(M2): stop the pg-boss workers here once src/jobs/ exists.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close();

    const forceExit = setTimeout(() => {
      logger.warn('graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    void disconnectPrisma()
      .catch((err: unknown) => {
        logger.error({ err }, 'failed to disconnect prisma cleanly');
      })
      .then(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
  });
}
