// Real Postgres, never a mock: these prove the hand-written SQL actually
// constrains the engine (TEST-01). Run via `npm run test:integration`.
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

async function seedCampaign() {
  return prisma.campaign.upsert({
    where: { slug: 'integration-campaign' },
    update: {},
    create: {
      name: 'Integration Campaign',
      slug: 'integration-campaign',
      description: 'Created by the integration test suite.',
      calamityType: 'FLOOD',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01T00:00:00Z'),
    },
  });
}

async function seedItemType(name: string) {
  return prisma.itemType.upsert({
    where: { name },
    update: {},
    create: { name, category: 'FOOD', unit: 'pack' },
  });
}

beforeAll(async () => {
  const campaign = await seedCampaign();
  await seedItemType('Integration Food Pack');
  await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('baseline schema (TEST-08)', () => {
  it('creates every table the modules expect', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const names = tables.map((row) => row.tablename);
    for (const expected of [
      'User',
      'Campaign',
      'ItemType',
      'InventoryItem',
      'InventoryMovement',
      'AssistanceRequest',
      'Distribution',
      'EmailNotification',
      'AuditLog',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('stores timestamps with a real time zone', async () => {
    const rows = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Campaign'
        AND column_name IN ('startDate', 'endDate', 'createdAt')
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.data_type).toBe('timestamp with time zone');
    }
  });
});

describe('hand-written constraints (database.md §4)', () => {
  it('refuses negative inventory counters (BR-INV-01)', async () => {
    const campaign = await seedCampaign();
    const itemType = await seedItemType('Integration Food Pack');
    const inventory = await prisma.inventoryItem.upsert({
      where: { itemTypeId_campaignId: { itemTypeId: itemType.id, campaignId: campaign.id } },
      update: {},
      create: { itemTypeId: itemType.id, campaignId: campaign.id, available: 5 },
    });

    await expect(
      prisma.$executeRaw`UPDATE "InventoryItem" SET available = -1 WHERE id = ${inventory.id}`,
    ).rejects.toThrow(/inventory_non_negative/);
  });

  it('requires a reason whenever a request is rejected (BR-REQ-05)', async () => {
    const campaign = await seedCampaign();
    const request = await prisma.assistanceRequest.create({
      data: {
        referenceNumber: `REQ-INT-${Date.now()}`,
        fullName: 'Test Person',
        email: `int-${Date.now()}@example.com`,
        contactNumber: '09171234567',
        barangay: 'San Isidro',
        city: 'Quezon City',
        province: 'Metro Manila',
        campaignId: campaign.id,
        consentAt: new Date(),
      },
    });

    await expect(
      prisma.$executeRaw`UPDATE "AssistanceRequest" SET status = 'REJECTED' WHERE id = ${request.id}`,
    ).rejects.toThrow(/rejected_has_reason/);
  });

  it('requires a reason whenever a donation is rejected (BR-DON-03)', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Integration Donor',
        email: `donor-${Date.now()}@example.com`,
        passwordHash: 'not-a-real-hash',
      },
    });
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { slug: 'general-pool' },
    });
    const donation = await prisma.donation.create({
      data: {
        referenceNumber: `DON-INT-${Date.now()}`,
        donorId: user.id,
        campaignId: campaign.id,
      },
    });

    await expect(
      prisma.$executeRaw`UPDATE "Donation" SET status = 'REJECTED' WHERE id = ${donation.id}`,
    ).rejects.toThrow(/donation_rejected_has_reason/);
  });

  it('allows only one live distribution per request (BR-DIS-02)', async () => {
    const index = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'one_live_distribution_per_request'
    `;
    expect(index.length).toBe(1);
    expect(index[0]?.indexdef).toContain('UNIQUE');
    expect(index[0]?.indexdef).toContain('WHERE');
  });

  it('blocks a second active request for the same email and campaign (D-10)', async () => {
    const index = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'one_active_request_per_email_campaign'
    `;
    expect(index.length).toBe(1);
    expect(index[0]?.indexdef).toContain('lower');
  });

  it('enforces case-insensitive email uniqueness (DB-04)', async () => {
    const index = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'user_email_lower_key'
    `;
    expect(index.length).toBe(1);
    expect(index[0]?.indexdef).toContain('lower');
  });
});
