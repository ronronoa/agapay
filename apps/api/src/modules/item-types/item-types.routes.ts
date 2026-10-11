import { Router } from 'express';
import {
  createItemTypeSchema,
  itemTypeListQuerySchema,
  updateItemTypeSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './item-types.service.js';

export const itemTypesRouter = Router();

itemTypesRouter.get('/', requireAuth, requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = itemTypeListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.list(parsed.data) });
});

itemTypesRouter.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = createItemTypeSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(201).json({ data: await service.create(parsed.data, actorFrom(req)) });
});

itemTypesRouter.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateItemTypeSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});
