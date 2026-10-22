import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { supportEmptySchema } from '@agapay/shared';
import rateLimit from 'express-rate-limit';
import { actorFrom, requireAuth, requireCsrf } from '../auth/auth.middleware.js';
import { REFRESH_COOKIE_NAME } from '../auth/auth.config.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { hashToken } from '../auth/password.js';
import { prisma } from '../../lib/prisma.js';
import { systemClock } from '../../lib/clock.js';
import { unauthenticated, validationError } from '../../lib/errors.js';
import { rateLimitHandler } from '../../lib/http/rate-limit.js';

export const socketTicketRouter = Router();
socketTicketRouter.post(
  '/',
  requireAuth,
  requireCsrf,
  rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: rateLimitHandler,
    keyGenerator: (req) => actorFrom(req).userId,
  }),
  async (req, res) => {
    if (!supportEmptySchema.safeParse(req.body ?? {}).success) throw validationError();
    const cookies: unknown = req.cookies;
    const rawCookie =
      typeof cookies === 'object' && cookies !== null && REFRESH_COOKIE_NAME in cookies
        ? Reflect.get(cookies, REFRESH_COOKIE_NAME)
        : undefined;
    if (typeof rawCookie !== 'string') throw unauthenticated();
    const actor = actorFrom(req);
    const now = systemClock.now();
    const session = await prisma.refreshToken.findFirst({
      where: {
        userId: actor.userId,
        tokenHash: hashToken(rawCookie),
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!session) throw unauthenticated();
    const claims = await verifyAccessToken((req.get('authorization') ?? '').slice(7), systemClock);
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + 30_000);
    await prisma.socketTicket.create({
      data: {
        hash: hashToken(ticket),
        userId: actor.userId,
        sessionId: session.id,
        role: actor.role,
        expiresAt,
        authExpiresAt: new Date(claims.expiresAt),
      },
    });
    res.json({ data: { ticket, expiresAt: expiresAt.toISOString() } });
  },
);
