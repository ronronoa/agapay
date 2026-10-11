import { z } from 'zod';

export const auditListQuerySchema = z
  .object({
    actorId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(60).optional(),
    entityId: z.string().trim().min(1).max(64).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  metadata: z.unknown().nullish(),
  createdAt: z.string(),
});

export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const auditListResponseSchema = z.object({
  data: z.object({
    items: z.array(auditLogSchema),
    nextCursor: z.string().nullable(),
  }),
});

export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
