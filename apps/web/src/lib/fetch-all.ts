import { z } from 'zod';
import { apiFetch } from './api-client';

export async function fetchAll<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const parsed = z
      .object({ data: z.object({ items: z.array(schema), total: z.number() }) })
      .parse(await apiFetch<unknown>(`${path}${separator}page=${page}&pageSize=100`));
    items.push(...parsed.data.items);
    total = parsed.data.total;
    if (parsed.data.items.length === 0) break;
    page++;
  } while (items.length < total);
  return items;
}
