import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorCode, ERROR_STATUS } from '@agapay/shared';
import { getRequestId } from '../../lib/http/request-context.js';
import { hashToken } from './password.js';
import { requireAuth, requireCsrf } from './auth.middleware.js';
import * as controller from './auth.controller.js';

export const authRouter = Router();

const limiterHandler = (_req: Request, res: Response): void => {
  res.setHeader('Retry-After', '900');
  res.status(ERROR_STATUS.RATE_LIMITED).json({
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many attempts. Please try again later.',
      requestId: getRequestId() ?? 'unknown',
    },
  });
};

const perIp15Min = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limiterHandler,
  });

const perIpHourly = (limit: number) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limiterHandler,
  });

const byEmail = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limiterHandler,
    keyGenerator: (req: Request): string => {
      const body: unknown = req.body;
      if (typeof body !== 'object' || body === null) return 'no-email';
      const email = (body as { email?: unknown }).email;
      return typeof email === 'string' ? hashToken(email.toLowerCase()) : 'no-email';
    },
  });

authRouter.post('/register', perIpHourly(5), controller.register);
authRouter.post('/verify-email', controller.verifyEmail);
authRouter.post('/resend-verification', perIpHourly(5), controller.resendVerification);
authRouter.post('/login', perIp15Min(10), byEmail(), controller.login);

authRouter.post('/refresh', requireCsrf, controller.refresh);
authRouter.post('/logout', requireCsrf, controller.logout);

authRouter.post('/forgot-password', perIpHourly(5), controller.forgotPassword);
authRouter.post('/reset-password', controller.resetPassword);

authRouter.get('/me', requireAuth, controller.me);
authRouter.patch('/me', requireAuth, controller.updateProfile);
authRouter.post('/change-password', requireAuth, controller.changePassword);
