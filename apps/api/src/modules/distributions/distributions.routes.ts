import { Router } from 'express';
import {
  completeDistributionSchema,
  createDistributionSchema,
  distributionListQuerySchema,
  updateDistributionSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './distributions.service.js';

export const distributionsRouter = Router();

distributionsRouter.use(requireAuth, requireRole('STAFF', 'ADMIN'));

distributionsRouter.get('/', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = distributionListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.list(parsed.data);
  res.status(200).json({ data: result });
});

distributionsRouter.get('/:id', async (req, res) => {
  res.status(200).json({ data: await service.detail(pathParam(req, 'id')) });
});

distributionsRouter.post('/', async (req, res) => {
  const body: unknown = req.body;
  const parsed = createDistributionSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(201).json({ data: await service.create(parsed.data, actorFrom(req)) });
});

distributionsRouter.patch('/:id', async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateDistributionSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

distributionsRouter.post('/:id/complete', async (req, res) => {
  const body: unknown = req.body;
  const parsed = completeDistributionSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.complete(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

distributionsRouter.post('/:id/no-show', async (req, res) => {
  res.status(200).json({ data: await service.noShow(pathParam(req, 'id'), actorFrom(req)) });
});

distributionsRouter.post('/:id/cancel', async (req, res) => {
  res.status(200).json({ data: await service.cancel(pathParam(req, 'id'), actorFrom(req)) });
});
