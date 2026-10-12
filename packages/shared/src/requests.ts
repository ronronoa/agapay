import { z } from 'zod';
import { RequestStatus } from './enums.js';

export const REQUEST_TRANSITIONS = {
  PENDING: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PENDING', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  SCHEDULED: [],
  DISTRIBUTED: [],
  REJECTED: [],
  CANCELLED: [],
} as const satisfies Record<RequestStatus, readonly RequestStatus[]>;

export const requestFlagFilterSchema = z.enum(['duplicate', 'outsideArea', 'unverifiedEmail']);

export type RequestFlagFilter = z.infer<typeof requestFlagFilterSchema>;

export const requestListQuerySchema = z
  .object({
    status: z
      .enum([
        RequestStatus.PENDING,
        RequestStatus.UNDER_REVIEW,
        RequestStatus.APPROVED,
        RequestStatus.SCHEDULED,
        RequestStatus.DISTRIBUTED,
        RequestStatus.REJECTED,
        RequestStatus.CANCELLED,
      ])
      .optional(),
    campaignId: z.string().uuid().optional(),
    barangay: z.string().trim().min(1).max(120).optional(),
    flag: requestFlagFilterSchema.optional(),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

export const approveRequestSchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;

export const rejectRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;

export const cancelRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;

export const requestedItemDtoSchema = z.object({
  id: z.string(),
  itemTypeId: z.string(),
  itemTypeName: z.string(),
  unit: z.string(),
  customName: z.string().nullable(),
  quantity: z.number().int(),
});

export type RequestedItemDto = z.infer<typeof requestedItemDtoSchema>;

export const requestStatusEventDtoSchema = z.object({
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  actorId: z.string().nullable(),
  note: z.string().nullable(),
  at: z.string(),
});

export type RequestStatusEventDto = z.infer<typeof requestStatusEventDtoSchema>;

export const requestDistributionDtoSchema = z.object({
  id: z.string(),
  status: z.string(),
  calendarEventId: z.string(),
});

export type RequestDistributionDto = z.infer<typeof requestDistributionDtoSchema>;

export const assistanceRequestDtoSchema = z.object({
  id: z.string(),
  referenceNumber: z.string(),
  trackingNumber: z.string().nullable(),
  fullName: z.string(),
  email: z.string(),
  contactNumber: z.string(),
  barangay: z.string(),
  city: z.string(),
  province: z.string(),
  householdSize: z.number().int().nullable(),
  campaignId: z.string(),
  campaignName: z.string(),
  status: z.enum([
    RequestStatus.PENDING,
    RequestStatus.UNDER_REVIEW,
    RequestStatus.APPROVED,
    RequestStatus.SCHEDULED,
    RequestStatus.DISTRIBUTED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
  ]),
  notes: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  outsideCampaignArea: z.boolean(),
  possibleDuplicate: z.boolean(),
  emailVerified: z.boolean(),
  submittedAt: z.string(),
  reviewedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  items: z.array(requestedItemDtoSchema),
  timeline: z.array(requestStatusEventDtoSchema),
  distributions: z.array(requestDistributionDtoSchema),
});

export type AssistanceRequestDto = z.infer<typeof assistanceRequestDtoSchema>;

export const assistanceRequestResponseSchema = z.object({ data: assistanceRequestDtoSchema });

export const assistanceRequestListResponseSchema = z.object({
  data: z.object({
    items: z.array(assistanceRequestDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
