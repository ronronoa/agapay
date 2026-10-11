import { Router } from 'express';
import { emailIdParamsSchema, emailListQuerySchema } from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './notification.service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = emailListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.listEmails(parsed.data);
  res.status(200).json({ data: result.items, meta: result.meta });
});

notificationsRouter.get('/usage', requireAuth, requireRole('ADMIN', 'STAFF'), async (_req, res) => {
  const result = await service.emailUsage();
  res.status(200).json({ data: result });
});

notificationsRouter.post(
  '/:id/retry',
  requireAuth,
  requireRole('ADMIN', 'STAFF'),
  async (req, res) => {
    const raw: unknown = req.params;
    const parsed = emailIdParamsSchema.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error.flatten());

    const result = await service.retryEmail(parsed.data.id, actorFrom(req));
    res.status(200).json({ data: result });
  },
);
