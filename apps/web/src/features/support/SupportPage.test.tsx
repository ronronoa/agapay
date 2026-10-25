import { toast } from 'sonner';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '../../lib/api-client';
import { apiFetch } from '../../lib/api-client';
import { clearSession, setSession } from '../../lib/session';
import { SupportPage } from './SupportPage';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
const id = '00000000-0000-4000-8000-000000000001';
const donorId = '00000000-0000-4000-8000-000000000002';
const conversation = {
  id,
  donorId,
  donorName: 'Fixture Donor',
  donorEmail: 'fixture@example.invalid',
  status: 'OPEN',
  revision: 1,
  lastSequence: 1,
  lastMessageAt: '2026-10-22T00:00:00Z',
  unreadCount: 1,
};
const message = {
  id: '00000000-0000-4000-8000-000000000003',
  conversationId: id,
  sequence: 1,
  senderId: donorId,
  senderName: 'Fixture Donor',
  senderRole: 'DONOR',
  body: '<script>plain text only</script>',
  createdAt: '2026-10-22T00:00:00Z',
};
function result(path: string): unknown {
  if (path.endsWith('/read')) return undefined;
  if (path.endsWith('/search'))
    return { data: [conversation], meta: { page: 1, pageSize: 20, total: 1 } };
  if (path.includes('/messages?'))
    return { data: [message], meta: { nextBefore: null, nextAfter: null } };
  return { data: conversation };
}
function show(personnel = false) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/?conversation=${id}`]}>
        <SupportPage personnel={personnel} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  setSession('fixture-token', {
    id: donorId,
    name: 'Fixture',
    email: 'fixture@example.invalid',
    role: 'DONOR',
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  });
  vi.mocked(apiFetch).mockImplementation((path) => Promise.resolve(result(path)));
});
afterEach(() => {
  cleanup();
  clearSession();
});
describe('SupportPage', () => {
  it('returns to the inbox and restores the selected conversation draft', async () => {
    show(true);
    const input = await screen.findByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Keep while browsing the inbox' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Fixture Donor/ }));
    expect(await screen.findByLabelText('Message')).toHaveValue('Keep while browsing the inbox');
  });
  it('groups message dates in Manila and keeps the history keyboard reachable', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.includes('/messages?')
          ? {
              data: [
                message,
                {
                  ...message,
                  id: '00000000-0000-4000-8000-000000000005',
                  sequence: 2,
                  body: 'Next Manila day',
                  createdAt: '2026-10-22T16:05:00Z',
                },
              ],
              meta: { nextBefore: null, nextAfter: null },
            }
          : result(path),
      ),
    );
    show();
    await screen.findByText('Next Manila day');
    expect(screen.getByText('Oct 22, 2026')).toBeInTheDocument();
    expect(screen.getByText('Oct 23, 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Message history' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
  it('disables sending while a message is pending and saves the draft once', async () => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path.endsWith('/messages') && options?.method === 'POST')
        return new Promise((resolve) => {
          finish = resolve;
        });
      return Promise.resolve(result(path));
    });
    show();
    const input = await screen.findByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Pending message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    const pending = screen.getByRole('button', { name: 'Saving…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(input).toBeDisabled();
    fireEvent.click(pending);
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/messages')),
    ).toHaveLength(1);
    finish?.({ data: { ...message, body: 'Pending message' } });
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
    expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
    expect(input).toBeEnabled();
  });
  it('renders safe text history, opens the donor conversation and marks visible messages read', async () => {
    const view = show();
    expect(await screen.findByText('<script>plain text only</script>')).toBeInTheDocument();
    expect(view.container.querySelector('script')).toBeNull();
    expect(screen.getByLabelText('Sent').parentElement?.querySelector('time')).not.toBeNull();
    expect(screen.queryByText('Search donors')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/api/v1/support/conversations/${id}/read`, {
        method: 'POST',
        body: { sequence: 1 },
      }),
    );
  });
  it('keeps the same draft/send identifier after failure and clears it on success', async () => {
    let failed = false;
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path.endsWith('/messages') && options?.method === 'POST') {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('Offline. Retry your draft.'));
        }
        return Promise.resolve({ data: { ...message, body: 'Draft after outage' } });
      }
      return Promise.resolve(result(path));
    });
    show();
    await screen.findByLabelText('Message');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Draft after outage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Message could not be sent. Retry with the same draft.',
      ),
    );
    expect(screen.getByLabelText('Message')).toHaveValue('Draft after outage');
    fireEvent.click(screen.getByRole('button', { name: 'Retry send' }));
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
    expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    const writes = vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/messages'));
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]?.body).toEqual(writes[1]?.[1]?.body);
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });
  it('searches the staff inbox through a request body and confirms closure', async () => {
    show(true);
    await screen.findByRole('button', { name: /Fixture Donor/ });
    fireEvent.change(screen.getByLabelText('Search donors'), {
      target: { value: 'Private donor name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/support/conversations/search', {
        method: 'POST',
        body: { q: 'Private donor name', unread: 'false', page: 1, pageSize: 20 },
      }),
    );
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.includes('Private donor'))).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close conversation' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/api/v1/support/conversations/${id}`, {
        method: 'PATCH',
        body: { status: 'CLOSED', revision: 1 },
      }),
    );
  });
  it('retains separate drafts while staff switch between conversations', async () => {
    const otherId = '00000000-0000-4000-8000-000000000004';
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.endsWith('/search')
          ? {
              data: [conversation, { ...conversation, id: otherId, donorName: 'Second Donor' }],
              meta: { page: 1, pageSize: 20, total: 2 },
            }
          : result(path),
      ),
    );
    show(true);
    await screen.findByLabelText('Message');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'First draft' } });
    fireEvent.click(screen.getByRole('button', { name: /Second Donor/ }));
    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Second draft' } });
    fireEvent.click(screen.getByRole('button', { name: /Fixture Donor/ }));
    expect(screen.getByLabelText('Message')).toHaveValue('First draft');
  });
  it('keeps staff composer closed until reopening and lets donors reopen with a new message', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.includes('/messages?') || path.endsWith('/search') || path.endsWith('/read')
          ? result(path)
          : { data: { ...conversation, status: 'CLOSED' } },
      ),
    );
    const view = show(true);
    await screen.findByLabelText('Message');
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reopen conversation' })).toBeEnabled();
    view.unmount();
    show(false);
    await screen.findByLabelText('Message');
    expect(screen.getByLabelText('Message')).toBeEnabled();
    expect(
      screen.getByText('Sending a new message reopens your conversation.'),
    ).toBeInTheDocument();
  });
  it('shows errors and recovers through refresh without discarding the screen', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Offline'));
    show(true);
    await screen.findAllByRole('alert');
    vi.mocked(apiFetch).mockImplementation((path) => Promise.resolve(result(path)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh messages' }));
    await screen.findByLabelText('Message');
    expect(screen.getByText('<script>plain text only</script>')).toBeInTheDocument();
  });
});
