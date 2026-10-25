// Idempotent, so safe to re-run. Demo data is gated behind SEED_DEMO=true.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password.js';
import { env } from '../src/lib/env.js';
import { assertSafeDemo, seedDemoData, type DemoConfig } from './demo.js';

const prisma = new PrismaClient();

// Limits stay null ("no cap", D-06) because a real value is an eligibility
// decision for the organisation, not the scaffold.
// TODO(owner): confirm low-stock thresholds and per-request limits.
const ITEM_TYPES = [
  { name: 'Food Pack', category: 'FOOD', unit: 'pack' },
  { name: 'Drinking Water', category: 'WATER', unit: 'liter' },
  { name: 'Clothing', category: 'CLOTHING', unit: 'piece' },
  { name: 'Hygiene Kit', category: 'HYGIENE', unit: 'kit' },
  { name: 'Blanket', category: 'BEDDING', unit: 'piece' },
  { name: 'School Supplies', category: 'SCHOOL', unit: 'kit' },
  { name: 'Other', category: 'OTHER', unit: 'piece' },
] as const;

const GENERAL_POOL_SLUG = 'general-pool';

async function seedGeneralPool() {
  await prisma.campaign.upsert({
    where: { slug: GENERAL_POOL_SLUG },
    update: {}, // BR-CAM-02: never completed, archived, or deleted
    create: {
      name: 'General Pool',
      slug: GENERAL_POOL_SLUG,
      description: 'Unearmarked goods for donations that are not tied to a specific campaign.',
      calamityType: 'OTHER',
      status: 'ACTIVE',
      isSystem: true,
      startDate: new Date(),
      endDate: null,
    },
  });
}

async function seedItemTypes() {
  for (const item of ITEM_TYPES) {
    await prisma.itemType.upsert({
      where: { name: item.name },
      update: { category: item.category, unit: item.unit },
      create: { ...item },
    });
  }
}

async function seedAdmin() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (email === undefined || password === undefined) return false;

  // Re-hashed each run, so rotating the env password takes effect on reseed.
  // Existing roles are preserved, including an owner-promoted Super Admin.
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true },
    create: {
      name: 'Agapay Admin',
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  return true;
}

async function seedStaffDemo(): Promise<boolean> {
  const email = env.SEED_STAFF_EMAIL;
  const password = env.SEED_STAFF_PASSWORD;
  if (email === undefined || password === undefined) return false;

  // Same pattern as the admin bootstrap: re-hashed each run, verified, active.
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true },
    create: {
      name: 'Demo Staff',
      email,
      passwordHash,
      role: 'STAFF',
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  return true;
}

async function main() {
  const seedDemo = process.env.SEED_DEMO === 'true';
  const demoConfig: DemoConfig = {
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL,
    emailProvider: env.EMAIL_PROVIDER,
    googleEnabled: env.GOOGLE_CALENDAR_ENABLED,
    password: env.SEED_DEMO_PASSWORD,
  };
  if (seedDemo) assertSafeDemo(demoConfig);

  await seedGeneralPool();
  await seedItemTypes();
  const seededAdmin = await seedAdmin();
  const seededStaff = seedDemo ? await seedStaffDemo() : false;

  if (seedDemo) await seedDemoData(prisma, demoConfig);

  console.log('Seed complete: General Pool campaign, item types.');
  console.log(seededAdmin ? 'Bootstrap admin ensured from env.' : 'No bootstrap admin configured.');
  if (seedDemo) {
    console.log(seededStaff ? 'Demo staff ensured from env.' : 'No demo staff configured.');
  }
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
