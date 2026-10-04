import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@agapay/shared';
import { forbidden, unauthenticated } from '../../lib/errors.js';
import { systemClock } from '../../lib/clock.js';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { verifyAccessToken } from './tokens.js';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './auth.config.js';

const BEARER = /^Bearer (.+)$/;

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.get('authorization');
    const match = header === undefined ? null : BEARER.exec(header);
    if (match === null || match[1] === undefined) throw unauthenticated();

    const claims = await verifyAccessToken(match[1], systemClock);

    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { isActive: true },
    });
    if (user === null || !user.isActive) {
      throw unauthenticated('This account is no longer active.');
    }

    req.auth = { userId: claims.userId, role: claims.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(
  ...allowed: UserRole[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.auth === undefined) {
      next(unauthenticated());
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    next(forbidden('Missing request header.'));
    return;
  }
  const origin = req.get('origin');
  if (origin !== undefined && origin !== env.WEB_ORIGIN) {
    next(forbidden());
    return;
  }
  next();
}
