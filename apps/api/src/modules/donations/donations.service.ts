import {
  CalendarEventStatus,
  CalendarEventType,
  DonationStatus,
  DONATION_TRANSITIONS,
  NotificationType,
  type DonationStatus as DonationStatusType,
} from '@agapay/shared';
import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../../types/express.js';
import type {
  CollectDonationInput,
  DonationDto,
  DonationListQuery,
  RejectDonationInput,
  ScheduleDonationInput,
  SubmitDonationInput,
  UpdateDonationInput,
} from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import type { Clock } from '../../lib/clock.js';
import {
  AppError,
  businessRuleViolation,
  conflict,
  forbidden,
  internal,
  invalidTransition,
  notFound,
} from '../../lib/errors.js';
import { donationReference, nextSequence } from '../../lib/sequence.js';
import { write as writeAudit } from '../audit/audit.service.js';
import { addDonationStock } from '../inventory/inventory.service.js';

function canTransition(from: DonationStatusType, to: DonationStatusType): boolean {
  const allowed: readonly DonationStatusType[] = DONATION_TRANSITIONS[from];
  return allowed.includes(to);
}

const detailInclude = {
  items: {
    include: { itemType: { select: { name: true, unit: true, category: true } } },
    orderBy: { id: 'asc' as const },
  },
  campaign: { select: { name: true } },
  donor: { select: { name: true, email: true } },
} as const;

type DetailRow = {
  id: string;
  referenceNumber: string;
  status: DonationStatusType;
  campaignId: string;
  donorId: string;
  preferredDate: Date | null;
  preferredNote: string | null;
  notes: string | null;
  rejectionReason: string | null;
  submittedAt: Date;
  verifiedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;
  campaign: { name: string };
  donor: { name: string; email: string };
  items: {
    id: string;
    itemTypeId: string;
    customName: string | null;
    description: string | null;
    quantityDeclared: number;
    quantityReceived: number | null;
    expiryDate: Date | null;
    itemType: { name: string; unit: string; category: string };
  }[];
};

function toDto(row: DetailRow): DonationDto {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    status: row.status,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    donorId: row.donorId,
    donorName: row.donor.name,
    donorEmail: row.donor.email,
    preferredDate: row.preferredDate === null ? null : row.preferredDate.toISOString(),
    preferredNote: row.preferredNote,
    notes: row.notes,
    rejectionReason: row.rejectionReason,
    items: row.items.map((item) => ({
      id: item.id,
      itemTypeId: item.itemTypeId,
      itemTypeName: item.itemType.name,
      unit: item.itemType.unit,
      customName: item.customName,
      description: item.description,
      quantityDeclared: item.quantityDeclared,
      quantityReceived: item.quantityReceived,
      expiryDate: item.expiryDate === null ? null : item.expiryDate.toISOString(),
    })),
    submittedAt: row.submittedAt.toISOString(),
    verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
    collectedAt: row.collectedAt === null ? null : row.collectedAt.toISOString(),
    completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
  };
}

async function getDetail(id: string): Promise<DonationDto> {
  const row = await prisma.donation.findUnique({ where: { id }, include: detailInclude });
  if (row === null) throw notFound('Donation');
  return toDto(row);
}

interface DonorActor {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

async function requireDonorActor(actor: AuthContext): Promise<DonorActor> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true, email: true, emailVerifiedAt: true, role: true },
  });
  if (user === null) throw notFound('User');
  if (user.role !== 'DONOR') throw forbidden();
  return {
    userId: actor.userId,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

async function requireActiveCampaign(
  tx: Prisma.TransactionClient,
  campaignId: string,
): Promise<{ id: string; name: string }> {
  const campaign = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true },
  });
  if (campaign === null) throw notFound('Campaign');
  if (campaign.status !== 'ACTIVE') {
    throw businessRuleViolation('This campaign is not accepting donations right now.');
  }
  return campaign;
}

async function requireActiveItemTypes(
  tx: Prisma.TransactionClient,
  itemTypeIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(itemTypeIds)];
  const rows = await tx.itemType.findMany({
    where: { id: { in: unique } },
    select: { id: true, isActive: true },
  });
  if (rows.length !== unique.length || rows.some((row) => !row.isActive)) {
    throw businessRuleViolation('One or more item types are unknown or inactive.');
  }
}

