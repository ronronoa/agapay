import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getUser, subscribe } from '../../lib/session';
import { RealtimeProvider } from '../../features/support/RealtimeProvider';

export function SessionQueryProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, getUser);
  const identity = user === null ? 'anonymous' : `${user.id}:${user.role}`;
  // Switch caches during render so another account never sees a previous snapshot.
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [identity],
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider key={identity} client={client}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  );
}
