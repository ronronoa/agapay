import type { PrismaClient } from '@prisma/client';
import { passwordSchema } from '@agapay/shared';
import { hashPassword } from '../src/modules/auth/password.js';
import { systemClock, type Clock } from '../src/lib/clock.js';

export const DEMO_SLUG = 'agapay-local-demo';
export const DEMO_DONOR_EMAIL = 'donor@agapay-demo.invalid';
export interface DemoConfig {
  nodeEnv: string;
  databaseUrl: string;
  directUrl: string;
  emailProvider: string;
  googleEnabled: boolean;
  password: string | undefined;
}
export function assertSafeDemo(config: DemoConfig): void {
  if (config.nodeEnv === 'production') throw new Error('Demo data is forbidden in production.');
  for (const value of [config.databaseUrl, config.directUrl]) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Demo database URLs must be valid PostgreSQL URLs.');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error('Demo data requires local PostgreSQL URLs.');
    }
  }
  if (config.emailProvider !== 'console' || config.googleEnabled) {
    throw new Error('Demo data requires EMAIL_PROVIDER=console and GOOGLE_CALENDAR_ENABLED=false.');
  }
  if (!passwordSchema.safeParse(config.password).success) {
    throw new Error('Set SEED_DEMO_PASSWORD using the normal password policy.');
  }
}