export async function submit(
  input: SubmitDonationInput,
  actor: AuthContext,
  clock: Clock,
): Promise<DonationDto> {
  const donor = await requireDonorActor(actor);
  if (!donor.emailVerified) {
    throw new AppError('EMAIL_NOT_VERIFIED', 'Verify your email address before donating.');
  }

  const id = await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const systemPool =
        input.campaignId === undefined
          ? await tx.campaign.findFirst({ where: { isSystem: true }, select: { id: true } })
          : null;
      const campaign =
        input.campaignId === undefined
          ? systemPool
          : await requireActiveCampaign(tx, input.campaignId);
      if (campaign === null) throw internal('General Pool campaign is not seeded.');
      await requireActiveItemTypes(
        tx,
        input.items.map((item) => item.itemTypeId),
      );

      const now = clock.now();
      const referenceNumber = donationReference(
        now.getUTCFullYear(),
        await nextSequence(tx, `DON-${now.getUTCFullYear()}`),
      );
      const created = await tx.donation.create({
        data: {
          referenceNumber,
          donorId: donor.userId,
          campaignId: campaign.id,
          status: DonationStatus.PENDING,
          preferredDate: input.preferredDate ?? null,
          preferredNote: input.preferredNote ?? null,
          notes: input.notes ?? null,
          items: {
            create: input.items.map((item) => ({
              itemTypeId: item.itemTypeId,
              customName: item.customName ?? null,
              description: item.description ?? null,
              quantityDeclared: item.quantityDeclared,
              expiryDate: item.expiryDate ?? null,
            })),
          },
        },
        select: { id: true },
      });

      await tx.emailNotification.create({
        data: {
          type: NotificationType.DONATION_SUBMITTED,
          toEmail: donor.email,
          subject: 'We received your donation',
          templateData: { name: donor.name, referenceNumber },
          priority: 2,
          relatedDonationId: created.id,
          dedupeKey: `donation-submitted:${created.id}`,
        },
      });
      await writeAudit(tx, actor, {
        action: 'donation.submit',
        entityType: 'Donation',
        entityId: created.id,
        metadata: { referenceNumber, campaignId: campaign.id, itemCount: input.items.length },
      });
      return created.id;
    }, txOptions),
  );

  return getDetail(id);
}

