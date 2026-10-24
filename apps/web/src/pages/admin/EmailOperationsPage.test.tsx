import { toast } from 'sonner';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailDto } from '@agapay/shared';
import type * as ApiClientModule from '../../lib/api-client';
import { apiFetch } from '../../lib/api-client';
import { EmailOperationsPage } from './EmailOperationsPage';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiClientModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
const failed: EmailDto = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'COLLECTION_SCHEDULED',
  status: 'FAILED',
  toEmail: 'fixture@example.com',
  subject: 'Collection schedule',
  priority: 2,
  attempts: 5,
  lastError: 'Provider unavailable',
  providerMessageId: null,
  relatedRequestId: null,
  relatedDonationId: null,
  scheduledFor: '2026-10-22T02:00:00Z',
  sentAt: null,
  createdAt: '2026-10-21T02:00:00Z',
};
const usage = {
  data: {
    sentToday: 90,
    limit: 90,
    remaining: 0,
    sentThisHour: 60,
    hourlyLimit: 60,
    remainingThisHour: 0,
  },
};
function result(path: string): unknown {
  if (path.endsWith('/usage')) return usage;
  return { data: [failed], meta: { page: 1, pageSize: 20, total: 21 } };
}
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EmailOperationsPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation((path) => Promise.resolve(result(path)));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EmailOperationsPage', () => {
  it('opens failed emails with truthful usage and Manila delivery details', async () => {
    show();
    await screen.findByText('fixture@example.com');
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/notifications/emails?page=1&pageSize=20&status=FAILED',
    );
    expect(screen.getByText('90 sent / 90 limit · 0 remaining')).toBeInTheDocument();
    expect(screen.getByText(/daily budget resets at midnight UTC/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View delivery/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Provider unavailable')).toBeInTheDocument();
    expect(within(dialog).getByText(/Oct 22, 2026, 10:00 AM/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Email bodies and password links are not shown/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retry email' })).toBeEnabled();
  });
  it('changes filters and resets pagination', async () => {
    show();
    await screen.findByText('fixture@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/v1/notifications/emails?page=2&pageSize=20&status=FAILED',
      ),
    );
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SENT' } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/v1/notifications/emails?page=1&pageSize=20&status=SENT',
      ),
    );
    fireEvent.change(screen.getByLabelText('Email type'), {
      target: { value: 'COLLECTION_SCHEDULED' },
    });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/v1/notifications/emails?page=1&pageSize=20&status=SENT&type=COLLECTION_SCHEDULED',
      ),
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
  it('requires confirmation and requeues once without bypassing budgets', async () => {
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      options?.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(result(path)),
    );
    show();
    await screen.findByText('fixture@example.com');
    fireEvent.click(screen.getByRole('button', { name: /View delivery/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }));
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/retry'), expect.anything());
    expect(screen.getByRole('heading', { name: 'Retry this email?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Email delivery details' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm retry' }));
    expect(screen.getByRole('button', { name: 'Requeuing…' })).toBeDisabled();
    finish?.({ data: { ...failed, status: 'QUEUED', attempts: 0, lastError: null } });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Email requeued. The delivery worker will apply the usual limits and schedule checks.',
      ),
    );
    expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/retry'))).toHaveLength(
      1,
    );
    expect(screen.queryByRole('button', { name: 'Retry email' })).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/notifications/emails/${failed.id}/retry`, {
      method: 'POST',
    });
  });
  it('surfaces stale retry failures and requires reviewing fresh details', async () => {
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      options?.method === 'POST'
        ? Promise.reject(new Error('Email is no longer failed.'))
        : Promise.resolve(result(path)),
    );
    show();
    await screen.findByText('fixture@example.com');
    fireEvent.click(screen.getByRole('button', { name: /View delivery/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm retry' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Email is no longer failed.'));
    expect(screen.getByRole('button', { name: 'Confirm retry' })).toBeDisabled();
  });
  it('does not offer retry for queued, sending, sent or suppressed emails', async () => {
    for (const status of ['QUEUED', 'SENDING', 'SENT', 'SUPPRESSED'] as const) {
      vi.mocked(apiFetch).mockImplementation((path) =>
        Promise.resolve(
          path.endsWith('/usage')
            ? usage
            : { data: [{ ...failed, status }], meta: { page: 1, pageSize: 20, total: 1 } },
        ),
      );
      const view = show();
      await screen.findByText('fixture@example.com');
      fireEvent.click(screen.getByRole('button', { name: /View delivery/ }));
      expect(screen.queryByRole('button', { name: 'Retry email' })).not.toBeInTheDocument();
      view.unmount();
    }
  });
  it('keeps empty and out-of-range results navigable', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.endsWith('/usage') ? usage : { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      ),
    );
    show();
    await screen.findByText('No emails match these filters.');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
  it('shows loading and independent errors with retry and refresh', async () => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    const view = show();
    expect(screen.getByText('Loading emails…')).toBeInTheDocument();
    expect(screen.getByText('Loading email usage…')).toBeInTheDocument();
    view.unmount();
    vi.mocked(apiFetch).mockRejectedValue(new Error('Offline'));
    show();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    vi.mocked(apiFetch).mockImplementation((path) => Promise.resolve(result(path)));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh emails and usage' }));
    await screen.findByText('fixture@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
