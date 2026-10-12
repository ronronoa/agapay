import { z } from 'zod';
import { CalendarEventStatus, CalendarEventType, SyncStatus } from './enums.js';

export const createCalendarEventSchema = z
  .object({
    type: z.enum([
      CalendarEventType.DONATION_DRIVE,
      CalendarEventType.COLLECTION,
      CalendarEventType.DISTRIBUTION,
    ]),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(2000).optional(),
    campaignId: z.string().uuid(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    location: z.string().trim().min(1).max(300),
    capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  })
  .strict()
  .refine((value) => value.endAt > value.startAt, {
    message: 'endAt must be after startAt.',
    path: ['endAt'],
  });

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    location: z.string().trim().min(1).max(300).optional(),
    capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export const calendarEventListQuerySchema = z
  .object({
    type: z
      .enum([
        CalendarEventType.DONATION_DRIVE,
        CalendarEventType.COLLECTION,
        CalendarEventType.DISTRIBUTION,
      ])
      .optional(),
    campaignId: z.string().uuid().optional(),
    status: z
      .enum([
        CalendarEventStatus.SCHEDULED,
        CalendarEventStatus.COMPLETED,
        CalendarEventStatus.CANCELLED,
      ])
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CalendarEventListQuery = z.infer<typeof calendarEventListQuerySchema>;

export const calendarEventDtoSchema = z.object({
  id: z.string(),
  type: z.enum([
    CalendarEventType.DONATION_DRIVE,
    CalendarEventType.COLLECTION,
    CalendarEventType.DISTRIBUTION,
  ]),
  status: z.enum([
    CalendarEventStatus.SCHEDULED,
    CalendarEventStatus.COMPLETED,
    CalendarEventStatus.CANCELLED,
  ]),
  title: z.string(),
  description: z.string().nullable(),
  campaignId: z.string(),
  campaignName: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  location: z.string(),
  capacity: z.number().nullable(),
  syncStatus: z.enum([SyncStatus.NOT_SYNCED, SyncStatus.SYNCED, SyncStatus.FAILED]),
  externalEventId: z.string().nullable(),
  createdAt: z.string(),
});

export type CalendarEventDto = z.infer<typeof calendarEventDtoSchema>;

export const calendarEventResponseSchema = z.object({ data: calendarEventDtoSchema });

export const calendarEventListResponseSchema = z.object({
  data: z.object({
    items: z.array(calendarEventDtoSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
