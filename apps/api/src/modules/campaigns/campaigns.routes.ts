import { Router } from 'express';
import { promises as fs } from 'node:fs';
import {
  createCampaignSchema,
  campaignListQuerySchema,
  campaignResponseSchema,
  updateCampaignSchema,
  CampaignStatus,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pathParam } from '../../lib/http/params.js';
import { systemClock } from '../../lib/clock.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './campaigns.service.js';
import {
  campaignImageUrlFor,
  campaignUploadErrorMessage,
  campaignUploadPathForUrl,
  runCampaignImageUpload,
} from './campaigns.upload.js';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

campaignsRouter.get('/', requireRole('ADMIN', 'STAFF', 'DONOR'), async (req, res) => {
  const raw: unknown = req.query;
  const parsed = campaignListQuerySchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const actor = actorFrom(req);
  const query =
    actor.role === 'DONOR' ? { ...parsed.data, status: CampaignStatus.ACTIVE } : parsed.data;
  res.status(200).json({ data: await service.list(query) });
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

// Display-only cover image. Filesystem work stays outside any DB transaction:
// the new file is removed if the update fails, and the replaced file is
// removed only after the update succeeds (same pattern as inventory photos).
campaignsRouter.post('/:id/image', requireRole('ADMIN'), async (req, res) => {
  let file: { path: string; filename: string };
  try {
    file = await runCampaignImageUpload(req, res);
  } catch (err: unknown) {
    throw campaignUploadErrorMessage(err);
  }

  const url = campaignImageUrlFor(file.filename);
  try {
    const result = await service.setCoverImage(pathParam(req, 'id'), url, actorFrom(req));
    if (result.previousImageUrl !== null && result.previousImageUrl !== url) {
      const oldPath = campaignUploadPathForUrl(result.previousImageUrl);
      if (oldPath !== null) {
        await fs.unlink(oldPath).catch((err: unknown) => {
          logger.warn({ err }, 'leftover campaign image could not be removed');
        });
      }
    }
    const parsed = campaignResponseSchema.safeParse({ data: result.campaign });
    if (!parsed.success) throw validationError(parsed.error.flatten());
    res.status(200).json(parsed.data);
  } catch (err: unknown) {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  }
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
