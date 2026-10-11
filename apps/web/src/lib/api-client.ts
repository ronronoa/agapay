import { accessTokenResponseSchema, errorEnvelopeSchema } from '@agapay/shared';
import { clearSession, getAccessToken, setSession } from './session.js';

// Errors are parsed with the shared schema rather than cast, so web/api drift
// fails at the boundary instead of yielding a silent undefined (API-04).
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';

// The one request that rotates the refresh token, which must not recurse.
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Fetch hands back untyped JSON. Every call site parses this with a shared Zod
 * schema rather than casting, so an api/web contract drift becomes a compile
 * error instead of a silent `undefined` (API-04).
 */
export async function apiGetJson(path: string): Promise<unknown> {
  return apiFetch<unknown>(path);
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId: string | undefined,
    details: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function toApiError(response: Response): Promise<ApiClientError> {
  const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (parsed.success) {
    const { code, message, requestId, details } = parsed.data.error;
    return new ApiClientError(code, message, response.status, requestId, details);
  }
  // Non-JSON error body: still surface a usable failure, never a raw dump.
  return new ApiClientError('INTERNAL', 'Request failed.', response.status, undefined, undefined);
}

async function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  const { body, headers, ...rest } = options;
  const token = getAccessToken();

  return fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

// Concurrent 401s must trigger one rotation, not one each: the first refresh
// invalidates the cookie the others would have used (SEC-02).
async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-requested-with': 'agapay' },
      });
      if (!response.ok) return false;

      const parsed = accessTokenResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) return false;
      setSession(parsed.data.data.accessToken, parsed.data.data.user);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawFetch(path, options);

  if (response.status === 401 && getAccessToken() !== null && path !== '/api/v1/auth/refresh') {
    if (await refreshAccessToken()) {
      const retried = await rawFetch(path, options);
      if (!retried.ok) throw await toApiError(retried);
      return (await retried.json()) as T;
    }
    clearSession();
  }

  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}
