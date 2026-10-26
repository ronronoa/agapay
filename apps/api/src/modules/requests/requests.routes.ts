import { Router } from 'express';
import {
  approveRequestSchema,
  cancelRequestSchema,
  correctRequestSchema,
  rejectRequestSchema,
  requestListQuerySchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './requests.service.js';

export const requestsRouter = Router();

requestsRouter.use(requireAuth, requireRole('STAFF', 'ADMIN'));

requestsRouter.get('/', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = requestListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.queueList(parsed.data);
  res.status(200).json({ data: result });
});

requestsRouter.get('/awaiting-stock', async (_req, res) => {
  res.status(200).json({ data: await service.awaitingStock() });
});

requestsRouter.get('/:id', async (req, res) => {
  res.status(200).json({ data: await service.detail(pathParam(req, 'id')) });
});

requestsRouter.post('/:id/correct', async (req, res) => {
  const body: unknown = req.body;
  const parsed = correctRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());
  res.status(200).json({
    data: await service.correct(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock),
  });
});

requestsRouter.post('/:id/claim', async (req, res) => {
  res
    .status(200)
    .json({ data: await service.claim(pathParam(req, 'id'), actorFrom(req), systemClock) });
});

requestsRouter.post('/:id/release', async (req, res) => {
  res
    .status(200)
    .json({ data: await service.release(pathParam(req, 'id'), actorFrom(req), systemClock) });
});

requestsRouter.post('/:id/approve', async (req, res) => {
  const body: unknown = req.body;
  const parsed = approveRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({
    data: await service.approve(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock),
  });
});

requestsRouter.post('/:id/reject', async (req, res) => {
  const body: unknown = req.body;
  const parsed = rejectRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({
    data: await service.reject(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock),
  });
});

requestsRouter.post('/:id/cancel', async (req, res) => {
  const body: unknown = req.body;
  const parsed = cancelRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({
    data: await service.cancel(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock),
  });
});
