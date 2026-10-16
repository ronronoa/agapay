import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TrackAssistancePage } from './TrackAssistancePage';
import { apiFetch, ApiClientError } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const found = {
  data: {
    code: 'TRK-82K4-19Q7',
    campaign: { name: 'Typhoon Kristine Relief' },
    status: 'SCHEDULED',
    statusMessage: 'Your goods are ready. Please come on the date below.',
    submittedAt: '2026-09-18T03:12:00Z',
    timeline: [
      { status: 'PENDING', at: '2026-09-18T03:12:00Z' },
      { status: 'APPROVED', at: '2026-09-19T02:05:00Z' },
      { status: 'SCHEDULED', at: '2026-09-20T01:30:00Z' },
    ],
    distribution: {
      startAt: '2026-09-25T01:00:00Z',
      endAt: '2026-09-25T04:00:00Z',
      location: 'Barangay San Isidro Hall',
    },
    rejectionReason: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <TrackAssistancePage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TrackAssistancePage', () => {
  it('uses the same landing header as the rest of the public journey', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Take Action' }));
    const menu = screen.getByRole('menu', { name: 'Take action' });
    expect(menu.textContent ?? '').toContain('Donate Goods');
    expect(menu.textContent ?? '').toContain('Track Assistance');
  });

  it('shows status, timeline, and pickup schedule for a match', async () => {
    vi.mocked(apiFetch).mockResolvedValue(found);
    renderPage();

    fireEvent.change(screen.getByLabelText('Tracking or reference code'), {
      target: { value: 'TRK-82K4-19Q7' },
    });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'maria@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track request' }));

    await waitFor(() => expect(screen.getByText('Typhoon Kristine Relief')).toBeInTheDocument());
    expect(screen.getByText('Barangay San Isidro Hall', { exact: false })).toBeInTheDocument();
  });

  it('shows the same generic message when nothing matches', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiClientError(
        'NOT_FOUND',
        'No request found for those details.',
        404,
        'req-1',
        undefined,
      ),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Tracking or reference code'), {
      target: { value: 'TRK-NOPE-0000' },
    });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'nobody@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Track request' }));

    await waitFor(() =>
      expect(screen.getByText('No request found for those details.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Typhoon Kristine Relief')).toBeNull();
  });
});
