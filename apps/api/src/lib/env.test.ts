import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe('provider budget validation', () => {
  it('requires an explicit Gemini model alongside its key', async () => {
    vi.resetModules();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'local-test-key');
    await expect(import('./env.js')).rejects.toThrow('must be set together');
  });
  it('accepts a complete Gemini configuration', async () => {
    vi.resetModules();
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'local-test-key');
    vi.stubEnv('GEMINI_MODEL', 'gemini-test-model');
    expect((await import('./env.js')).env.GEMINI_MODEL).toBe('gemini-test-model');
  });
  it('rejects a model without its Gemini key', async () => {
    vi.resetModules();
    vi.stubEnv('GEMINI_MODEL', 'gemini-test-model');
    await expect(import('./env.js')).rejects.toThrow('must be set together');
  });
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
