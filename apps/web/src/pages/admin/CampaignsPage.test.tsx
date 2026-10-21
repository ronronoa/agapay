import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CampaignsPage } from './CampaignsPage';
import { apiFetch } from '../../lib/api-client';
import type { CampaignDto } from '@agapay/shared';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const itemType = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Food Packs',
  category: 'FOOD',
  unit: 'pack',
  lowStockThreshold: 20,
  maxPerRequest: null,
  perHouseholdMember: null,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

function campaign(overrides: Partial<CampaignDto> = {}): CampaignDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
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
    areas: [
      { id: 'area-1', barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' },
    ],
    priorityItems: [],
    donationCount: 0,
    requestCount: 0,
    eventCount: 0,
    inventoryCount: 0,
    deletable: false,
    ...overrides,
  };
}

let campaigns: CampaignDto[] = [];
let submittedBody: unknown = null;

beforeEach(() => {
  vi.clearAllMocks();
  campaigns = [campaign()];
  submittedBody = null;
  vi.mocked(apiFetch).mockImplementation(
    (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === '/api/v1/campaigns' && options?.method === 'POST') {
        submittedBody = options.body;
        return Promise.resolve({ data: campaign({ name: 'Flood Response', status: 'DRAFT' }) });
      }
      if (path.endsWith('/image')) {
        return Promise.resolve({ data: campaign({ coverImageUrl: '/uploads/campaigns/x.png' }) });
      }
      if (path.startsWith('/api/v1/campaigns')) {
        return Promise.resolve({
          data: { items: campaigns, page: 1, pageSize: 100, total: campaigns.length },
        });
      }
      if (path.startsWith('/api/v1/item-types')) {
        return Promise.resolve({ data: { items: [itemType], page: 1, pageSize: 100, total: 1 } });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    },
  );
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CampaignsPage />
    </QueryClientProvider>,
  );
}

describe('CampaignsPage create dialog', () => {
  it('lists campaigns with an add affordance and opens the dialog', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Typhoon Relief')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add Campaign' }));

    expect(screen.getByText('Create New Campaign')).toBeInTheDocument();
    expect(screen.getByLabelText('Campaign name *')).toBeInTheDocument();
    expect(screen.getByLabelText('Area 1 barangay')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority item 1')).toBeInTheDocument();
  });

  it('blocks submit and explains an incomplete area row', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Typhoon Relief')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add Campaign' }));
    fireEvent.change(screen.getByLabelText('Campaign name *'), {
      target: { value: 'Flood Response' },
    });
    fireEvent.change(screen.getByLabelText('Description *'), {
      target: { value: 'Helping flooded barangays.' },
    });
    fireEvent.change(screen.getByLabelText('Start date *'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('End date *'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Area 1 barangay'), {
      target: { value: 'San Isidro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));

    expect(
      await screen.findByText('Fill in every part of an area, or remove the row.'),
    ).toBeInTheDocument();
    expect(submittedBody).toBeNull();
  });

  it('strips empty rows and creates a campaign', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Typhoon Relief')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Add Campaign' }));
    fireEvent.change(screen.getByLabelText('Campaign name *'), {
      target: { value: 'Flood Response' },
    });
    fireEvent.change(screen.getByLabelText('Description *'), {
      target: { value: 'Helping flooded barangays.' },
    });
    fireEvent.change(screen.getByLabelText('Start date *'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('End date *'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Area 1 barangay'), { target: { value: 'San Isidro' } });
    fireEvent.change(screen.getByLabelText('Area 1 city'), { target: { value: 'Quezon City' } });
    fireEvent.change(screen.getByLabelText('Area 1 province'), {
      target: { value: 'Metro Manila' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));

    await waitFor(() =>
      expect(screen.getByText(/Campaign "Flood Response" created/)).toBeInTheDocument(),
    );
    const body = submittedBody as {
      areas?: { barangay?: string; city?: string; province?: string }[];
      priorityItems?: unknown[];
    };
    expect(body.areas).toEqual([
      { barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' },
    ]);
    expect(body.priorityItems).toEqual([]);
  });
});

describe('CampaignsPage activation', () => {
  it('activates a draft campaign only after confirmation', async () => {
    campaigns = [campaign({ status: 'DRAFT', name: 'Draft Drive' })];
    renderPage();
    await waitFor(() => expect(screen.getByText('Draft Drive')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(screen.getByText('Activate this campaign?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Activate this campaign?')).toBeNull());

    const notCalled = vi.mocked(apiFetch).mock.calls.some(([path]) => path.endsWith('/activate'));
    expect(notCalled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, activate' }));

    await waitFor(() => {
      const called = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/activate') && options?.method === 'POST',
        );
      expect(called).toBe(true);
    });
    expect(await screen.findByText(/is now active/)).toBeInTheDocument();
  });

  it('offers no activation for an already active campaign', async () => {
    campaigns = [campaign({ status: 'ACTIVE' })];
    renderPage();
    await waitFor(() => expect(screen.getByText('Typhoon Relief')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
  });
});
