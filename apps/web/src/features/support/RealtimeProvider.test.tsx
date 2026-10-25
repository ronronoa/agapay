import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../../lib/api-client';
import { apiFetch } from '../../lib/api-client';
import { setSession, clearSession } from '../../lib/session';
import { RealtimeProvider, useLiveStatus } from './RealtimeProvider';

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
class FakeSocket {
  static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn<(value: string) => void>();
  constructor(readonly url: URL) {
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  frame(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setSession('private-access-token', {
    id: 'fixture',
    name: 'Fixture',
    email: 'fixture@example.invalid',
    role: 'DONOR',
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-01-01',
  });
  vi.mocked(apiFetch).mockResolvedValue({
    data: { ticket: 'one-use-ticket', expiresAt: '2026-10-22T00:00:00Z' },
  });
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  function Probe() {
    return <p>{useLiveStatus()}</p>;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <RealtimeProvider>
        <Probe />
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}
describe('WebSocket client recovery', () => {
  it('authenticates with a one-use frame and reconciles replay once instead of flooding HTTP', async () => {
    const view = show();
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const ws = FakeSocket.instances[0];
    if (!ws) throw new Error('Missing socket');
    act(() => ws.open());
    expect(ws.url.search).toBe('');
    expect(ws.url.toString()).not.toContain('private-access-token');
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'authenticate',
      ticket: 'one-use-ticket',
      cursor: 0,
    });
    const id = '00000000-0000-4000-8000-000000000001';
    act(() => {
      for (let sequence = 1; sequence <= 100; sequence++)
        ws.frame({ type: 'event', id, sequence, topic: 'messages', conversationId: null });
    });
    expect(view.invalidate).not.toHaveBeenCalled();
    act(() => ws.frame({ type: 'ready', cursor: 100 }));
    await screen.findByText('Live');
    await waitFor(() => expect(view.invalidate).toHaveBeenCalled());
    expect(
      view.invalidate.mock.calls.filter(([options]) => options?.queryKey?.[0] === 'support'),
    ).toHaveLength(1);
    view.invalidate.mockClear();
    act(() => {
      ws.frame({ type: 'event', id, sequence: 101, topic: 'messages', conversationId: null });
      ws.frame({ type: 'event', id, sequence: 101, topic: 'messages', conversationId: null });
    });
    await waitFor(() => expect(view.invalidate).toHaveBeenCalledTimes(2));
  });
  it('reconnects with its cursor and stops retrying after unmount', async () => {
    const view = show();
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const ws = FakeSocket.instances[0];
    if (!ws) throw new Error('Missing socket');
    act(() => {
      ws.open();
      ws.frame({ type: 'ready', cursor: 7 });
    });
    vi.useFakeTimers();
    act(() => ws.close());
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
    const second = FakeSocket.instances[1];
    if (!second) throw new Error('Missing replacement');
    act(() => second.open());
    expect(JSON.parse(second.send.mock.calls[0]?.[0] ?? '{}')).toMatchObject({ cursor: 7 });
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
