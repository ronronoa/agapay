import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../../lib/api-client';
import { apiFetch } from '../../lib/api-client';
import { NotificationBell } from './NotificationBell';
import { clearSession, setSession } from '../../lib/session';
import { toast } from 'sonner';

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
describe('NotificationBell', () => {
  it('shows persistent unread counts, saved history and an explicit mark-read action', async () => {
    const success = vi.spyOn(toast, 'success');
    const id = '00000000-0000-4000-8000-000000000001';
    const conversationId = '00000000-0000-4000-8000-000000000002';
    setSession('token', {
      id,
      role: 'DONOR',
      name: 'Fixture',
      email: 'fixture@example.invalid',
      phone: null,
      emailVerified: true,
      isActive: true,
      createdAt: '2026-01-01',
    });
    let read = false;
    vi.mocked(apiFetch).mockImplementation((_path, options) => {
      if (options?.method === 'POST') {
        read = true;
        return Promise.resolve(undefined);
      }
      return Promise.resolve({
        data: [
          {
            id,
            conversationId,
            donationId: null,
            kind: 'MESSAGE',
            title: 'New support message',
            readAt: read ? '2026-10-22T00:00:00Z' : null,
            createdAt: '2026-10-22T00:00:00Z',
          },
        ],
        meta: { unreadCount: read ? 0 : 1, nextCursor: null },
      });
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const bell = await screen.findByRole('button', { name: 'Notifications (1 unread)' });
    fireEvent.click(bell);
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(screen.queryByText('Open update')).not.toBeInTheDocument();
    expect(screen.getByText('Unread', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New support message' })).toHaveAttribute(
      'href',
      `/donor/messages?conversation=${conversationId}`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument(),
    );
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/support/notifications/${id}/read`, {
      method: 'POST',
    });
    await waitFor(() => expect(success).toHaveBeenCalledWith('Notification marked as read.'));
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull());
    await waitFor(() => expect(bell).toHaveFocus());
    fireEvent.click(bell);
    fireEvent.click(await screen.findByRole('link', { name: 'New support message' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull());
  });
  it('keeps a failed read available for retry and gives error feedback without a success toast', async () => {
    const success = vi.spyOn(toast, 'success');
    const error = vi.spyOn(toast, 'error');
    vi.mocked(apiFetch).mockImplementation((_path, options) =>
      options?.method === 'POST'
        ? Promise.reject(new Error('Offline'))
        : Promise.resolve({
            data: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                conversationId: null,
                donationId: null,
                kind: 'OPERATION',
                title: 'Update',
                readAt: null,
                createdAt: '2026-10-24T00:00:00Z',
              },
            ],
            meta: { unreadCount: 1, nextCursor: null },
          }),
    );
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications (1 unread)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Could not mark this notification as read. Please try again.',
      ),
    );
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
    expect(screen.getByText('Unread', { exact: true })).toBeInTheDocument();
  });
});
