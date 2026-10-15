import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RequestsPage } from './RequestsPage';
import { apiFetch } from '../../lib/api-client';
import type { AssistanceRequestDto, CampaignDto } from '@agapay/shared';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

function request(overrides: Partial<AssistanceRequestDto> = {}): AssistanceRequestDto {
  return {
    id: 'r-1',
    referenceNumber: 'REQ-2026-004281',
    trackingNumber: null,
    fullName: 'Amara Okoro',
    email: 'amara@gmail.com',
    contactNumber: '+639171234567',
    barangay: 'Commonwealth',
    city: 'Quezon City',
    province: 'Metro Manila',
    householdSize: 4,
    campaignId: CAMPAIGN_ID,
    campaignName: 'Typhoon Relief',
    status: 'PENDING',
    notes: 'Two children and one senior need food packs.',
    rejectionReason: null,
    outsideCampaignArea: false,
    possibleDuplicate: true,
    emailVerified: false,
    submittedAt: '2026-09-01T00:00:00.000Z',
    reviewedAt: null,
    approvedAt: null,
    items: [
      {
        id: 'ri-1',
        itemTypeId: '33333333-3333-4333-8333-333333333333',
        itemTypeName: 'Food Packs',
        unit: 'pack',
        customName: null,
        quantity: 4,
      },
    ],
    timeline: [
      {
        fromStatus: null,
        toStatus: 'PENDING',
        actorId: null,
        note: null,
        at: '2026-09-01T00:00:00.000Z',
      },
    ],
    distributions: [],
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
    donationCount: 0,
    requestCount: 1,
    eventCount: 0,
    inventoryCount: 0,
    deletable: false,
  };
}

function respondWith(items: AssistanceRequestDto[]): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/assistance-requests?')) {
      return Promise.resolve({ data: { items, page: 1, pageSize: 20, total: items.length } });
    }
    if (path.startsWith('/api/v1/campaigns?')) {
      return Promise.resolve({ data: { items: [campaign()], page: 1, pageSize: 100, total: 1 } });
    }
    return Promise.resolve({ data: request() });
  });
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RequestsPage />
    </QueryClientProvider>,
  );
}

async function openReview(): Promise<void> {
  await screen.findByText('REQ-2026-004281');
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  respondWith([request()]);
});

describe('RequestsPage', () => {
  it('shows loading before the queue arrives', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading assistance requests');
  });

  it('lists flags without auto-rejecting a possible duplicate', async () => {
    renderPage();
    await openReview();
    expect((await screen.findAllByText(/Possible duplicate/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Unverified email/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument();
  });

  it('claims a pending request and refreshes the queue', async () => {
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm claim' }));

    await waitFor(() => {
      const claimed = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/claim') && options?.method === 'POST',
        );
      expect(claimed).toBe(true);
    });
    expect(await screen.findByText('Request claimed for review.')).toBeInTheDocument();
  });

  it('approves with an optional note', async () => {
    respondWith([request({ status: 'UNDER_REVIEW' })]);
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.change(await screen.findByLabelText('Approval note, optional'), {
      target: { value: 'Verified household of four.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() => {
      const approved = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/approve') && options?.method === 'POST',
        );
      expect(approved).toBe(true);
    });
    expect(
      await screen.findByText('Request approved and tracking number issued.'),
    ).toBeInTheDocument();
  });

  it('requires a beneficiary-visible reason before rejecting', async () => {
    respondWith([request({ status: 'UNDER_REVIEW' })]);
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm rejection' }));

    expect(
      await screen.findByText('Enter the reason the beneficiary will see.'),
    ).toBeInTheDocument();
    const rejected = vi
      .mocked(apiFetch)
      .mock.calls.some(([path, options]) => path.endsWith('/reject') && options?.method === 'POST');
    expect(rejected).toBe(false);
  });

  it('shows an empty queue rather than a bare table', async () => {
    respondWith([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('No requests match')).toBeInTheDocument());
  });

  it('shows an actionable error with retry', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
