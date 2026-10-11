import { Router } from 'express';
import { auditListQuerySchema } from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './audit.service.js';

export const auditRouter = Router();

auditRouter.get('/', requireAuth, requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = auditListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.list(parsed.data);
  res.status(200).json({ data: result });
});
