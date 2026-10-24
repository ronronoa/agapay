import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type * as ApiModule from './api-client';
import { ApiClientError, apiFetch } from './api-client';
import { useApiQuery } from './use-api-query';

vi.mock('./api-client', async (original) => ({
  ...(await original<typeof ApiModule>()),
  apiFetch: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
const schema = z.object({ value: z.string() });

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useApiQuery(['fixture'], '/fixture', schema), { wrapper });
}

describe('useApiQuery refresh', () => {
  it.each([401, 403, 404])('hides cached data after access is rejected with %s', async (status) => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ value: 'Private snapshot' })
      .mockRejectedValueOnce(
        new ApiClientError('FORBIDDEN', 'Access denied.', status, undefined, undefined),
      );
    const { result } = show();
    await waitFor(() => expect(result.current.data).toEqual({ value: 'Private snapshot' }));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.error).toBe('Access denied.'));
    expect(result.current.data).toBeNull();
  });
  it('keeps the last validated snapshot when a background request fails', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ value: 'Saved snapshot' })
      .mockRejectedValueOnce(new Error('Offline'));
    const { result } = show();
    await waitFor(() => expect(result.current.data).toEqual({ value: 'Saved snapshot' }));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.error).toBe('Request failed.'));
    expect(result.current.data).toEqual({ value: 'Saved snapshot' });
    expect(result.current.isFetching).toBe(false);
  });

  it('reuses an in-flight refresh instead of issuing duplicate requests', async () => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ value: 'Initial' })
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const { result } = show();
    await waitFor(() => expect(result.current.data).toEqual({ value: 'Initial' }));
    act(() => {
      result.current.refetch();
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ value: 'Initial' });
    finish?.({ value: 'Refreshed' });
    await waitFor(() => expect(result.current.data).toEqual({ value: 'Refreshed' }));
  });
});