export async function list(
  query: DonationListQuery,
  actor: AuthContext,
): Promise<{ items: DonationDto[]; page: number; pageSize: number; total: number }> {
  const where = {
    ...(actor.role === 'DONOR' ? { donorId: actor.userId } : {}),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
    ...(query.from === undefined && query.to === undefined
      ? {}
      : {
          submittedAt: {
            ...(query.from === undefined ? {} : { gte: query.from }),
            ...(query.to === undefined ? {} : { lte: query.to }),
          },
        }),
    ...(query.q === undefined
      ? {}
      : actor.role === 'DONOR'
        ? { referenceNumber: { contains: query.q, mode: 'insensitive' as const } }
        : {
            OR: [
              { referenceNumber: { contains: query.q, mode: 'insensitive' as const } },
              { donor: { name: { contains: query.q, mode: 'insensitive' as const } } },
              { donor: { email: { contains: query.q, mode: 'insensitive' as const } } },
            ],
          }),
  };
  const [rows, total] = await Promise.all([
    prisma.donation.findMany({
      where,
      include: detailInclude,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.donation.count({ where }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function detail(id: string, actor: AuthContext): Promise<DonationDto> {
  const row = await prisma.donation.findUnique({ where: { id }, include: detailInclude });
  if (row === null) throw notFound('Donation');
  if (actor.role === 'DONOR' && row.donorId !== actor.userId) throw notFound('Donation');
  return toDto(row);
}

export async function edit(
  id: string,
  input: UpdateDonationInput,
  actor: AuthContext,
): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: { donorId: true, status: true },
  });
  if (existing === null || existing.donorId !== actor.userId) throw notFound('Donation');
  if (existing.status !== DonationStatus.PENDING) {
    throw invalidTransition(existing.status, DonationStatus.PENDING);
  }

  await prisma.$transaction(async (tx) => {
    if (input.items !== undefined) {
      await requireActiveItemTypes(
        tx,
        input.items.map((item) => item.itemTypeId),
      );
      await tx.donationItem.deleteMany({ where: { donationId: id } });
      for (const item of input.items) {
        await tx.donationItem.create({
          data: {
            donationId: id,
            itemTypeId: item.itemTypeId,
            customName: item.customName ?? null,
            description: item.description ?? null,
            quantityDeclared: item.quantityDeclared,
            expiryDate: item.expiryDate ?? null,
          },
        });
      }
    }
    await tx.donation.update({
      where: { id },
      data: {
        ...(input.preferredDate === undefined ? {} : { preferredDate: input.preferredDate }),
        ...(input.preferredNote === undefined ? {} : { preferredNote: input.preferredNote }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
    });
    await writeAudit(tx, actor, {
      action: 'donation.edit',
      entityType: 'Donation',
      entityId: id,
      metadata: { itemsReplaced: input.items !== undefined },
    });
  }, txOptions);

  return getDetail(id);
}

export async function cancel(id: string, actor: AuthContext): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: { donorId: true, status: true },
  });
  if (existing === null) throw notFound('Donation');
  if (actor.role === 'DONOR' && existing.donorId !== actor.userId) throw notFound('Donation');
  if (
    existing.status !== DonationStatus.PENDING &&
    existing.status !== DonationStatus.VERIFIED &&
    existing.status !== DonationStatus.SCHEDULED
  ) {
    throw invalidTransition(existing.status, DonationStatus.CANCELLED);
  }

  const claimed = await prisma.donation.updateMany({
    where: { id, status: existing.status },
    data: { status: DonationStatus.CANCELLED },
  });
  if (claimed.count === 0) throw invalidTransition(existing.status, DonationStatus.CANCELLED);
  await writeAudit(prisma, actor, {
    action: 'donation.cancel',
    entityType: 'Donation',
    entityId: id,
    metadata: { from: existing.status },
  });
  return getDetail(id);
}

export async function verify(id: string, actor: AuthContext, clock: Clock): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: { status: true },
  });
  if (existing === null) throw notFound('Donation');
  if (!canTransition(existing.status, DonationStatus.VERIFIED)) {
    throw invalidTransition(existing.status, DonationStatus.VERIFIED);
  }

  const now = clock.now();
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.donation.updateMany({
        where: { id, status: existing.status },
        data: { status: DonationStatus.VERIFIED, verifiedById: actor.userId, verifiedAt: now },
      });
      if (claimed.count === 0) throw invalidTransition(existing.status, DonationStatus.VERIFIED);

      const row = await tx.donation.findUniqueOrThrow({
        where: { id },
        select: { referenceNumber: true, donor: { select: { name: true, email: true } } },
      });
      await tx.emailNotification.create({
        data: {
          type: NotificationType.DONATION_VERIFIED,
          toEmail: row.donor.email,
          subject: 'Your donation was verified',
          templateData: { name: row.donor.name, referenceNumber: row.referenceNumber },
          priority: 2,
          relatedDonationId: id,
          dedupeKey: `donation-verified:${id}`,
        },
      });
      await writeAudit(tx, actor, {
        action: 'donation.verify',
        entityType: 'Donation',
        entityId: id,
        metadata: { from: existing.status },
      });
    }, txOptions),
  );

  return getDetail(id);
}

export async function schedule(
  id: string,
  input: ScheduleDonationInput,
  actor: AuthContext,
): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: { status: true },
  });
  if (existing === null) throw notFound('Donation');
  if (!canTransition(existing.status, DonationStatus.SCHEDULED)) {
    throw invalidTransition(existing.status, DonationStatus.SCHEDULED);
  }
  const event = await prisma.calendarEvent.findUnique({
    where: { id: input.calendarEventId },
    select: { id: true, type: true, status: true, location: true, startAt: true },
  });
  if (event === null) throw notFound('Calendar event');
  if (
    event.status !== CalendarEventStatus.SCHEDULED ||
    event.type !== CalendarEventType.COLLECTION
  ) {
    throw businessRuleViolation('Donations need a scheduled collection event.');
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.donation.updateMany({
        where: { id, status: existing.status },
        data: { status: DonationStatus.SCHEDULED, collectionEventId: event.id },
      });
      if (claimed.count === 0) throw invalidTransition(existing.status, DonationStatus.SCHEDULED);
      const row = await tx.donation.findUniqueOrThrow({
        where: { id },
        select: { referenceNumber: true, donor: { select: { name: true, email: true } } },
      });
      await tx.emailNotification.create({
        data: {
          type: NotificationType.COLLECTION_SCHEDULED,
          toEmail: row.donor.email,
          subject: 'Your donation collection is scheduled',
          templateData: {
            name: row.donor.name,
            referenceNumber: row.referenceNumber,
            location: event.location,
            startAt: event.startAt.toISOString(),
          },
          priority: 2,
          relatedDonationId: id,
          dedupeKey: `collection-scheduled:${id}`,
        },
      });
      await writeAudit(tx, actor, {
        action: 'donation.schedule',
        entityType: 'Donation',
        entityId: id,
        metadata: { from: existing.status, eventId: input.calendarEventId },
      });
    }, txOptions),
  );

  return getDetail(id);
}

