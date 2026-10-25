import { toast } from 'sonner';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RequestsPage } from './RequestsPage';
import { apiFetch, ApiClientError } from '../../lib/api-client';
import type { AssistanceRequestDto, CampaignDto } from '@agapay/shared';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

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
  it('retains a failed approval note for retry and renders errors in red', async () => {
    respondWith([request({ status: 'UNDER_REVIEW' })]);
    const normal = vi.mocked(apiFetch).getMockImplementation();
    let failed = false;
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path.endsWith('/approve') && !failed) {
        failed = true;
        return Promise.reject(
          new ApiClientError('INTERNAL_ERROR', 'Retry this action.', 500, undefined, undefined),
        );
      }
      return normal?.(path, options) ?? Promise.resolve({});
    });
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const note = screen.getByLabelText('Approval note, optional');
    fireEvent.change(note, { target: { value: 'Keep this approval note.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Retry this action.'));
    expect(note).toHaveValue('Keep this approval note.');
    expect(note).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Request approved and tracking number issued.'),
    );
    const writes = vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/approve'));
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]?.body).toEqual(writes[1]?.[1]?.body);
  });
  it('sends API flag values rather than display labels', async () => {
    renderPage();
    await screen.findByText('REQ-2026-004281');
    fireEvent.change(screen.getByLabelText('Flag'), { target: { value: 'duplicate' } });
    await waitFor(() =>
      expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.includes('flag=duplicate'))).toBe(
        true,
      ),
    );
  });
  it('keeps pending approval safe from repeated clicks and dismissal', async () => {
    respondWith([request({ status: 'UNDER_REVIEW' })]);
    const normal = vi.mocked(apiFetch).getMockImplementation();
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      path.endsWith('/approve')
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : (normal?.(path, options) ?? Promise.resolve({})),
    );
    renderPage();
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const note = screen.getByLabelText('Approval note, optional');
    fireEvent.change(note, { target: { value: 'Eligible household.' } });
    const confirm = screen.getByRole('button', { name: 'Confirm approval' });
    fireEvent.click(confirm);
    await screen.findByText('Saving request…');
    expect(confirm).toBeDisabled();
    expect(note).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([path]) => path.endsWith('/approve')),
    ).toHaveLength(1);
    finish?.({ data: request({ status: 'APPROVED' }) });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Request approved and tracking number issued.'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
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
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request claimed for review.'));
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
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Request approved and tracking number issued.'),
    );
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
