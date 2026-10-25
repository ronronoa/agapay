import { Router } from 'express';
import { updateSettingsSchema } from '@agapay/shared';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import { validationError } from '../../lib/errors.js';
import * as service from './settings.service.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireRole('ADMIN'));
settingsRouter.get('/', async (_req, res) => {
  res.json({ data: await service.get() });
});
settingsRouter.patch('/', requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) throw validationError(parsed.error.flatten());
  res.json({ data: await service.update(parsed.data, actorFrom(req)) });
});
