import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('provider budget validation', () => {
  it('allows SMTP budgets above the Resend-specific cap', async () => {
    vi.resetModules();
    vi.stubEnv('EMAIL_PROVIDER', 'smtp');
    vi.stubEnv('SMTP_USER', 'fixture@example.invalid');
    vi.stubEnv('SMTP_PASS', 'private-fixture-password');
    vi.stubEnv('EMAIL_DAILY_LIMIT', '500');
    expect((await import('./env.js')).env.EMAIL_DAILY_LIMIT).toBe(500);
  });
  it('retains the Resend free-tier cap', async () => {
    vi.resetModules();
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 'fixture-key');
    vi.stubEnv('EMAIL_DAILY_LIMIT', '101');
    await expect(import('./env.js')).rejects.toThrow('exceeds the Resend free-tier daily cap');
  });
});
