import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonatePage } from './DonatePage';
import { apiFetch, ApiClientError } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Typhoon Amihan Relief Drive',
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

const foodItem = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Food Pack',
  unit: 'pack',
  category: 'FOOD',
  maxPerRequest: null,
  perHouseholdMember: null,
};

const donation = {
  id: '44444444-4444-4444-8444-444444444444',
  referenceNumber: 'DON-2026-000201',
  status: 'PENDING',
  campaignId: '11111111-1111-4111-8111-111111111111',
  campaignName: 'Typhoon Amihan Relief Drive',
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
      itemTypeName: 'Food Pack',
      unit: 'pack',
      customName: null,
      description: null,
      quantityDeclared: 5,
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
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/campaigns')) {
      return Promise.resolve({ data: { items: [campaign], page: 1, pageSize: 100, total: 1 } });
    }
    if (path.startsWith('/api/v1/public/item-types')) {
      return Promise.resolve({ data: { items: [foodItem], page: 1, pageSize: 100, total: 1 } });
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <DonatePage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DonatePage', () => {
  it('submits a grouped pledge and shows the reference', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Food Pack/ })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Relief campaign'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Food Pack/ }));
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/donations') {
        return Promise.resolve({ data: donation });
      }
      if (path.startsWith('/api/v1/campaigns')) {
        return Promise.resolve({ data: { items: [campaign], page: 1, pageSize: 100, total: 1 } });
      }
      return Promise.resolve({
        data: { items: [foodItem], page: 1, pageSize: 100, total: 1 },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit donation' }));

    await waitFor(() => expect(screen.getByText('DON-2026-000201')).toBeInTheDocument());
  });

  it('offers a resend action when the email is unverified', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Food Pack/ })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Relief campaign'), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Food Pack/ }));
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/donations') {
        return Promise.reject(
          new ApiClientError('EMAIL_NOT_VERIFIED', 'Verify first.', 403, 'req-1', undefined),
        );
      }
      if (path.startsWith('/api/v1/campaigns')) {
        return Promise.resolve({ data: { items: [campaign], page: 1, pageSize: 100, total: 1 } });
      }
      return Promise.resolve({
        data: { items: [foodItem], page: 1, pageSize: 100, total: 1 },
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit donation' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Resend confirmation email' })).toBeInTheDocument(),
    );
  });
});
