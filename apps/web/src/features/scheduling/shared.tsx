import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { apiFetch } from '../../lib/api-client';

export const selectClass = 'w-full rounded-md border border-input bg-surface px-3 py-2 text-sm';
export const eventTypes = ['DONATION_DRIVE', 'COLLECTION', 'DISTRIBUTION'] as const;
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
export function actionError(error: unknown): string {
  return error instanceof z.ZodError
    ? (error.issues[0]?.message ?? 'Check the form fields.')
    : error instanceof Error
      ? error.message
      : 'Could not save. Please try again.';
}
export function words(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ');
}
export function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
export function localDate(value: string): string {
  return new Date(+new Date(value) + 8 * 3600_000).toISOString().slice(0, 16);
}
export function manilaIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}
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
export function useAll<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: ['scheduling', path],
    queryFn: () => fetchAll(path, schema),
    enabled,
  });
}
export function QueryNotice({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (pending)
    return (
      <p role="status" className="py-6 text-text-muted">
        Loading schedules…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="py-4">
        <p>{error.message}</p>
        <button className="mt-2 underline" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return null;
}
