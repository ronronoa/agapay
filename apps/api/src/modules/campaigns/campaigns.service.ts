import { CampaignStatus } from '@agapay/shared';
import type { CampaignStatus as CampaignStatusType } from '@agapay/shared';
import type { Prisma } from '@prisma/client';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import { businessRuleViolation, conflict, invalidTransition, notFound } from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { write as writeAudit } from '../audit/audit.service.js';
import type { AuthContext } from '../../types/express.js';
import {
  CAMPAIGN_TRANSITIONS,
  type CampaignDto,
  type CampaignListQuery,
  type CampaignTransitionTarget,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from '@agapay/shared';

const campaignInclude = {
  areas: {
    orderBy: [{ province: 'asc' as const }, { city: 'asc' as const }, { barangay: 'asc' as const }],
  },
  priorityItems: { include: { itemType: { select: { name: true, unit: true } } } },
  _count: { select: { donations: true, requests: true, events: true, inventoryItems: true } },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function canTransition(from: CampaignStatusType, to: CampaignStatusType): boolean {
  const allowed: readonly CampaignStatusType[] = CAMPAIGN_TRANSITIONS[from];
  return allowed.includes(to);
}

function toDto(row: {
  id: string;
  name: string;
  slug: string;
  description: string;
  calamityType: string;
  status: CampaignStatusType;
  isSystem: boolean;
  startDate: Date;
  endDate: Date | null;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  areas: { id: string; barangay: string; city: string; province: string }[];
  priorityItems: {
    itemTypeId: string;
    targetQuantity: number | null;
    itemType: { name: string; unit: string };
  }[];
  _count: { donations: number; requests: number; events: number; inventoryItems: number };
}): CampaignDto {
  const dependents =
    row._count.donations + row._count.requests + row._count.events + row._count.inventoryItems;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    calamityType: row.calamityType,
    status: row.status,
    isSystem: row.isSystem,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate === null ? null : row.endDate.toISOString(),
    coverImageUrl: row.coverImageUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    areas: row.areas,
    priorityItems: row.priorityItems.map((item) => ({
      itemTypeId: item.itemTypeId,
      itemName: item.itemType.name,
      unit: item.itemType.unit,
      targetQuantity: item.targetQuantity,
    })),
    donationCount: row._count.donations,
    requestCount: row._count.requests,
    eventCount: row._count.events,
    inventoryCount: row._count.inventoryItems,
    deletable: !row.isSystem && row.status === CampaignStatus.DRAFT && dependents === 0,
  };
}

export async function list(query: CampaignListQuery): Promise<{
  items: CampaignDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.calamityType === undefined ? {} : { calamityType: query.calamityType }),
    ...(query.q === undefined
      ? {}
      : {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { slug: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }),
  };

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: campaignInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.campaign.count({ where }),
  ]);

  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function getById(id: string): Promise<CampaignDto> {
  const row = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude });
  if (row === null) throw notFound('Campaign');
  return { ...toDto(row), closureBlockers: await closureBlockers(prisma, id) };
}

export async function getBySlug(slug: string): Promise<CampaignDto> {
  const row = await prisma.campaign.findUnique({ where: { slug }, include: campaignInclude });
  if (row === null) throw notFound('Campaign');
  return toDto(row);
}

// A cover image is display-only: no counters change and no email is queued.
// Returns the previous URL so the route can remove the replaced file.
export async function setCoverImage(
  id: string,
  imageUrl: string,
  actor: AuthContext,
): Promise<{ previousImageUrl: string | null; campaign: CampaignDto }> {
  return prisma.$transaction(async (tx) => {
    const existing = await lockCampaign(tx, id);
    if (existing.isSystem)
      throw businessRuleViolation('The General Pool is managed by the system.');
    await tx.campaign.update({ where: { id }, data: { coverImageUrl: imageUrl } });
    await writeAudit(tx, actor, {
      action: 'campaign.image',
      entityType: 'Campaign',
      entityId: id,
      metadata: { replaced: existing.coverImageUrl !== null },
    });
    const row = await tx.campaign.findUniqueOrThrow({ where: { id }, include: campaignInclude });
    return { previousImageUrl: existing.coverImageUrl, campaign: toDto(row) };
  }, txOptions);
}

