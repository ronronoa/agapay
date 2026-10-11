import { Router } from 'express';
import { createUserSchema, updateUserSchema, userListQuerySchema } from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './users.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole('ADMIN'));

usersRouter.get('/', async (req, res) => {
  const raw: unknown = req.query;
  const parsed = userListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  res.status(200).json({ data: await service.list(parsed.data) });
});

usersRouter.post('/', async (req, res) => {
  const body: unknown = req.body;
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const user = await service.create(parsed.data, actorFrom(req), systemClock);
  res.status(201).json({ data: user });
});

usersRouter.patch('/:id', async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const user = await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock);
  res.status(200).json({ data: user });
});
