import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonorActivityPage } from './DonorActivityPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const donation = {
  id: 'd-1',
  referenceNumber: 'DON-2026-000182',
  status: 'VERIFIED',
  campaignId: 'c-1',
  campaignName: 'Typhoon Amihan Relief',
  donorId: 'u-1',
  donorName: 'Juan Dela Cruz',
  donorEmail: 'juan@example.com',
  preferredDate: null,
  preferredNote: null,
  notes: null,
  rejectionReason: null,
  items: [
    {
      id: 'di-1',
      itemTypeId: 't-1',
      itemTypeName: 'Food Packs',
      unit: 'pack',
      customName: null,
      description: null,
      quantityDeclared: 50,
      quantityReceived: null,
      expiryDate: null,
    },
  ],
  submittedAt: '2026-09-20T00:00:00.000Z',
  verifiedAt: null,
  collectedAt: null,
  completedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({
    data: { items: [donation], page: 1, pageSize: 10, total: 1 },
  });
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <DonorActivityPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DonorActivityPage', () => {
  it('lists donations with reference, campaign, and status text', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('DON-2026-000182')).toBeInTheDocument());
    expect(screen.getByText('Typhoon Amihan Relief')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/donor/donations/d-1',
    );
  });

  it('paginates through the donor’s own history', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [donation], page: 1, pageSize: 10, total: 25 },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/of 25 donations/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('shows an honest empty state for new donors', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: { items: [], page: 1, pageSize: 10, total: 0 } });
    renderPage();
    await waitFor(() => expect(screen.getByText('No donations yet')).toBeInTheDocument());
  });
});
