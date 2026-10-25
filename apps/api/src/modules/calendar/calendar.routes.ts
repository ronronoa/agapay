import { Router } from 'express';
import {
  eventActionSchema,
  calendarEventListQuerySchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './calendar.service.js';

export const calendarRouter = Router();

calendarRouter.use(requireAuth, requireRole('STAFF', 'ADMIN'));

calendarRouter.get('/events', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = calendarEventListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.list(parsed.data);
  res.status(200).json({ data: result });
});

calendarRouter.get('/events/:id', async (req, res) => {
  res.status(200).json({ data: await service.detail(pathParam(req, 'id')) });
});

calendarRouter.post('/events', async (req, res) => {
  const body: unknown = req.body;
  const parsed = createCalendarEventSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(201).json({ data: await service.create(parsed.data, actorFrom(req)) });
});

calendarRouter.patch('/events/:id', async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateCalendarEventSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res
    .status(200)
    .json({ data: await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req)) });
});

calendarRouter.post('/events/:id/cancel', async (req, res) => {
  const input = eventActionSchema.safeParse(req.body);
  if (!input.success) throw validationError(input.error.flatten());
  res.status(200).json({
    data: await service.cancel(pathParam(req, 'id'), actorFrom(req), input.data.revision),
  });
});

calendarRouter.post('/events/:id/resync', async (req, res) => {
  res.status(200).json({ data: await service.resync(pathParam(req, 'id')) });
});

calendarRouter.post('/events/:id/complete', async (req, res) => {
  const input = eventActionSchema.safeParse(req.body);
  if (!input.success) throw validationError(input.error.flatten());
  res.status(200).json({
    data: await service.complete(pathParam(req, 'id'), input.data.revision, actorFrom(req)),
  });
});
