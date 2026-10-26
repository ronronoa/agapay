import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const placesSchema = z.array(
  z.object({ code: z.string().regex(/^\d{10}$/), name: z.string().trim().min(1).max(120) }),
);

export async function fetchPlaces(path: string, signal?: AbortSignal) {
  if (
    !/^\/(provinces|regions|cities-municipalities)(\/\d{10}\/(cities-municipalities|barangays))?$/.test(
      path,
    )
  )
    throw new Error('Invalid geographic lookup');
  const response = await fetch(`https://psgc.cloud/api${path}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Geographic lists are unavailable');
  const data: unknown = await response.json();
  return placesSchema.parse(data).sort((a, b) => a.name.localeCompare(b.name));
}

export function usePsgcList(path: string | null) {
  const query = useQuery({
    queryKey: ['psgc', path],
    queryFn: ({ signal }) => {
      if (!path) throw new Error('Choose a parent area first');
      return fetchPlaces(path, signal);
    },
    enabled: path !== null,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  return {
    data: query.data,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
