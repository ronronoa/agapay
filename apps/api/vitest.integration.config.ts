import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnvPath = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// Tests must never call a real email provider: a live Resend key in .env makes
// worker tests attempt network sends and time out. The database stays real
// (TEST-01); only the outbound adapter is stubbed.
process.env.EMAIL_PROVIDER = 'console';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
