import type { RequestHandler } from 'express';
import { ErrorCode, ERROR_STATUS } from '@agapay/shared';
import { getRequestId } from './request-context.js';

export const rateLimitHandler: RequestHandler = (req, res) => {
  const state: unknown = 'rateLimit' in req ? req.rateLimit : undefined;
  const reset =
    typeof state === 'object' && state !== null && 'resetTime' in state
      ? state.resetTime
      : undefined;
  const seconds =
    reset instanceof Date ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 900;
  res.setHeader('Retry-After', String(seconds));
  res.status(ERROR_STATUS.RATE_LIMITED).json({
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please try again later.',
      requestId: getRequestId() ?? 'unknown',
    },
  });
};
