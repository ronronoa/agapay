import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  supportIdSchema,
  supportEmptySchema,
  supportListQuerySchema,
  supportMessagesQuerySchema,
  sendSupportMessageSchema,
  supportReadSchema,
  supportStatusSchema,
  inboxQuerySchema,
} from '@agapay/shared';
import { actorFrom, requireAuth } from '../auth/auth.middleware.js';
import { validationError } from '../../lib/errors.js';
import { rateLimitHandler } from '../../lib/http/rate-limit.js';
import type { z } from 'zod';
import * as service from './support.service.js';
import * as inbox from './inbox.service.js';

export const supportRouter = Router();
supportRouter.use(requireAuth);
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw validationError(result.error.flatten());
  return result.data;
}
const writeLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => actorFrom(req).userId,
  handler: rateLimitHandler,
});
supportRouter.get('/conversations', async (req, res) => {
  res.json(
    await service.list(
      { ...parse(supportListQuerySchema.omit({ q: true }), req.query), q: '' },
      actorFrom(req),
    ),
  );
});
supportRouter.post('/conversations/search', async (req, res) => {
  res.json(await service.list(parse(supportListQuerySchema, req.body), actorFrom(req)));
});
supportRouter.post('/conversations', writeLimit, async (req, res) => {
  parse(supportEmptySchema, req.body ?? {});
  res.json({ data: await service.ensureConversation(actorFrom(req)) });
});
supportRouter.get('/conversations/:id', async (req, res) => {
  res.json({ data: await service.detail(parse(supportIdSchema, req.params).id, actorFrom(req)) });
});
supportRouter.get('/conversations/:id/messages', async (req, res) => {
  res.json(
    await service.messages(
      parse(supportIdSchema, req.params).id,
      parse(supportMessagesQuerySchema, req.query),
      actorFrom(req),
    ),
  );
});
supportRouter.post('/conversations/:id/messages', writeLimit, async (req, res) => {
  res.json({
    data: await service.send(
      parse(supportIdSchema, req.params).id,
      parse(sendSupportMessageSchema, req.body),
      actorFrom(req),
    ),
  });
});
supportRouter.post('/conversations/:id/read', writeLimit, async (req, res) => {
  await service.markRead(
    parse(supportIdSchema, req.params).id,
    parse(supportReadSchema, req.body).sequence,
    actorFrom(req),
  );
  res.sendStatus(204);
});
supportRouter.patch('/conversations/:id', writeLimit, async (req, res) => {
  res.json({
    data: await service.setStatus(
      parse(supportIdSchema, req.params).id,
      parse(supportStatusSchema, req.body),
      actorFrom(req),
    ),
  });
});
supportRouter.get('/notifications', async (req, res) => {
  res.json(await inbox.listInbox(parse(inboxQuerySchema, req.query), actorFrom(req)));
});
supportRouter.post('/notifications/:id/read', writeLimit, async (req, res) => {
  await inbox.readNotice(parse(supportIdSchema, req.params).id, actorFrom(req));
  res.sendStatus(204);
});
