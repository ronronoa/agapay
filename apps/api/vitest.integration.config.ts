import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnvPath = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// The suite writes and deletes rows, so it gets its own throwaway database
// instead of the dev one, and localhost instead of a remote pooler.
const testDbUrl = process.env.TEST_DATABASE_URL;
if (testDbUrl) {
  process.env.DATABASE_URL = testDbUrl;
  process.env.DIRECT_URL = testDbUrl;
}

// Tests must never call a real email provider: a live Resend key in .env makes
// worker tests attempt network sends and time out. The database stays real
// (TEST-01); only the outbound adapter is stubbed.
process.env.EMAIL_PROVIDER = 'console';
// Live credentials in .env must never make tests write to the operations calendar.
process.env.GOOGLE_CALENDAR_ENABLED = 'false';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
