import { useQuery } from '@tanstack/react-query';
import type { ZodTypeDef } from 'zod';
import type { z } from 'zod';
import { ApiClientError, apiFetch } from './api-client';

interface ParsedQuery<T> {
  data: T | null;
  error: string | null;
  isPending: boolean;
  refetch: () => void;
}

/**
 * Fetches JSON and parses it with a shared Zod schema. The response stays
 * `unknown` everywhere below this line, so a web/api contract drift surfaces as
 * a parse failure the user can retry, not as an `any` reaching a component
 * (API-04, rules.md section 3).
 */
export function useApiQuery<T>(
  queryKey: readonly unknown[],
  path: string,
  // Input pinned to `unknown` so T binds to the schema's *output*, which is
  // what a component renders. Without this, a schema with `.default()` binds T
  // to the input type and every defaulted field arrives optional.
  schema: z.ZodType<T, ZodTypeDef, unknown>,
  options: { enabled?: boolean } = {},
): ParsedQuery<T> {
  const query = useQuery<unknown, Error>({
    queryKey,
    // exactOptionalPropertyTypes rejects an explicit `undefined` here.
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
    queryFn: (): Promise<unknown> => apiFetch<unknown>(path),
  });

  const refetch = (): void => {
    void query.refetch();
  };

  if (query.isPending) {
    return { data: null, error: null, isPending: true, refetch };
  }

  if (query.isError) {
    return {
      data: null,
      error: query.error instanceof ApiClientError ? query.error.message : 'Request failed.',
      isPending: false,
      refetch,
    };
  }

  const parsed = schema.safeParse(query.data);
  if (!parsed.success) {
    return {
      data: null,
      error: 'The server response did not match the expected shape.',
      isPending: false,
      refetch,
    };
  }

  return { data: parsed.data, error: null, isPending: false, refetch };
}
