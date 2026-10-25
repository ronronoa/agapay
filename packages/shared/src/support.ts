import { z } from 'zod';

export const supportIdSchema = z.object({ id: z.string().uuid() }).strict();
export const supportEmptySchema = z.object({}).strict();
export const supportListQuerySchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    unread: z.enum(['true', 'false']).default('false'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const supportMessagesQuerySchema = z
  .object({
    before: z.coerce.number().int().positive().max(2147483647).optional(),
    after: z.coerce.number().int().min(0).max(2147483647).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((v) => v.before === undefined || v.after === undefined, 'Choose before or after.');
export const sendSupportMessageSchema = z
  .object({
    body: z.string().trim().min(1, 'Enter a message.').max(4000),
    clientMessageId: z.string().uuid(),
  })
  .strict();
export const supportReadSchema = z
  .object({ sequence: z.number().int().min(0).max(2147483647) })
  .strict();
export const supportStatusSchema = z
  .object({ status: z.enum(['OPEN', 'CLOSED']), revision: z.number().int().positive() })
  .strict();
export const conversationSchema = z.object({
  id: z.string().uuid(),
  donorId: z.string().uuid(),
  donorName: z.string(),
  donorEmail: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  revision: z.number().int(),
  lastSequence: z.number().int(),
  lastMessageAt: z.string(),
  unreadCount: z.number().int().nonnegative(),
});
export const supportConversationResponseSchema = z.object({ data: conversationSchema });
export const supportListResponseSchema = z.object({
  data: z.array(conversationSchema),
  meta: z.object({ total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }),
});
export const supportMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sequence: z.number().int(),
  senderId: z.string().uuid(),
  senderName: z.string(),
  senderRole: z.enum(['DONOR', 'STAFF', 'ADMIN', 'SUPER_ADMIN']),
  body: z.string(),
  createdAt: z.string(),
});
export const supportSendResponseSchema = z.object({ data: supportMessageSchema });
export const supportMessagesResponseSchema = z.object({
  data: z.array(supportMessageSchema),
  meta: z.object({
    nextBefore: z.number().int().nullable(),
    nextAfter: z.number().int().nullable(),
  }),
});
export const inboxQuerySchema = z
  .object({
    before: z.string().max(160).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const inboxNotificationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['MESSAGE', 'OPERATION']),
  title: z.string(),
  conversationId: z.string().uuid().nullable(),
  donationId: z.string().uuid().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export const inboxResponseSchema = z.object({
  data: z.array(inboxNotificationSchema),
  meta: z.object({ unreadCount: z.number().int(), nextCursor: z.string().nullable() }),
});
export const liveTopicSchema = z.enum(['messages', 'notifications', 'donations']);
export const liveFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), cursor: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('event'),
    id: z.string().uuid(),
    sequence: z.number().int().positive(),
    topic: liveTopicSchema,
    conversationId: z.string().uuid().nullable(),
  }),
]);
export const liveAuthSchema = z
  .object({
    type: z.literal('authenticate'),
    ticket: z.string().min(32).max(100),
    cursor: z.number().int().min(0).max(2147483647).default(0),
  })
  .strict();
export const socketTicketResponseSchema = z.object({
  data: z.object({ ticket: z.string(), expiresAt: z.string() }),
});
export type SupportListQuery = z.infer<typeof supportListQuerySchema>;
export type SupportMessagesQuery = z.infer<typeof supportMessagesQuerySchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type SupportMessageDto = z.infer<typeof supportMessageSchema>;
export type LiveFrame = z.infer<typeof liveFrameSchema>;
export type LiveTopic = z.infer<typeof liveTopicSchema>;
