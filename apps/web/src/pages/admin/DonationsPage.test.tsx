import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonationsPage } from './DonationsPage';
import { apiFetch } from '../../lib/api-client';
import type { CalendarEventDto, CampaignDto, DonationDto } from '@agapay/shared';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

function donation(overrides: Partial<DonationDto> = {}): DonationDto {
  return {
    id: 'd-1',
    referenceNumber: 'DON-2026-000201',
    status: 'PENDING',
    campaignId: CAMPAIGN_ID,
    campaignName: 'Typhoon Relief',
    donorId: 'donor-1',
    donorName: 'Amara Okoro',
    donorEmail: 'amara@gmail.com',
    preferredDate: null,
    preferredNote: null,
    notes: null,
    rejectionReason: null,
    submittedAt: '2026-09-01T00:00:00.000Z',
    verifiedAt: null,
    collectedAt: null,
    completedAt: null,
    items: [
      {
        id: 'di-1',
        itemTypeId: '33333333-3333-4333-8333-333333333333',
        itemTypeName: 'Food Packs',
        unit: 'pack',
        customName: null,
        description: null,
        quantityDeclared: 5,
        quantityReceived: null,
        expiryDate: null,
      },
      {
        id: 'di-2',
        itemTypeId: '44444444-4444-4444-8444-444444444444',
        itemTypeName: 'Bottled Water',
        unit: 'liter',
        customName: null,
        description: null,
        quantityDeclared: 2,
        quantityReceived: null,
        expiryDate: null,
      },
    ],
    ...overrides,
  };
}

function campaign(): CampaignDto {
  return {
    id: CAMPAIGN_ID,
    name: 'Typhoon Relief',
    slug: 'typhoon-relief',
    description: 'Storm response',
    calamityType: 'TYPHOON',
    status: 'ACTIVE',
    isSystem: false,
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: null,
    coverImageUrl: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    areas: [],
    priorityItems: [],
    donationCount: 1,
    requestCount: 0,
    eventCount: 0,
    inventoryCount: 0,
    deletable: false,
  };
}

function collectionEvent(): CalendarEventDto {
  return {
    id: EVENT_ID,
    type: 'COLLECTION',
    status: 'SCHEDULED',
    title: 'Barangay collection',
    description: null,
    campaignId: CAMPAIGN_ID,
    campaignName: 'Typhoon Relief',
    startAt: '2099-09-10T08:00:00.000Z',
    endAt: '2099-09-10T12:00:00.000Z',
    location: 'Covered court',
    capacity: null,
    syncStatus: 'NOT_SYNCED',
    revision: 1,
    occupied: 0,
    outstandingCollections: 0,
    outstandingDistributions: 0,
    syncEnabled: false,
    externalEventId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function respondWith(items: DonationDto[]): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/donations?')) {
      return Promise.resolve({ data: { items, page: 1, pageSize: 20, total: items.length } });
    }
    if (path.startsWith('/api/v1/campaigns?')) {
      return Promise.resolve({ data: { items: [campaign()], page: 1, pageSize: 100, total: 1 } });
    }
    if (path.startsWith('/api/v1/calendar/events?')) {
      return Promise.resolve({
        data: { items: [collectionEvent()], page: 1, pageSize: 100, total: 1 },
      });
    }
    return Promise.resolve({ data: donation() });
  });
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DonationsPage />
    </QueryClientProvider>,
  );
}

async function openReview(): Promise<void> {
  await screen.findByText('DON-2026-000201');
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith([donation()]);
});

describe('DonationsPage', () => {
  it('shows loading before the queue arrives', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading donations');
  });

  it('filters the queue by status', async () => {
    renderPage();
    await screen.findByText('DON-2026-000201');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'VERIFIED' } });

    await waitFor(() => {
      const requested = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path]) => path.includes('/api/v1/donations?') && path.includes('status=VERIFIED'),
        );
      expect(requested).toBe(true);
    });
  });

  it('shows an empty queue rather than a bare table', async () => {
    respondWith([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('No donations match')).toBeInTheDocument());
  });

  it('shows an actionable error with retry', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('verifies a pending donation and refreshes the queue', async () => {
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm verify' }));

    await waitFor(() => {
      const verified = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/verify') && options?.method === 'POST',
        );
      expect(verified).toBe(true);
    });
    expect(await screen.findByText('Donation verified.')).toBeInTheDocument();
  });

  it('requires a donor-visible reason before rejecting', async () => {
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm rejection' }));

    expect(await screen.findByText('Enter the reason the donor will see.')).toBeInTheDocument();
    const rejected = vi
      .mocked(apiFetch)
      .mock.calls.some(([path, options]) => path.endsWith('/reject') && options?.method === 'POST');
    expect(rejected).toBe(false);
  });

  it('requires a collection event before scheduling', async () => {
    respondWith([donation({ status: 'VERIFIED' })]);
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm schedule' }));

    expect(await screen.findByText('Select a scheduled collection event.')).toBeInTheDocument();
  });

  it('blocks collection when every received quantity is zero', async () => {
    respondWith([donation({ status: 'VERIFIED' })]);
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Collect' }));
    for (const input of await screen.findAllByLabelText('Received')) {
      fireEvent.change(input, { target: { value: '0' } });
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm collection' }));

    expect(
      await screen.findByText('Enter at least one received quantity before completing collection.'),
    ).toBeInTheDocument();
  });
});
