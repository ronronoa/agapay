import { logger } from './logger.js';

// Retrying anything but a genuine conflict would turn a deterministic bug into
// a slow one (DB-12). Math.random here only spreads contention.
const RETRYABLE_PRISMA_CODES = new Set(['P2034']);

const RETRYABLE_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

function errorCodes(err: unknown): string[] {
  if (typeof err !== 'object' || err === null) return [];
  const candidate = err as { code?: unknown; cause?: unknown };
  const codes: string[] = [];
  if (typeof candidate.code === 'string') codes.push(candidate.code);
  // Prisma wraps the driver error, so the Postgres SQLSTATE can sit one level down.
  const cause = candidate.cause;
  if (typeof cause === 'object' && cause !== null) {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string') codes.push(causeCode);
  }
  return codes;
}

export function isRetryable(err: unknown): boolean {
  return errorCodes(err).some(
    (code) => RETRYABLE_PRISMA_CODES.has(code) || RETRYABLE_PG_CODES.has(code),
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      const backoff = 25 * 2 ** attempt + Math.random() * 25;
      logger.warn({ attempt, backoff }, 'retrying transaction after write conflict');
      await sleep(backoff);
    }
  }
}
