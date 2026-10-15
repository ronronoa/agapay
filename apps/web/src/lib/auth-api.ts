import {
  accessTokenResponseSchema,
  authUserSchema,
  errorEnvelopeSchema,
  registeredUserResponseSchema,
  verifyEmailResponseSchema,
  type AuthUserDto,
  type RegisterInput,
} from '@agapay/shared';
import { ApiClientError, apiFetch } from './api-client.js';
import { clearSession, getAccessToken, setSession, setUser } from './session.js';

interface SessionResponse {
  data: {
    accessToken: string;
    expiresIn: number;
    user: AuthUserDto;
  };
}

export async function login(email: string, password: string): Promise<AuthUserDto> {
  // credentials: 'include' so the server sets the httpOnly refresh cookie.
  const response = await apiFetch<SessionResponse>('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    body: { email, password },
  });

  const parsed = accessTokenResponseSchema.safeParse(response);
  if (!parsed.success)
    throw new ApiClientError('INTERNAL', 'Sign-in failed.', 500, undefined, undefined);

  setSession(parsed.data.data.accessToken, parsed.data.data.user);
  return parsed.data.data.user;
}

export async function register(input: RegisterInput): Promise<{ id: string; email: string }> {
  const res: unknown = await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    credentials: 'include',
    body: input,
  });
  const parsed = registeredUserResponseSchema.safeParse(res);
  if (!parsed.success)
    throw new ApiClientError('INTERNAL', 'Registration failed.', 500, undefined, undefined);
  return parsed.data.data;
}

export async function verifyAuthEmail(token: string): Promise<{ verified: boolean }> {
  const res: unknown = await apiFetch('/api/v1/auth/verify-email', {
    method: 'POST',
    body: { token },
  });
  const parsed = verifyEmailResponseSchema.safeParse(res);
  if (!parsed.success)
    throw new ApiClientError('INTERNAL', 'Confirmation failed.', 500, undefined, undefined);
  return parsed.data.data;
}

export async function resendVerification(email: string): Promise<void> {
  await apiFetch('/api/v1/auth/resend-verification', {
    method: 'POST',
    body: { email },
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiFetch('/api/v1/auth/reset-password', {
    method: 'POST',
    body: { token, password },
  });
}

export async function logout(): Promise<void> {
  try {
    // The server's requireCsrf guard rejects this without the custom header.
    await apiFetch<void>('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-requested-with': 'agapay' },
    });
  } catch {
    // A failed revoke must still clear the client, or the UI shows a signed-in
    // state the server no longer honours.
  } finally {
    clearSession();
  }
}

export async function fetchCurrentUser(): Promise<AuthUserDto | null> {
  if (getAccessToken() === null) return null;

  try {
    const response = await apiFetch<{ data: AuthUserDto }>('/api/v1/auth/me', {
      credentials: 'include',
    });
    const parsed = authUserSchema.safeParse(response.data);
    if (!parsed.success) {
      clearSession();
      return null;
    }
    setUser(parsed.data);
    return parsed.data;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) {
      clearSession();
      return null;
    }
    throw err;
  }
}

export async function restoreSession(): Promise<AuthUserDto | null> {
  if (getAccessToken() !== null) return fetchCurrentUser();

  // A reload keeps the cookie but loses the access token, so rotate first.
  try {
    const response = await apiFetch<SessionResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-requested-with': 'agapay' },
    });
    const parsed = accessTokenResponseSchema.safeParse(response);
    if (!parsed.success) {
      clearSession();
      return null;
    }
    setSession(parsed.data.data.accessToken, parsed.data.data.user);
    return parsed.data.data.user;
  } catch {
    clearSession();
    return null;
  }
}

export { errorEnvelopeSchema };
