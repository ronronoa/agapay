import { settingsRouter } from './modules/settings/settings.routes.js';
import { supportRouter } from './modules/support/support.routes.js';
import { socketTicketRouter } from './modules/support/socket-ticket.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { rateLimitHandler } from './lib/http/rate-limit.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorMiddleware, notFoundHandler } from './lib/http/error-middleware.js';
import { getRequestId, newRequestId, requestContext } from './lib/http/request-context.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { campaignsRouter } from './modules/campaigns/campaigns.routes.js';
import { itemTypesRouter } from './modules/item-types/item-types.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { donationsRouter } from './modules/donations/donations.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { distributionsRouter } from './modules/distributions/distributions.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { notificationsRouter } from './modules/notifications/notification.routes.js';
import { uploadRoot } from './modules/inventory/inventory.upload.js';

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
    const requestId =
      typeof inbound === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(inbound)
        ? inbound
        : newRequestId();
    res.setHeader('x-request-id', requestId);
    requestContext.run({ requestId }, next);
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: () => getRequestId() ?? newRequestId(),
      serializers: {
        // Search filters and URLs can contain contacts or tokens. Log outcomes only.
        req: (req: { id?: unknown; method?: unknown }) => ({ id: req.id, method: req.method }),
        res: (res: { statusCode?: unknown }) => ({ statusCode: res.statusCode }),
      },
      // Log the outcome, never the payload: public and chat bodies carry personal data.
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
    }),
  );

  app.use('/api/v1', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // API-03: cap body size before any parser does work on it.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Global per-IP budget (api.md §2); route-specific limits layer on top.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: rateLimitHandler,
    }),
  );

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/auth/realtime-ticket', socketTicketRouter);
  app.use('/api/v1/support', supportRouter);
  app.use('/api/v1/audit-logs', auditRouter);
  app.use('/api/v1/campaigns', campaignsRouter);
  app.use('/api/v1/item-types', itemTypesRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/donations', donationsRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/assistance-requests', requestsRouter);
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/distributions', distributionsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/notifications/emails', notificationsRouter);
  app.use('/api/v1', healthRouter);

  // Public campaign/inventory photos may be embedded by the separately hosted
  // frontend. Keep Helmet's stricter default for API responses.
  app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    express.static(uploadRoot(), { index: false, dotfiles: 'deny' })(req, res, next);
  });

  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
