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
    deletable: !row.isSystem && dependents === 0,
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
  return toDto(row);
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
  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, coverImageUrl: true },
  });
  if (existing === null) throw notFound('Campaign');

  await prisma.campaign.update({ where: { id }, data: { coverImageUrl: imageUrl } });
  await writeAudit(prisma, actor, {
    action: 'campaign.image',
    entityType: 'Campaign',
    entityId: id,
    metadata: { replaced: existing.coverImageUrl !== null },
  });
  return { previousImageUrl: existing.coverImageUrl, campaign: await getById(id) };
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
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
  if (existing === null) throw notFound('Campaign');

  const nextStart = input.startDate;
  const nextEnd = input.endDate;
  if (
    nextStart !== undefined &&
    nextEnd !== undefined &&
    nextEnd !== null &&
    nextEnd <= nextStart
  ) {
    throw businessRuleViolation('endDate must be after startDate');
  }

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
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

export async function transition(
  id: string,
  to: CampaignTransitionTarget,
  actor: AuthContext,
  clock: Clock,
): Promise<CampaignDto> {
  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: { status: true, isSystem: true },
  });
  if (existing === null) throw notFound('Campaign');

  // BR-CAM-02: the system pool is reference data, never a lifecycle target.
  if (existing.isSystem && to !== CampaignStatus.ACTIVE) {
    throw businessRuleViolation('The General Pool campaign cannot be completed or archived.');
  }
  if (!canTransition(existing.status, to)) {
    throw invalidTransition(existing.status, to);
  }

  const claimed = await prisma.campaign.updateMany({
    where: { id, status: existing.status },
    data: { status: to },
  });
  if (claimed.count === 0) throw invalidTransition(existing.status, to);

  await writeAudit(prisma, actor, {
    action: `campaign.${to.toLowerCase()}`,
    entityType: 'Campaign',
    entityId: id,
    metadata: { from: existing.status, to },
  });
  void clock;
  return getById(id);
}

export async function remove(id: string, actor: AuthContext): Promise<void> {
  const existing = await prisma.campaign.findUnique({
    where: { id },
    select: {
      isSystem: true,
      _count: { select: { donations: true, requests: true, events: true, inventoryItems: true } },
    },
  });
  if (existing === null) throw notFound('Campaign');
  if (existing.isSystem) {
    throw businessRuleViolation('The General Pool campaign cannot be deleted.');
  }

  // BR-CAM-03: a campaign carrying real history is archived, never deleted.
  const blockers: { blocking: string; count: number }[] = [];
  if (existing._count.donations > 0) {
    blockers.push({ blocking: 'donations', count: existing._count.donations });
  }
  if (existing._count.requests > 0) {
    blockers.push({ blocking: 'requests', count: existing._count.requests });
  }
  if (existing._count.events > 0) {
    blockers.push({ blocking: 'events', count: existing._count.events });
  }
  if (existing._count.inventoryItems > 0) {
    blockers.push({ blocking: 'inventoryItems', count: existing._count.inventoryItems });
  }
  if (blockers.length > 0) {
    throw conflict('This campaign has related records and cannot be deleted. Archive it instead.', {
      blockers,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaign.delete({ where: { id } });
    await writeAudit(tx, actor, {
      action: 'campaign.delete',
      entityType: 'Campaign',
      entityId: id,
    });
  }, txOptions);
}