export async function create(
  input: CreateCampaignInput,
  actor: AuthContext,
  clock: Clock,
): Promise<CampaignDto> {
  const baseSlug = slugify(input.name);
  if (baseSlug.length === 0) {
    throw businessRuleViolation('Campaign name must contain letters or numbers.');
  }

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({
      data: {
        name: input.name,
        slug: `${baseSlug}-${randomSuffix()}`,
        description: input.description,
        calamityType: input.calamityType,
        status: CampaignStatus.DRAFT,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        createdById: actor.userId,
      },
      select: { id: true },
    });

    if (input.areas.length > 0) await replaceAreas(tx, created.id, input.areas);
    if (input.priorityItems.length > 0) {
      await replacePriorityItems(tx, created.id, input.priorityItems);
    }

    await writeAudit(tx, actor, {
      action: 'campaign.create',
      entityType: 'Campaign',
      entityId: created.id,
      metadata: { name: input.name, calamityType: input.calamityType },
    });

    return created.id;
  }, txOptions);

  void clock;
  return getById(id);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

interface AreaInput {
  barangay: string;
  city: string;
  province: string;
}

async function replaceAreas(
  tx: Prisma.TransactionClient,
  campaignId: string,
  areas: readonly AreaInput[],
): Promise<void> {
  await tx.campaignArea.deleteMany({ where: { campaignId } });
  for (const area of areas) {
    await tx.campaignArea.create({ data: { campaignId, ...area } });
  }
}

interface PriorityInput {
  itemTypeId: string;
  targetQuantity?: number | null | undefined;
}

async function replacePriorityItems(
  tx: Prisma.TransactionClient,
  campaignId: string,
  items: readonly PriorityInput[],
): Promise<void> {
  const unique = new Map<string, PriorityInput>();
  for (const item of items) unique.set(item.itemTypeId, item);

  const known = await tx.itemType.findMany({
    where: { id: { in: [...unique.keys()] } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((row) => row.id));
  const unknown = [...unique.keys()].filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw businessRuleViolation(`Unknown item type: ${unknown[0]}`);
  }

  await tx.campaignPriorityItem.deleteMany({ where: { campaignId } });
  for (const item of unique.values()) {
    await tx.campaignPriorityItem.create({
      data: {
        campaignId,
        itemTypeId: item.itemTypeId,
        targetQuantity: item.targetQuantity ?? null,
      },
    });
  }
}

export async function update(
  id: string,
  input: UpdateCampaignInput,
  actor: AuthContext,
): Promise<CampaignDto> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await lockCampaign(tx, id);
      checkVersion(existing.updatedAt, input.expectedUpdatedAt);
      if (existing.isSystem)
        throw businessRuleViolation('The General Pool is managed by the system.');
      const nextStart = input.startDate ?? existing.startDate;
      const nextEnd = input.endDate === undefined ? existing.endDate : input.endDate;
      if (nextEnd !== null && nextEnd <= nextStart)
        throw businessRuleViolation('End date must be after start date.');
      await tx.campaign.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.calamityType === undefined ? {} : { calamityType: input.calamityType }),
          ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
          ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
          ...(input.coverImageUrl === undefined ? {} : { coverImageUrl: input.coverImageUrl }),
        },
      });

      if (input.areas !== undefined) await replaceAreas(tx, id, input.areas);
      if (input.priorityItems !== undefined) {
        await replacePriorityItems(tx, id, input.priorityItems);
      }

      await writeAudit(tx, actor, {
        action: 'campaign.update',
        entityType: 'Campaign',
        entityId: id,
        metadata: {
          areasReplaced: input.areas !== undefined,
          priorityItemsReplaced: input.priorityItems !== undefined,
        },
      });
    }, txOptions),
  ).then(() => getById(id));
}

