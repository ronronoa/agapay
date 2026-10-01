import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// The CLI runs with cwd apps/api and would not find the root .env on its own.
// process.loadEnvFile is native in Node 20.12+, so this needs no dotenv.
const rootEnvPath = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
