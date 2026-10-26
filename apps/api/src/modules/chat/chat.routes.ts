import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { chatRequestSchema, hasPrivateChatData } from '@agapay/shared';
import { requireAuth } from '../auth/auth.middleware.js';
import { hashIp } from '../auth/password.js';
import { env } from '../../lib/env.js';
import { systemClock } from '../../lib/clock.js';
import { AppError, validationError } from '../../lib/errors.js';
import { rateLimitHandler } from '../../lib/http/rate-limit.js';
import { status } from './chat.quota.js';
import { streamAssistant } from './chat.controller.js';

export const chatRouter = Router();
chatRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.get('authorization') !== undefined) void requireAuth(req, res, next);
  else next();
});
const actorKey = (req: Parameters<typeof requireAuth>[0]) =>
  req.auth ? `user:${req.auth.userId}` : `ip:${hashIp(req.ip ?? 'unknown')}`;
chatRouter.get('/status', async (req, res) => {
  res.json({ data: await status(actorKey(req), systemClock) });
});
chatRouter.post(
  '/',
  rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: rateLimitHandler,
  }),
  async (req, res) => {
    const body: unknown = req.body;
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.flatten());
    if (parsed.data.messages.some((message) => hasPrivateChatData(message.content))) {
      throw validationError({
        messages:
          'Keep contacts, tracking identifiers and credentials out of chat. Use the private tracking form.',
      });
    }
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY || !env.GEMINI_MODEL)
      throw new AppError(
        'ASSISTANT_UNAVAILABLE',
        'The assistant is disabled. Use the FAQ or request pages.',
      );
    await streamAssistant(parsed.data, req.auth, actorKey(req), systemClock, res);
  },
);