// Shared by campaign edits/closure and new operational submissions. The row
// lock makes eligibility checks and related inserts observe one campaign state.
export async function lockCampaign(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${id} FOR UPDATE`;
  const campaign = await tx.campaign.findUnique({ where: { id } });
  if (campaign === null) throw notFound('Campaign');
  return campaign;
}

function checkVersion(updatedAt: Date, expected?: string): void {
  if (expected !== undefined && updatedAt.toISOString() !== expected)
    throw conflict('This campaign changed. Refresh and review it before trying again.');
}

async function closureBlockers(tx: Prisma.TransactionClient, id: string) {
  const [donations, requests, events, allocations, stock] = await Promise.all([
    tx.donation.count({
      where: { campaignId: id, status: { in: ['PENDING', 'VERIFIED', 'SCHEDULED', 'COLLECTED'] } },
    }),
    tx.assistanceRequest.count({
      where: {
        campaignId: id,
        status: { in: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED'] },
      },
    }),
    tx.calendarEvent.count({ where: { campaignId: id, status: 'SCHEDULED' } }),
    tx.distribution.count({ where: { request: { campaignId: id }, status: 'SCHEDULED' } }),
    tx.inventoryItem.aggregate({ where: { campaignId: id }, _sum: { reserved: true } }),
  ]);
  return [
    { blocking: 'donations' as const, count: donations },
    { blocking: 'requests' as const, count: requests },
    { blocking: 'events' as const, count: events },
    { blocking: 'allocations' as const, count: allocations },
    { blocking: 'reservedGoods' as const, count: stock._sum.reserved ?? 0 },
  ].filter((row) => row.count > 0);
}

export async function transition(
  id: string,
  to: CampaignTransitionTarget,
  actor: AuthContext,
  clock: Clock,
  expectedUpdatedAt?: string,
): Promise<CampaignDto> {
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await lockCampaign(tx, id);
      checkVersion(existing.updatedAt, expectedUpdatedAt);
      // BR-CAM-02: the system pool is reference data, never a lifecycle target.
      if (existing.isSystem)
        throw businessRuleViolation('The General Pool campaign cannot be completed or archived.');
      if (!canTransition(existing.status, to)) throw invalidTransition(existing.status, to);
      if (to !== CampaignStatus.ACTIVE) {
        const blockers = await closureBlockers(tx, id);
        if (blockers.length)
          throw conflict('Resolve outstanding campaign work before closing this campaign.', {
            blockers,
          });
      }
      const claimed = await tx.campaign.updateMany({
        where: { id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: to, updatedAt: clock.now() },
      });
      if (claimed.count !== 1)
        throw conflict('This campaign changed. Refresh before trying again.');
      await writeAudit(tx, actor, {
        action: `campaign.${to.toLowerCase()}`,
        entityType: 'Campaign',
        entityId: id,
        metadata: { from: existing.status, to },
      });
    }, txOptions),
  );
  return getById(id);
}

export async function remove(
  id: string,
  actor: AuthContext,
  expectedUpdatedAt?: string,
): Promise<string | null> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await lockCampaign(tx, id);
      checkVersion(existing.updatedAt, expectedUpdatedAt);
      if (existing.isSystem)
        throw businessRuleViolation('The General Pool campaign cannot be deleted.');
      const row = await tx.campaign.findUniqueOrThrow({ where: { id }, include: campaignInclude });
      if (!toDto(row).deletable)
        throw conflict(
          'Only unused draft campaigns can be deleted. Preserve history by archiving instead.',
        );
      await tx.campaign.delete({ where: { id } });
      await writeAudit(tx, actor, {
        action: 'campaign.delete',
        entityType: 'Campaign',
        entityId: id,
      });
      return existing.coverImageUrl;
    }, txOptions),
  );
}
