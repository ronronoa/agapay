import { z } from 'zod';

// `.strict()` so an unknown query key is a 400, not a silently ignored typo (API-03).
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    sort: z.string().min(1).max(50).optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
    q: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ListQuery = z.infer<typeof listQuerySchema>;

export function paginated<T>(data: T[], total: number, query: ListQuery) {
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  };
}
