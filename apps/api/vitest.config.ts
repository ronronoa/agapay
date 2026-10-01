import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // lib/env.ts throws at import on missing values, so provide the minimum here.
    // These point at nothing real: no test may open a connection (TEST-02).
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
      DIRECT_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
      WEB_ORIGIN: 'http://localhost:5173',
      EMAIL_PROVIDER: 'console',
    },
  },
});
