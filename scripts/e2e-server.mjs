import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const testDb = process.env.TEST_DATABASE_URL;
if (
  !testDb ||
  !/^(localhost|127\.0\.0\.1)$/.test(new URL(testDb).hostname) ||
  !new URL(testDb).pathname.endsWith('_test')
)
  throw new Error('Browser fixtures require a local TEST_DATABASE_URL ending in _test.');
process.env.DATABASE_URL = testDb;
process.env.DIRECT_URL = testDb;
process.env.EMAIL_PROVIDER = 'console';
process.env.NODE_ENV = 'test';
delete process.env.TURNSTILE_SECRET;
process.env.GOOGLE_CALENDAR_ENABLED = 'false';
process.env.WEB_ORIGIN = 'http://127.0.0.1:5174';
const { prisma } = await import('../apps/api/dist/lib/prisma.js');
const { hashPassword } = await import('../apps/api/dist/modules/auth/password.js');
for (const role of ['STAFF', 'ADMIN', 'DONOR']) {
  await prisma.user.upsert({
    where: { email: `m4-e2e-${role.toLowerCase()}@example.com` },
    update: {},
    create: {
      email: `m4-e2e-${role.toLowerCase()}@example.com`,
      name: `M4 test ${role}`,
      role,
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword('M4 browser test only'),
    },
  });
}
await prisma.campaign.upsert({
  where: { slug: 'm4-browser-fixture' },
  update: {},
  create: {
    name: 'M4 browser fixture',
    slug: 'm4-browser-fixture',
    description: 'Local browser acceptance fixture',
    calamityType: 'TYPHOON',
    status: 'ACTIVE',
    startDate: new Date(),
    areas: {
      create: [{ barangay: 'Test barangay', city: 'Test city', province: 'Test province' }],
    },
  },
});
await prisma.itemType.upsert({
  where: { name: 'M4 browser hygiene' },
  update: {},
  create: { name: 'M4 browser hygiene', category: 'HYGIENE', unit: 'kit' },
});
const { createApp } = await import('../apps/api/dist/app.js');
createApp().listen(3001, '127.0.0.1', () =>
  console.log('M4 browser API ready (local test database, no outbound workers).'),
);
