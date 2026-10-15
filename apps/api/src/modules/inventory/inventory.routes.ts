import { Router } from 'express';
import { promises as fs } from 'node:fs';
import {
  inventoryAdjustSchema,
  inventoryListQuerySchema,
  inventoryResponseSchema,
  inventoryTransferSchema,
} from '@agapay/shared';
import { validationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { pathParam } from '../../lib/http/params.js';
import { actorFrom, requireAuth, requireRole } from '../auth/auth.middleware.js';
import * as service from './inventory.service.js';
import {
  imageUrlFor,
  runImageUpload,
  uploadErrorMessage,
  uploadPathForUrl,
} from './inventory.upload.js';

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

// Display-only photo for a stock row. Filesystem work stays outside the DB
// transaction: the new file is removed if the update fails, and the replaced
// file is removed only after the update succeeds.
inventoryRouter.post('/:id/image', requireRole('ADMIN', 'STAFF'), async (req, res) => {
  let file: { path: string; filename: string };
  try {
    file = await runImageUpload(req, res);
  } catch (err: unknown) {
    throw uploadErrorMessage(err);
  }

  const url = imageUrlFor(file.filename);
  try {
    const result = await service.setImage(pathParam(req, 'id'), url, actorFrom(req));
    if (result.previousImageUrl !== null && result.previousImageUrl !== url) {
      const oldPath = uploadPathForUrl(result.previousImageUrl);
      if (oldPath !== null) {
        await fs.unlink(oldPath).catch((err: unknown) => {
          logger.warn({ err }, 'leftover inventory photo could not be removed');
        });
      }
    }
    const parsed = inventoryResponseSchema.safeParse({ data: result.item });
    if (!parsed.success) throw validationError(parsed.error.flatten());
    res.status(200).json(parsed.data);
  } catch (err: unknown) {
    await fs.unlink(file.path).catch(() => undefined);
    throw err;
  }
});
