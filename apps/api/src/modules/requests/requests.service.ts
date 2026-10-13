import { randomInt } from 'node:crypto';
import {
  NotificationType,
  RequestStatus,
  REQUEST_TRANSITIONS,
  assertNever,
  requestStatusMessage,
  type RequestStatus as RequestStatusType,
} from '@agapay/shared';
import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../../types/express.js';
import type {
  ApproveRequestInput,
  AssistanceRequestDto,
  CancelRequestInput,
  RejectRequestInput,
  RequestListQuery,
} from '@agapay/shared';
import type { SubmitRequestInput, TrackRequestInput } from '@agapay/shared';
import { prisma, txOptions } from '../../lib/prisma.js';
import { withRetry } from '../../lib/retry.js';
import type { Clock } from '../../lib/clock.js';
import {
  AppError,
  businessRuleViolation,
  internal,
  invalidTransition,
  notFound,
} from '../../lib/errors.js';
import { nextSequence } from '../../lib/sequence.js';
import { write as writeAudit } from '../audit/audit.service.js';
import { signRequestVerifyToken, verifyRequestVerifyToken } from './request-tokens.js';

export const REQUEST_VERIFY_PATH = '/verify-request';

const ACTIVE_REQUEST_STATUSES: readonly RequestStatusType[] = [
  RequestStatus.PENDING,
  RequestStatus.UNDER_REVIEW,
  RequestStatus.APPROVED,
  RequestStatus.SCHEDULED,
];

const IP_BURST_THRESHOLD = 5;
const IP_BURST_WINDOW_MS = 60 * 60 * 1000;
const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TRACKING_CODE_LENGTH = 8;

function canTransition(from: RequestStatusType, to: RequestStatusType): boolean {
  const allowed: readonly RequestStatusType[] = REQUEST_TRANSITIONS[from];
  return allowed.includes(to);
}

function requestReference(year: number, value: number): string {
  return `REQ-${year}-${String(value).padStart(6, '0')}`;
}

function randomTrackingCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < TRACKING_CODE_LENGTH; i += 1) {
    const ch: string | undefined = TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
    if (ch === undefined) throw internal('Tracking code alphabet misconfigured.');
    chars.push(ch);
  }
  return `TRK-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

async function mintTrackingNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomTrackingCode();
    const existing = await tx.assistanceRequest.findUnique({
      where: { trackingNumber: candidate },
      select: { id: true },
    });
    if (existing === null) return candidate;
  }
  throw internal('Could not mint a unique tracking number.');
}

type DetailRow = {
  id: string;
  referenceNumber: string;
  trackingNumber: string | null;
  fullName: string;
  email: string;
  contactNumber: string;
  barangay: string;
  city: string;
  province: string;
  householdSize: number | null;
  campaignId: string;
  status: RequestStatusType;
  notes: string | null;
  rejectionReason: string | null;
  outsideCampaignArea: boolean;
  possibleDuplicate: boolean;
  emailVerifiedAt: Date | null;
  consentAt: Date;
  submittedAt: Date;
  reviewedById: string | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  campaign: { name: string };
  items: {
    id: string;
    itemTypeId: string;
    customName: string | null;
    quantity: number;
    itemType: { name: string; unit: string };
  }[];
  statusEvents: {
    fromStatus: RequestStatusType | null;
    toStatus: RequestStatusType;
    actorId: string | null;
    note: string | null;
    createdAt: Date;
  }[];
  distributions: { id: string; status: string; calendarEventId: string }[];
};

function toDto(row: DetailRow): AssistanceRequestDto {
  return {
    id: row.id,
    referenceNumber: row.referenceNumber,
    trackingNumber: row.trackingNumber,
    fullName: row.fullName,
    email: row.email,
    contactNumber: row.contactNumber,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    householdSize: row.householdSize,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    status: row.status,
    notes: row.notes,
    rejectionReason: row.rejectionReason,
    outsideCampaignArea: row.outsideCampaignArea,
    possibleDuplicate: row.possibleDuplicate,
    emailVerified: row.emailVerifiedAt !== null,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt === null ? null : row.reviewedAt.toISOString(),
    approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      itemTypeId: item.itemTypeId,
      itemTypeName: item.itemType.name,
      unit: item.itemType.unit,
      customName: item.customName,
      quantity: item.quantity,
    })),
    timeline: row.statusEvents.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorId: event.actorId,
      note: event.note,
      at: event.createdAt.toISOString(),
    })),
    distributions: row.distributions.map((dist) => ({
      id: dist.id,
      status: dist.status,
      calendarEventId: dist.calendarEventId,
    })),
  };
}

const detailInclude = {
  campaign: { select: { name: true } },
  items: {
    include: { itemType: { select: { name: true, unit: true } } },
    orderBy: { id: 'asc' as const },
  },
  statusEvents: { orderBy: { createdAt: 'asc' as const } },
  distributions: { select: { id: true, status: true, calendarEventId: true } },
} as const;

async function getDetail(id: string): Promise<AssistanceRequestDto> {
  const row = await prisma.assistanceRequest.findUnique({ where: { id }, include: detailInclude });
  if (row === null) throw notFound('Assistance request');
  return toDto(row);
}

function normalizeLocation(value: string): string {
  return value.trim().toLowerCase();
}

function prismaErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export async function submitPublic(
  input: SubmitRequestInput,
  submitIpHash: string | undefined,
  clock: Clock,
): Promise<{ referenceNumber: string; status: RequestStatusType }> {
  const now = clock.now();
  let id: string;
  try {
    id = await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const campaign = await tx.campaign.findUnique({
          where: { id: input.campaignId },
          select: { id: true, status: true, areas: true },
        });
        if (campaign === null) throw notFound('Campaign');
        if (campaign.status !== 'ACTIVE') {
          throw businessRuleViolation('This campaign is not accepting requests right now.');
        }

        const uniqueIds = [...new Set(input.items.map((item) => item.itemTypeId))];
        const itemTypes = await tx.itemType.findMany({
          where: { id: { in: uniqueIds } },
          select: {
            id: true,
            name: true,
            isActive: true,
            maxPerRequest: true,
            perHouseholdMember: true,
          },
        });
        if (itemTypes.length !== uniqueIds.length || itemTypes.some((row) => !row.isActive)) {
          throw businessRuleViolation('One or more item types are unknown or inactive.');
        }
        const household = input.householdSize ?? 1;
        for (const item of input.items) {
          const known = itemTypes.find((row) => row.id === item.itemTypeId);
          if (known === undefined) throw internal('Item type vanished inside its own transaction.');
          if (known.maxPerRequest !== null && item.quantity > known.maxPerRequest) {
            throw businessRuleViolation(
              `${known.name} allows at most ${known.maxPerRequest} per request.`,
            );
          }
          if (
            known.perHouseholdMember !== null &&
            item.quantity > known.perHouseholdMember * household
          ) {
            throw businessRuleViolation(
              `${known.name} allows at most ${known.perHouseholdMember * household} for a household of ${household}.`,
            );
          }
        }

        const duplicate = await tx.assistanceRequest.findFirst({
          where: {
            campaignId: input.campaignId,
            status: { in: [...ACTIVE_REQUEST_STATUSES] },
            email: input.email,
          },
          select: { id: true },
        });
        if (duplicate !== null) {
          throw new AppError(
            'DUPLICATE_ACTIVE_REQUEST',
            'This email already has an active request for this campaign.',
          );
        }

        const priorMatch = await tx.assistanceRequest.findFirst({
          where: {
            campaignId: input.campaignId,
            OR: [{ email: input.email }, { contactNumber: input.contactNumber }],
          },
          select: { id: true },
        });
        let possibleDuplicate = priorMatch !== null;
        if (submitIpHash !== undefined) {
          const burst = await tx.assistanceRequest.count({
            where: {
              campaignId: input.campaignId,
              submitIpHash,
              submittedAt: { gte: new Date(now.getTime() - IP_BURST_WINDOW_MS) },
              status: { in: [RequestStatus.PENDING, RequestStatus.UNDER_REVIEW] },
            },
          });
          if (burst >= IP_BURST_THRESHOLD) possibleDuplicate = true;
        }

        const outsideCampaignArea =
          campaign.areas.length > 0 &&
          !campaign.areas.some(
            (area) =>
              normalizeLocation(area.barangay) === normalizeLocation(input.barangay) &&
              normalizeLocation(area.city) === normalizeLocation(input.city) &&
              normalizeLocation(area.province) === normalizeLocation(input.province),
          );

        const referenceNumber = requestReference(
          now.getUTCFullYear(),
          await nextSequence(tx, `REQ-${now.getUTCFullYear()}`),
        );
        const created = await tx.assistanceRequest.create({
          data: {
            referenceNumber,
            fullName: input.fullName,
            email: input.email,
            contactNumber: input.contactNumber,
            barangay: input.barangay,
            city: input.city,
            province: input.province,
            householdSize: input.householdSize ?? null,
            campaignId: input.campaignId,
            status: RequestStatus.PENDING,
            notes: input.notes ?? null,
            outsideCampaignArea,
            possibleDuplicate,
            consentAt: now,
            submitIpHash: submitIpHash ?? null,
            items: {
              create: input.items.map((item) => ({
                itemTypeId: item.itemTypeId,
                customName: item.customName ?? null,
                quantity: item.quantity,
              })),
            },
          },
          select: { id: true },
        });

        await tx.requestStatusEvent.create({
          data: { requestId: created.id, fromStatus: null, toStatus: RequestStatus.PENDING },
        });

        const verifyToken = await signRequestVerifyToken(
          { requestId: created.id, email: input.email },
          { now: () => now },
        );
        await tx.emailNotification.create({
          data: {
            type: NotificationType.REQUEST_RECEIVED,
            toEmail: input.email,
            subject: 'We received your assistance request',
            templateData: { name: input.fullName, referenceNumber },
            priority: 2,
            relatedRequestId: created.id,
            dedupeKey: `request-received:${created.id}`,
          },
        });
        await tx.emailNotification.create({
          data: {
            type: NotificationType.REQUEST_VERIFY_EMAIL,
            toEmail: input.email,
            subject: 'Confirm your email for your assistance request',
            templateData: { name: input.fullName, token: verifyToken },
            priority: 2,
            relatedRequestId: created.id,
            dedupeKey: `request-verify:${created.id}`,
          },
        });
        return created.id;
      }, txOptions),
    );
  } catch (err) {
    if (prismaErrorCode(err) === 'P2002') {
      throw new AppError(
        'DUPLICATE_ACTIVE_REQUEST',
        'This email already has an active request for this campaign.',
      );
    }
    throw err;
  }

  const row = await prisma.assistanceRequest.findUnique({
    where: { id },
    select: { referenceNumber: true },
  });
  if (row === null) throw internal('Request vanished inside its own transaction.');
  return { referenceNumber: row.referenceNumber, status: RequestStatus.PENDING };
}

export async function verifyRequestEmail(
  token: string,
  clock: Clock,
): Promise<{ verified: boolean }> {
  const claims = await verifyRequestVerifyToken(token, clock);
  const request = await prisma.assistanceRequest.findUnique({
    where: { id: claims.requestId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (request === null || request.email !== claims.email) throw notFound('Verification link');
  if (request.emailVerifiedAt !== null) return { verified: true };
  await prisma.assistanceRequest.update({
    where: { id: request.id },
    data: { emailVerifiedAt: clock.now() },
  });
  return { verified: true };
}

export async function track(input: TrackRequestInput): Promise<{
  code: string;
  campaignName: string;
  status: RequestStatusType;
  statusMessage: string;
  submittedAt: string;
  timeline: { status: string; at: string }[];
  distribution: null;
  rejectionReason: string | null;
}> {
  const code = input.code.trim().toUpperCase();
  const row = await prisma.assistanceRequest.findFirst({
    where: {
      email: input.email,
      OR: [{ referenceNumber: code }, { trackingNumber: code }],
    },
    include: {
      campaign: { select: { name: true } },
      statusEvents: { orderBy: { createdAt: 'asc' as const } },
    },
  });
  if (row === null) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    throw notFound('No request found for those details.');
  }
  return {
    code: row.trackingNumber ?? row.referenceNumber,
    campaignName: row.campaign.name,
    status: row.status,
    statusMessage: requestStatusMessage(row.status),
    submittedAt: row.submittedAt.toISOString(),
    timeline: row.statusEvents.map((event) => ({
      status: event.toStatus,
      at: event.createdAt.toISOString(),
    })),
    distribution: null,
    rejectionReason: row.rejectionReason,
  };
}

export async function queueList(query: RequestListQuery): Promise<{
  items: AssistanceRequestDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const where = {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
    ...(query.barangay === undefined
      ? {}
      : { barangay: { contains: query.barangay, mode: 'insensitive' as const } }),
    ...(query.flag === undefined
      ? {}
      : query.flag === 'duplicate'
        ? { possibleDuplicate: true }
        : query.flag === 'outsideArea'
          ? { outsideCampaignArea: true }
          : { emailVerifiedAt: null }),
    ...(query.q === undefined
      ? {}
      : {
          OR: [
            { referenceNumber: { contains: query.q, mode: 'insensitive' as const } },
            { fullName: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
            { contactNumber: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }),
  };
  const [rows, total] = await Promise.all([
    prisma.assistanceRequest.findMany({
      where,
      include: detailInclude,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.assistanceRequest.count({ where }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function detail(id: string): Promise<AssistanceRequestDto> {
  return getDetail(id);
}

export function awaitingStock(): Promise<{
  items: AssistanceRequestDto[];
  page: number;
  pageSize: number;
  total: number;
}> {
  return Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 });
}

async function transition(
  id: string,
  to: RequestStatusType,
  actor: AuthContext,
  clock: Clock,
  auditAction: string,
  options?: {
    note?: string | undefined;
    prepare?: (
      tx: Prisma.TransactionClient,
    ) => Promise<Prisma.AssistanceRequestUpdateManyMutationInput>;
    after?: (tx: Prisma.TransactionClient) => Promise<void>;
  },
): Promise<AssistanceRequestDto> {
  const existing = await prisma.assistanceRequest.findUnique({
    where: { id },
    select: { status: true },
  });
  if (existing === null) throw notFound('Assistance request');
  if (!canTransition(existing.status, to)) throw invalidTransition(existing.status, to);

  const now = clock.now();
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const extra = options?.prepare !== undefined ? await options.prepare(tx) : {};
      const claimed = await tx.assistanceRequest.updateMany({
        where: { id, status: existing.status },
        data: { ...statusTimestamp(to, actor, now), ...extra },
      });
      if (claimed.count === 0) throw invalidTransition(existing.status, to);
      await tx.requestStatusEvent.create({
        data: {
          requestId: id,
          fromStatus: existing.status,
          toStatus: to,
          actorId: actor.userId,
          note: options?.note ?? null,
        },
      });
      if (options?.after !== undefined) await options.after(tx);
      await writeAudit(tx, actor, {
        action: auditAction,
        entityType: 'AssistanceRequest',
        entityId: id,
        metadata: { from: existing.status },
      });
    }, txOptions),
  );

  return getDetail(id);
}

function statusTimestamp(
  to: RequestStatusType,
  actor: AuthContext,
  now: Date,
): {
  status: RequestStatusType;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
} {
  switch (to) {
    case RequestStatus.UNDER_REVIEW:
      return { status: to, reviewedById: actor.userId, reviewedAt: now };
    case RequestStatus.PENDING:
      return { status: to, reviewedById: null, reviewedAt: null };
    case RequestStatus.APPROVED:
      return { status: to, approvedAt: now };
    case RequestStatus.REJECTED:
    case RequestStatus.CANCELLED:
    case RequestStatus.SCHEDULED:
    case RequestStatus.DISTRIBUTED:
      return { status: to };
    default:
      return assertNever(to);
  }
}

export async function claim(
  id: string,
  actor: AuthContext,
  clock: Clock,
): Promise<AssistanceRequestDto> {
  return transition(id, RequestStatus.UNDER_REVIEW, actor, clock, 'request.claim');
}

export async function release(
  id: string,
  actor: AuthContext,
  clock: Clock,
): Promise<AssistanceRequestDto> {
  return transition(id, RequestStatus.PENDING, actor, clock, 'request.release');
}

export async function approve(
  id: string,
  input: ApproveRequestInput,
  actor: AuthContext,
  clock: Clock,
): Promise<AssistanceRequestDto> {
  return transition(id, RequestStatus.APPROVED, actor, clock, 'request.approve', {
    note: input.note,
    prepare: async (tx) => ({ trackingNumber: await mintTrackingNumber(tx) }),
    after: async (tx) => {
      const row = await tx.assistanceRequest.findUniqueOrThrow({
        where: { id },
        select: {
          referenceNumber: true,
          trackingNumber: true,
          fullName: true,
          email: true,
          campaign: { select: { name: true } },
          items: { include: { itemType: { select: { name: true } } } },
        },
      });
      if (row.trackingNumber === null) throw internal('Tracking number vanished after minting.');
      if (row.trackingNumber === null) throw internal('Tracking number vanished after minting.');
      await tx.emailNotification.create({
        data: {
          type: NotificationType.REQUEST_APPROVED,
          toEmail: row.email,
          subject: 'Your assistance request was approved',
          templateData: {
            name: row.fullName,
            referenceNumber: row.referenceNumber,
            trackingNumber: row.trackingNumber,
            campaignName: row.campaign.name,
            items: row.items.map((item) => ({ name: item.itemType.name, quantity: item.quantity })),
          },
          priority: 1,
          relatedRequestId: id,
          dedupeKey: `request-approved:${id}`,
        },
      });
    },
  });
}

export async function reject(
  id: string,
  input: RejectRequestInput,
  actor: AuthContext,
  clock: Clock,
): Promise<AssistanceRequestDto> {
  return transition(id, RequestStatus.REJECTED, actor, clock, 'request.reject', {
    prepare: () => Promise.resolve({ rejectionReason: input.reason }),
    after: async (tx) => {
      const row = await tx.assistanceRequest.findUniqueOrThrow({
        where: { id },
        select: { referenceNumber: true, fullName: true, email: true },
      });
      await tx.emailNotification.create({
        data: {
          type: NotificationType.REQUEST_REJECTED,
          toEmail: row.email,
          subject: 'Update on your assistance request',
          templateData: {
            name: row.fullName,
            referenceNumber: row.referenceNumber,
            reason: input.reason,
          },
          priority: 1,
          relatedRequestId: id,
          dedupeKey: `request-rejected:${id}`,
        },
      });
    },
  });
}

export async function cancel(
  id: string,
  input: CancelRequestInput,
  actor: AuthContext,
  clock: Clock,
): Promise<AssistanceRequestDto> {
  return transition(id, RequestStatus.CANCELLED, actor, clock, 'request.cancel', {
    prepare: () => Promise.resolve({ rejectionReason: input.reason }),
  });
}
