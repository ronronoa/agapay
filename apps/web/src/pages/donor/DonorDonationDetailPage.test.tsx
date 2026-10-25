import { toast } from 'sonner';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonorDonationDetailPage } from './DonorDonationDetailPage';
import { apiFetch, ApiClientError } from '../../lib/api-client';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const donation = {
  id: '44444444-4444-4444-8444-444444444444',
  referenceNumber: 'DON-2026-000182',
  status: 'PENDING',
  campaignId: '11111111-1111-4111-8111-111111111111',
  campaignName: 'Typhoon Amihan Relief',
  donorId: '55555555-5555-4555-8555-555555555555',
  donorName: 'Juan Dela Cruz',
  donorEmail: 'juan@example.com',
  preferredDate: null,
  preferredNote: null,
  notes: null,
  rejectionReason: null,
  items: [
    {
      id: 'di-1',
      itemTypeId: '22222222-2222-4222-8222-222222222222',
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

const campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Typhoon Amihan Relief',
  slug: 'typhoon-amihan',
  description: 'Supporting families.',
  calamityType: 'TYPHOON',
  status: 'ACTIVE',
  isSystem: false,
  startDate: '2026-09-10T00:00:00.000Z',
  endDate: null,
  coverImageUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  areas: [],
  priorityItems: [],
  donationCount: 0,
  requestCount: 0,
  eventCount: 0,
  inventoryCount: 0,
  deletable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/donations/')) {
      return Promise.resolve({ data: donation });
    }
    if (path.startsWith('/api/v1/campaigns')) {
      return Promise.resolve({ data: { items: [campaign], page: 1, pageSize: 100, total: 1 } });
    }
    if (path.startsWith('/api/v1/public/item-types')) {
      return Promise.resolve({
        data: {
          items: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Food Packs',
              unit: 'pack',
              category: 'FOOD',
              maxPerRequest: null,
              perHouseholdMember: null,
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        },
      });
    }
    return Promise.resolve({ data: { items: [], page: 1, pageSize: 100, total: 0 } });
  });
});

function renderDetail(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <DonorDonationDetailPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/donor/donations/44444444-4444-4444-8444-444444444444']}>
        <Routes>
          <Route path="/donor/donations/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DonorDonationDetailPage actions', () => {
  it('edits a pending donation inline', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('DON-2026-000182')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Edit donation' }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Food Packs/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Donation updated.'));
    const patch = vi
      .mocked(apiFetch)
      .mock.calls.find(
        ([path, options]) =>
          path.includes('/api/v1/donations/44444444-4444-4444-8444-444444444444') &&
          (options as { method?: string })?.method === 'PATCH',
      );
    expect(patch).toBeDefined();
  });

  it('cancels behind a confirmation dialog', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('DON-2026-000182')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel donation' }));
    await waitFor(() => expect(screen.getByText('Cancel this donation?')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Donation cancelled.'));
  });

  it('hides edit and cancel once staff takes over', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path.startsWith('/api/v1/donations/')) {
        return Promise.resolve({ data: { ...donation, status: 'VERIFIED' } });
      }
      return Promise.resolve({ data: { items: [], page: 1, pageSize: 100, total: 0 } });
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/donor/donations/44444444-4444-4444-8444-444444444444']}>
          <Routes>
            <Route path="/donor/donations/:id" element={<DonorDonationDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('DON-2026-000182')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Edit donation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel donation' })).toBeNull();
  });

  it('surfaces cancel failures without closing the question', async () => {
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path.endsWith('/cancel')) {
        return Promise.reject(
          new ApiClientError(
            'INVALID_STATE_TRANSITION',
            'Too late to cancel.',
            409,
            'r',
            undefined,
          ),
        );
      }
      if (path.startsWith('/api/v1/donations/')) {
        return Promise.resolve({ data: donation });
      }
      return Promise.resolve({ data: { items: [], page: 1, pageSize: 100, total: 0 } });
    });
    renderDetail();
    await waitFor(() => expect(screen.getByText('DON-2026-000182')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel donation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too late to cancel.'));
  });
});
