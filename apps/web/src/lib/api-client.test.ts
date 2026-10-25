import type { AuthUserDto } from '@agapay/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';
import { clearSession, getAccessToken, setSession } from './session';
import { waitFor } from '@testing-library/react';

const user: AuthUserDto = {
  id: 'fixture',
  name: 'Fixture',
  email: 'fixture@example.invalid',
  role: 'DONOR',
  phone: null,
  emailVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
describe('API response handling', () => {
  it.each(['logout', 'account switch'])(
    'does not restore an old session after %s',
    async (action) => {
      setSession('old-token', user);
      let finish: ((response: Response) => void) | undefined;
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(new Response('{}', { status: 401 }))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        );
      vi.stubGlobal('fetch', fetch);
      const pending = apiFetch('/api/v1/private');
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      clearSession();
      if (action === 'account switch') setSession('second-token', { ...user, id: 'second' });
      finish?.(Response.json({ data: { accessToken: 'late-old-token', expiresIn: 900, user } }));
      await expect(pending).rejects.toMatchObject({ status: 401 });
      expect(getAccessToken()).toBe(action === 'logout' ? null : 'second-token');
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('accepts a successful empty response without parsing JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
  it('accepts an empty response after a successful refresh', async () => {
    setSession('old-token', user);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status: 401 }))
        .mockResolvedValueOnce(
          Response.json({ data: { accessToken: 'new-token', expiresIn: 900, user } }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    await expect(apiFetch('/api/v1/private', { method: 'POST' })).resolves.toBeUndefined();
    expect(getAccessToken()).toBe('new-token');
  });
  it('clears a rejected session and preserves the server error envelope', async () => {
    setSession('old-token', user);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.', requestId: 'fixture' } },
            { status: 401 },
          ),
        )
        .mockResolvedValueOnce(new Response('{}', { status: 401 })),
    );
    await expect(apiFetch('/api/v1/private')).rejects.toMatchObject({
      status: 401,
      message: 'Sign in again.',
    });
    expect(getAccessToken()).toBeNull();
  });
});
