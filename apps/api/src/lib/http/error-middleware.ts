import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ZodError } from 'zod';
import { ErrorCode, ERROR_STATUS } from '@agapay/shared';
import { isAppError } from '../errors.js';
import { logger } from '../logger.js';
import { getRequestId } from './request-context.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

function isZodError(err: unknown): err is ZodError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

// Matched by `code` string, not by importing Prisma's error class, so this keeps
// working before `prisma generate` has run.
function mapPrismaError(err: unknown): { code: string; status: number } | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { code } = err as { code?: unknown };
  if (typeof code !== 'string') return undefined;

  switch (code) {
    // Names the constraint but never the conflicting values, which may be personal data.
    case 'P2002':
      return { code: ErrorCode.CONFLICT, status: ERROR_STATUS.CONFLICT };
    case 'P2025':
      return { code: ErrorCode.NOT_FOUND, status: ERROR_STATUS.NOT_FOUND };
    // Write conflict / deadlock — already retried by withRetry by this point.
    case 'P2034':
      return { code: ErrorCode.CONFLICT, status: ERROR_STATUS.CONFLICT };
    default:
      return undefined;
  }
}

// Unknown errors become 500 with a request ID and no detail; the stack and the
// driver message stay in the logs (TS-15, hard rule 9).
export const errorMiddleware: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = getRequestId() ?? 'unknown';

  if (isAppError(err)) {
    logger.warn({ requestId, code: err.code, message: err.message }, 'request failed');
    const body: ErrorBody = {
      error: { code: err.code, message: err.message, requestId },
    };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.status).json(body);
    return;
  }

  if (isZodError(err)) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    logger.warn({ requestId, code: ErrorCode.VALIDATION_ERROR }, 'validation failed');
    res.status(ERROR_STATUS.VALIDATION_ERROR).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Some fields are invalid.',
        details,
        requestId,
      },
    } satisfies ErrorBody);
    return;
  }

  const prisma = mapPrismaError(err);
  if (prisma) {
    logger.warn({ requestId, code: prisma.code }, 'database error');
    res.status(prisma.status).json({
      error: { code: prisma.code, message: 'Request could not be completed.', requestId },
    } satisfies ErrorBody);
    return;
  }

  // Unexpected: log everything, tell the client nothing.
  logger.error({ requestId, err }, 'unhandled error');
  res.status(ERROR_STATUS.INTERNAL).json({
    error: {
      code: ErrorCode.INTERNAL,
      message: 'Something went wrong. Please try again.',
      requestId,
    },
  } satisfies ErrorBody);
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  const requestId = getRequestId() ?? 'unknown';
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Endpoint not found.',
      requestId,
    },
  } satisfies ErrorBody);
};
