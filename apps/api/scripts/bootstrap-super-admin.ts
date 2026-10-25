import { userIdParamsSchema } from '@agapay/shared';
import { bootstrapSuperAdmin } from '../src/modules/users/users.service.js';
import { systemClock } from '../src/lib/clock.js';
import { prisma } from '../src/lib/prisma.js';

try {
  const parsed = userIdParamsSchema.safeParse({ id: process.argv[2] });
  if (!parsed.success || process.argv.length !== 3)
    throw new Error(
      'Usage: npm run bootstrap:super-admin --workspace=@agapay/api -- <existing-admin-uuid>',
    );
  await bootstrapSuperAdmin(parsed.data.id, systemClock);
  process.stdout.write('Selected Admin promoted to Super Admin. Sign in again.\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
