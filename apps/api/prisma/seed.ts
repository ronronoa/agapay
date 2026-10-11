// Idempotent, so safe to re-run. Demo data is gated behind SEED_DEMO=true.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password.js';
import { env } from '../src/lib/env.js';

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
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN', isActive: true },
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

async function main() {
  const seedDemo = process.env.SEED_DEMO === 'true';
  if (seedDemo && process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }

  await seedGeneralPool();
  await seedItemTypes();
  const seededAdmin = await seedAdmin();

  // TODO(M5): SEED_DEMO block — demo campaign, donors, donations, requests, and
  // opening stock, so UAT screens are not empty.

  console.log('Seed complete: General Pool campaign, item types.');
  console.log(seededAdmin ? 'Bootstrap admin ensured from env.' : 'No bootstrap admin configured.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
