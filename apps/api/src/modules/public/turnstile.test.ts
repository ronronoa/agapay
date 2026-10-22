import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('public form bot protection', () => {
  it('fails closed in production without a secret and keeps the local bypass', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET', undefined);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      await (await import('./turnstile.js')).verifyTurnstileToken('fixture-token', undefined),
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    expect(
      await (await import('./turnstile.js')).verifyTurnstileToken('dev-bypass', undefined),
    ).toBe(true);
  });
  it('fails closed on provider errors and verifies successful responses with a timeout signal', async () => {
    vi.resetModules();
    vi.stubEnv('TURNSTILE_SECRET', 'fixture-secret');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ success: false }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetch);
    const { verifyTurnstileToken } = await import('./turnstile.js');
    for (const expected of [false, false, false, true]) {
      expect(await verifyTurnstileToken('fixture-token', undefined)).toBe(expected);
    }
    expect(fetch.mock.calls[3]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
