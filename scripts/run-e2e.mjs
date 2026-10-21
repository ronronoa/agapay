import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let cli;
try {
  cli = require.resolve('@playwright/test/cli');
} catch {
  console.error(
    'Browser tests require @playwright/test and its Chromium browser. Install them explicitly, then run npm run test:e2e again. See docs/M4_OPERATIONS.md.',
  );
  process.exit(1);
}
const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
