import { Router } from 'express';
import {
  collectDonationSchema,
  donationListQuerySchema,
  rejectDonationSchema,
  scheduleDonationSchema,
  submitDonationSchema,
  updateDonationSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './donations.service.js';

export const donationsRouter = Router();

donationsRouter.use(requireAuth);

donationsRouter.get('/', requireRole('DONOR', 'STAFF', 'ADMIN'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = donationListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.list(parsed.data, actorFrom(req));
  res.status(200).json({ data: result });
});

donationsRouter.get('/:id', requireRole('DONOR', 'STAFF', 'ADMIN'), async (req, res) => {
  res.status(200).json({ data: await service.detail(pathParam(req, 'id'), actorFrom(req)) });
});

donationsRouter.post('/', requireRole('DONOR'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = submitDonationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(201).json({ data: await service.submit(parsed.data, actorFrom(req), systemClock) });
});

donationsRouter.patch('/:id', requireRole('DONOR'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateDonationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.edit(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

donationsRouter.post('/:id/cancel', requireRole('DONOR', 'STAFF', 'ADMIN'), async (req, res) => {
  res.status(200).json({ data: await service.cancel(pathParam(req, 'id'), actorFrom(req)) });
});

donationsRouter.post('/:id/verify', requireRole('STAFF', 'ADMIN'), async (req, res) => {
  res
    .status(200)
    .json({ data: await service.verify(pathParam(req, 'id'), actorFrom(req), systemClock) });
});

donationsRouter.post('/:id/reject', requireRole('STAFF', 'ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = rejectDonationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.reject(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

donationsRouter.post('/:id/schedule', requireRole('STAFF', 'ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = scheduleDonationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.schedule(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

donationsRouter.post('/:id/collect', requireRole('STAFF', 'ADMIN'), async (req, res) => {
  const body: unknown = req.body;
  const parsed = collectDonationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({
    data: await service.collect(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock),
  });
});

donationsRouter.post('/:id/unschedule', requireRole('STAFF', 'ADMIN'), async (req, res) => {
  res.status(200).json({ data: await service.unschedule(pathParam(req, 'id'), actorFrom(req)) });
});
