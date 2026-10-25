import { z } from 'zod';
import { EmailStatus, NotificationType } from './enums.js';

const emailStatuses = [
  EmailStatus.QUEUED,
  EmailStatus.SENDING,
  EmailStatus.SENT,
  EmailStatus.FAILED,
  EmailStatus.SUPPRESSED,
] as const;

const notificationTypes = [
  NotificationType.SUPPORT_UNREAD,
  NotificationType.DONOR_VERIFY_EMAIL,
  NotificationType.DONOR_PASSWORD_RESET,
  NotificationType.DONATION_SUBMITTED,
  NotificationType.DONATION_VERIFIED,
  NotificationType.DONATION_REJECTED,
  NotificationType.COLLECTION_SCHEDULED,
  NotificationType.COLLECTION_REMINDER,
  NotificationType.REQUEST_RECEIVED,
  NotificationType.REQUEST_VERIFY_EMAIL,
  NotificationType.REQUEST_APPROVED,
  NotificationType.REQUEST_REJECTED,
  NotificationType.REQUEST_STATUS_UPDATED,
  NotificationType.DISTRIBUTION_SCHEDULED,
  NotificationType.DISTRIBUTION_REMINDER,
  NotificationType.DISTRIBUTION_COMPLETED,
  NotificationType.DISTRIBUTION_CANCELLED,
] as const;

export const emailListQuerySchema = z
  .object({
    status: z.enum(emailStatuses).optional(),
    type: z.enum(notificationTypes).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type EmailListQuery = z.infer<typeof emailListQuerySchema>;

export const emailIdParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const emailIdParamsSchema = emailIdParamSchema;
export type EmailIdParam = z.infer<typeof emailIdParamSchema>;
export type EmailIdParams = EmailIdParam;

export const emailDtoSchema = z.object({
  id: z.string(),
  type: z.enum(notificationTypes),
  status: z.enum(emailStatuses),
  toEmail: z.string(),
  subject: z.string(),
  priority: z.number().int(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  providerMessageId: z.string().nullable(),
  relatedRequestId: z.string().nullable(),
  relatedDonationId: z.string().nullable(),
  scheduledFor: z.string(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

export type EmailDto = z.infer<typeof emailDtoSchema>;

export const emailListResponseSchema = z.object({
  data: z.array(emailDtoSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});

export type EmailListResponse = z.infer<typeof emailListResponseSchema>;

export const emailRetryResponseSchema = z.object({
  data: emailDtoSchema,
});

export const emailUsageResponseSchema = z.object({
  data: z.object({
    sentToday: z.number().int(),
    limit: z.number().int(),
    remaining: z.number().int(),
    sentThisHour: z.number().int(),
    hourlyLimit: z.number().int(),
    remainingThisHour: z.number().int(),
  }),
});