export async function reject(
  id: string,
  input: RejectDonationInput,
  actor: AuthContext,
): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: { status: true },
  });
  if (existing === null) throw notFound('Donation');
  if (!canTransition(existing.status, DonationStatus.REJECTED)) {
    throw invalidTransition(existing.status, DonationStatus.REJECTED);
  }

  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.donation.updateMany({
        where: { id, status: existing.status },
        data: { status: DonationStatus.REJECTED, rejectionReason: input.reason },
      });
      if (claimed.count === 0) throw invalidTransition(existing.status, DonationStatus.REJECTED);

      const row = await tx.donation.findUniqueOrThrow({
        where: { id },
        select: { referenceNumber: true, donor: { select: { name: true, email: true } } },
      });
      await tx.emailNotification.create({
        data: {
          type: NotificationType.DONATION_REJECTED,
          toEmail: row.donor.email,
          subject: 'Update on your donation',
          templateData: {
            name: row.donor.name,
            referenceNumber: row.referenceNumber,
            reason: input.reason,
          },
          priority: 1,
          relatedDonationId: id,
          dedupeKey: `donation-rejected:${id}`,
        },
      });
      await writeAudit(tx, actor, {
        action: 'donation.reject',
        entityType: 'Donation',
        entityId: id,
        metadata: { from: existing.status },
      });
    }, txOptions),
  );

  return getDetail(id);
}

const PERISHABLE_CATEGORIES = new Set(['FOOD', 'WATER']);

export async function collect(
  id: string,
  input: CollectDonationInput,
  actor: AuthContext,
  clock: Clock,
): Promise<DonationDto> {
  const existing = await prisma.donation.findUnique({
    where: { id },
    select: {
      status: true,
      campaignId: true,
      items: {
        select: { id: true, itemTypeId: true, itemType: { select: { category: true } } },
      },
    },
  });
  if (existing === null) throw notFound('Donation');
  if (!canTransition(existing.status, DonationStatus.COLLECTED)) {
    throw invalidTransition(existing.status, DonationStatus.COLLECTED);
  }

  const knownItems = new Map(existing.items.map((item) => [item.id, item]));
  let receivedTotal = 0;
  for (const item of input.items) {
    const known = knownItems.get(item.donationItemId);
    if (known === undefined) {
      throw businessRuleViolation('One or more items do not belong to this donation.');
    }
    if (
      PERISHABLE_CATEGORIES.has(known.itemType.category) &&
      item.expiryDate === undefined &&
      item.quantityReceived > 0
    ) {
      throw businessRuleViolation('Food and water items need an expiry date at collection.');
    }
    receivedTotal += item.quantityReceived;
  }

  const now = clock.now();
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.donation.updateMany({
        where: { id, status: existing.status },
        data: { status: DonationStatus.COLLECTED, collectedById: actor.userId, collectedAt: now },
      });
      if (claimed.count === 0) throw invalidTransition(existing.status, DonationStatus.COLLECTED);

      for (const item of input.items) {
        await tx.donationItem.update({
          where: { id: item.donationItemId },
          data: {
            quantityReceived: item.quantityReceived,
            expiryDate: item.expiryDate ?? null,
          },
        });
        const known = knownItems.get(item.donationItemId);
        if (known === undefined)
          throw internal('Donation item vanished inside its own transaction.');
        await addDonationStock(tx, {
          itemTypeId: known.itemTypeId,
          campaignId: existing.campaignId,
          quantity: item.quantityReceived,
          donationItemId: item.donationItemId,
          actorId: actor.userId,
        });
      }

      const finished = await tx.donation.updateMany({
        where: { id, status: DonationStatus.COLLECTED },
        data: { status: DonationStatus.COMPLETED, completedAt: now },
      });
      if (finished.count === 0) {
        throw invalidTransition(DonationStatus.COLLECTED, DonationStatus.COMPLETED);
      }

      await writeAudit(tx, actor, {
        action: 'donation.collect',
        entityType: 'Donation',
        entityId: id,
        metadata: { receivedTotal, itemCount: input.items.length },
      });
    }, txOptions),
  ).catch((err: unknown) => {
    if (err instanceof AppError) throw err;
    const code =
      typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
    if (code === 'P2002') throw conflict('This donation was already processed.');
    throw err;
  });

  return getDetail(id);
}
