import type { ErrorCode } from '@agapay/shared';
import { ERROR_STATUS } from '@agapay/shared';

// `message` is for humans and may be reworded; `details` carries structured
// non-personal context only, never names, emails, or notes (TS-12, API-04).
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? ERROR_STATUS[code];
    this.details = options.details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export const validationError = (details?: unknown) =>
  new AppError('VALIDATION_ERROR', 'Some fields are invalid.', { details });

export const unauthenticated = (message = 'Authentication required.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (resource: string) => new AppError('NOT_FOUND', `${resource} not found.`);

export const invalidTransition = (from: string, to: string) =>
  new AppError('INVALID_STATE_TRANSITION', `Cannot move from ${from} to ${to}.`, {
    details: { from, to },
  });

export const insufficientStock = (itemTypeId: string, requested: number, available: number) =>
  new AppError('INSUFFICIENT_STOCK', 'Not enough stock for one or more items.', {
    details: { shortages: [{ itemTypeId, requested, available }] },
  });

export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, { details });

export const businessRuleViolation = (message: string, details?: unknown) =>
  new AppError('BUSINESS_RULE_VIOLATION', message, { details });

export const internal = (message: string, cause?: unknown) =>
  new AppError('INTERNAL', message, { cause });
