import { Router } from 'express';
import {
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
  userIdParamsSchema,
  manualEmailVerificationSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './users.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole('ADMIN'));
usersRouter.post('/:id/verify-email', async (req, res) => {
  const parsed = userIdParamsSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.flatten());
  const body: unknown = req.body;
  const input = manualEmailVerificationSchema.safeParse(body);
  if (!input.success) throw validationError(input.error.flatten());
  const user = await service.verifyDonorEmail(
    parsed.data.id,
    input.data,
    actorFrom(req),
    systemClock,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ data: user });
});

usersRouter.post('/:id/invitation', async (req, res) => {
  const parsed = userIdParamsSchema.safeParse(req.params);
  if (!parsed.success) throw validationError(parsed.error.flatten());
  const invitation = await service.resendInvitation(parsed.data.id, actorFrom(req), systemClock);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ data: invitation });
});

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

  const result = await service.create(parsed.data, actorFrom(req), systemClock);
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ data: result.user, invitation: result.invitation });
});

usersRouter.patch('/:id', async (req, res) => {
  const body: unknown = req.body;
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const user = await service.update(pathParam(req, 'id'), parsed.data, actorFrom(req), systemClock);
  res.status(200).json({ data: user });
});
