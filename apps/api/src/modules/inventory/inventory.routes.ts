import { Router } from 'express';
import {
  inventoryAdjustSchema,
  inventoryListQuerySchema,
  inventoryTransferSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './inventory.service.js';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get('/', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = inventoryListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.list(parsed.data) });
});

inventoryRouter.get('/:id', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  res.status(200).json({ data: await service.getById(pathParam(req, 'id')) });
});

inventoryRouter.get('/:id/movements', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = inventoryListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.listMovements(
    pathParam(req, 'id'),
    parsed.data.page,
    parsed.data.pageSize,
  );
  res.status(200).json({ data: result });
});

inventoryRouter.post('/adjustments', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = inventoryAdjustSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.adjust(parsed.data, actorFrom(req)) });
});

inventoryRouter.post('/transfer', requireRole('ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = inventoryTransferSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.transfer(parsed.data, actorFrom(req)) });
});
