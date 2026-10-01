// Clients branch on `code`, never `message` (API-04). Mirrors docs/api.md §1.
import { z } from 'zod';

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  /** Donor action blocked until the address is verified (D-03). */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  DUPLICATE_ACTIVE_REQUEST: 'DUPLICATE_ACTIVE_REQUEST',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  RATE_LIMITED: 'RATE_LIMITED',
  CHAT_QUOTA_EXCEEDED: 'CHAT_QUOTA_EXCEEDED',
  ASSISTANT_UNAVAILABLE: 'ASSISTANT_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * The wire shape of every failed response (`docs/api.md` §1). Web parses with
 * this instead of casting, so a change to the envelope breaks compilation
 * rather than silently producing `undefined` at runtime.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ApiErrorBody = ErrorEnvelope['error'];

/** Default HTTP status per code, so services never invent a status by hand. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  DUPLICATE_ACTIVE_REQUEST: 409,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  CHAT_QUOTA_EXCEEDED: 429,
  ASSISTANT_UNAVAILABLE: 503,
  INTERNAL: 500,
};
