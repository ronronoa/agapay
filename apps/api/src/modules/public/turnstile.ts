import { env } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 10_000;

let warnedOnce = false;

function isSuccessResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return 'success' in value && value.success === true;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | undefined,
): Promise<boolean> {
  if (env.TURNSTILE_SECRET === undefined) {
    if (env.NODE_ENV === 'production') return false;
    if (!warnedOnce) {
      warnedOnce = true;
      logger.warn('TURNSTILE_SECRET is not set; public form bot protection is off');
    }
    return true;
  }
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (remoteIp !== undefined) body.set('remoteip', remoteIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: controller.signal });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return isSuccessResponse(data);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
