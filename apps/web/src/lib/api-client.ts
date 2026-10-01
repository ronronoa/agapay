import { errorEnvelopeSchema } from '@agapay/shared';

// Errors are parsed with the shared schema rather than cast, so web/api drift
// fails at the boundary instead of yielding a silent undefined (API-04).
const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';

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

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data.error;
      throw new ApiClientError(code, message, response.status, requestId, details);
    }
    // Non-JSON error body: still surface a usable failure, never a raw dump.
    throw new ApiClientError('INTERNAL', 'Request failed.', response.status, undefined, undefined);
  }

  return (await response.json()) as T;
}
