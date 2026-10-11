import { Router } from 'express';
import {
  createCampaignSchema,
  campaignListQuerySchema,
  updateCampaignSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './campaigns.service.js';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.get('/', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = campaignListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.list(parsed.data) });
});

campaignsRouter.get('/:id', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  res.status(200).json({ data: await service.getById(pathParam(req, 'id')) });
});

campaignsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(201).json({ data: await service.create(parsed.data, actorFrom(req), systemClock) });
});

campaignsRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

campaignsRouter.post('/:id/activate', requireRole('ADMIN'), async (req, res) => {
  const result = await service.transition(
    pathParam(req, 'id'),
    'ACTIVE',
    actorFrom(req),
    systemClock,
  );
  res.status(200).json({ data: result });
});

campaignsRouter.post('/:id/complete', requireRole('ADMIN'), async (req, res) => {
  const result = await service.transition(
    pathParam(req, 'id'),
    'COMPLETED',
    actorFrom(req),
    systemClock,
  );
  res.status(200).json({ data: result });
});

campaignsRouter.post('/:id/archive', requireRole('ADMIN'), async (req, res) => {
  const result = await service.transition(
    pathParam(req, 'id'),
    'ARCHIVED',
    actorFrom(req),
    systemClock,
  );
  res.status(200).json({ data: result });
});

campaignsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  await service.remove(pathParam(req, 'id'), actorFrom(req));
  res.status(204).send();
});
