import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ErrorCode, ERROR_STATUS } from '@agapay/shared';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorMiddleware, notFoundHandler } from './lib/http/error-middleware.js';
import { getRequestId, newRequestId, requestContext } from './lib/http/request-context.js';
import { healthRouter } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();

  // One proxy hop (TLS terminates at the platform's router), so rate limiting
  // sees the real client IP rather than the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // Must run before pino so every log line can read the id from AsyncLocalStorage.
  app.use((req, res, next) => {
    const inbound = req.headers['x-request-id'];
    const requestId = typeof inbound === 'string' && inbound.length > 0 ? inbound : newRequestId();
    res.setHeader('x-request-id', requestId);
    requestContext.run({ requestId }, next);
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: () => getRequestId() ?? newRequestId(),
      // Log the outcome, never the payload: public and chat bodies carry personal data.
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
    }),
  );

  // API-03: cap body size before any parser does work on it.
  app.use(express.json({ limit: '100kb' }));

  // Global per-IP budget (api.md §2); route-specific limits layer on top.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.setHeader('Retry-After', '900');
        res.status(ERROR_STATUS.RATE_LIMITED).json({
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests. Please try again later.',
            requestId: getRequestId() ?? 'unknown',
          },
        });
      },
    }),
  );

  app.use('/api/v1', healthRouter);

  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