export async function seedDemoData(
  db: PrismaClient,
  config: DemoConfig,
  clock: Clock = systemClock,
) {
  assertSafeDemo(config);
  const passwordHash = await hashPassword(passwordSchema.parse(config.password));
  const now = clock.now();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  return db.$transaction(async (tx) => {
    // A repeat or concurrent seed must never reset staff's demo workflow progress.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(52503)`;
    const existing = await tx.campaign.findUnique({ where: { slug: DEMO_SLUG } });
    if (existing) return { campaignId: existing.id, created: false };
    const campaign = await tx.campaign.create({
      data: {
        slug: DEMO_SLUG,
        name: 'DEMO — Local relief rehearsal',
        description: 'Synthetic local fixtures. Never use for real relief operations.',
        calamityType: 'FLOOD',
        status: 'ACTIVE',
        startDate: yesterday,
        areas: {
          create: { barangay: 'Demo Barangay', city: 'Demo City', province: 'Demo Province' },
        },
      },
    });
    const donor = await tx.user.create({
      data: {
        name: 'Demo Donor',
        email: DEMO_DONOR_EMAIL,
        passwordHash,
        role: 'DONOR',
        emailVerifiedAt: now,
      },
    });
    const food = await tx.itemType.upsert({
      where: { name: 'DEMO Food Pack' },
      update: {},
      create: { name: 'DEMO Food Pack', category: 'FOOD', unit: 'pack', lowStockThreshold: 5 },
    });
    const collection = await tx.calendarEvent.create({
      data: {
        campaignId: campaign.id,
        title: 'DEMO Collection',
        type: 'COLLECTION',
        startAt: tomorrow,
        endAt: new Date(tomorrow.getTime() + 3_600_000),
        location: 'Demo collection site',
      },
    });
    const upcoming = await tx.calendarEvent.create({
      data: {
        campaignId: campaign.id,
        title: 'DEMO Distribution',
        type: 'DISTRIBUTION',
        capacity: 5,
        startAt: tomorrow,
        endAt: new Date(tomorrow.getTime() + 3_600_000),
        location: 'Demo distribution site',
      },
    });
    const completed = await tx.calendarEvent.create({
      data: {
        campaignId: campaign.id,
        title: 'DEMO Completed distribution',
        type: 'DISTRIBUTION',
        status: 'COMPLETED',
        capacity: 5,
        startAt: yesterday,
        endAt: new Date(yesterday.getTime() + 3_600_000),
        location: 'Demo distribution site',
      },
    });
    const received = await tx.donation.create({
      data: {
        referenceNumber: 'DON-DEMO-RECEIVED',
        donorId: donor.id,
        campaignId: campaign.id,
        status: 'COMPLETED',
        submittedAt: yesterday,
        verifiedAt: yesterday,
        collectedAt: yesterday,
        completedAt: yesterday,
        items: { create: { itemTypeId: food.id, quantityDeclared: 30, quantityReceived: 30 } },
      },
      include: { items: true },
    });
    for (const status of ['PENDING', 'SCHEDULED'] as const) {
      await tx.donation.create({
        data: {
          referenceNumber: `DON-DEMO-${status}`,
          donorId: donor.id,
          campaignId: campaign.id,
          status,
          submittedAt: now,
          ...(status === 'SCHEDULED' ? { collectionEventId: collection.id, verifiedAt: now } : {}),
          items: { create: { itemTypeId: food.id, quantityDeclared: 8 } },
        },
      });
    }
    const stock = await tx.inventoryItem.create({
      data: {
        campaignId: campaign.id,
        itemTypeId: food.id,
        available: 20,
        reserved: 5,
        distributed: 5,
      },
    });
    const requests = [];
    for (const [index, status] of (
      ['PENDING', 'APPROVED', 'SCHEDULED', 'DISTRIBUTED'] as const
    ).entries()) {
      const request = await tx.assistanceRequest.create({
        data: {
          referenceNumber: `REQ-DEMO-${status}`,
          trackingNumber: status === 'PENDING' ? null : `TRK-DEMO-000${index}`,
          fullName: `Demo Recipient ${index + 1}`,
          email: `recipient-${index + 1}@agapay-demo.invalid`,
          contactNumber: '00000000000',
          barangay: 'Demo Barangay',
          city: 'Demo City',
          province: 'Demo Province',
          householdSize: 3,
          campaignId: campaign.id,
          status,
          consentAt: yesterday,
          emailVerifiedAt: yesterday,
          submittedAt: yesterday,
          ...(status === 'PENDING' ? {} : { reviewedAt: yesterday, approvedAt: yesterday }),
          items: { create: { itemTypeId: food.id, quantity: 5 } },
          statusEvents: {
            create: [
              { fromStatus: null, toStatus: 'PENDING', createdAt: yesterday },
              ...(status === 'PENDING'
                ? []
                : [
                    {
                      fromStatus: 'PENDING' as const,
                      toStatus: 'APPROVED' as const,
                      createdAt: yesterday,
                    },
                  ]),
              ...(status === 'SCHEDULED' || status === 'DISTRIBUTED'
                ? [
                    {
                      fromStatus: 'APPROVED' as const,
                      toStatus: 'SCHEDULED' as const,
                      createdAt: yesterday,
                    },
                  ]
                : []),
              ...(status === 'DISTRIBUTED'
                ? [
                    {
                      fromStatus: 'SCHEDULED' as const,
                      toStatus: 'DISTRIBUTED' as const,
                      createdAt: yesterday,
                    },
                  ]
                : []),
            ],
          },
        },
      });
      if (status === 'SCHEDULED' || status === 'DISTRIBUTED') {
        const allocation = await tx.distribution.create({
          data: {
            requestId: request.id,
            calendarEventId: status === 'SCHEDULED' ? upcoming.id : completed.id,
            status,
            ...(status === 'DISTRIBUTED'
              ? { distributedAt: yesterday, receivedByName: 'Demo Recipient 4' }
              : {}),
            items: { create: { inventoryItemId: stock.id, quantity: 5 } },
          },
          include: { items: true },
        });
        requests.push({ status, itemId: allocation.items[0]?.id });
      }
    }
    const donationItemId = received.items[0]?.id;
    const distributedItemId = requests.find((r) => r.status === 'DISTRIBUTED')?.itemId;
    const scheduledItemId = requests.find((r) => r.status === 'SCHEDULED')?.itemId;
    if (!donationItemId || !distributedItemId || !scheduledItemId)
      throw new Error('Demo items missing.');
    // Fixed fixture snapshots: receipt 30, reserve 10, hand over 5 -> 20/5/5.
    const movements = [
      {
        type: 'DONATION_IN' as const,
        quantity: 30,
        availableAfter: 30,
        reservedAfter: 0,
        distributedAfter: 0,
        donationItemId,
      },
      {
        type: 'RESERVE' as const,
        quantity: 5,
        availableAfter: 25,
        reservedAfter: 5,
        distributedAfter: 0,
        distributionItemId: distributedItemId,
      },
      {
        type: 'DISTRIBUTE' as const,
        quantity: 5,
        availableAfter: 25,
        reservedAfter: 0,
        distributedAfter: 5,
        distributionItemId: distributedItemId,
      },
      {
        type: 'RESERVE' as const,
        quantity: 5,
        availableAfter: 20,
        reservedAfter: 5,
        distributedAfter: 5,
        distributionItemId: scheduledItemId,
      },
    ];
    for (const [index, movement] of movements.entries()) {
      await tx.inventoryMovement.create({
        data: {
          ...movement,
          inventoryItemId: stock.id,
          createdAt: new Date(yesterday.getTime() + index * 1000),
        },
      });
    }
    return { campaignId: campaign.id, created: true };
  });
}
