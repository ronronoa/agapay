import { toast } from 'sonner';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CampaignsPage } from './CampaignsPage';
import { apiFetch } from '../../lib/api-client';
import { setUser } from '../../lib/session';
import type { CampaignDto } from '@agapay/shared';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../lib/psgc', () => ({
  usePsgcList: () => ({ data: [], isFetching: false, isError: false, refetch: vi.fn() }),
}));

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
  setUser({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Admin fixture',
    email: 'admin@example.invalid',
    role: 'ADMIN',
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  });
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
      for (const [action, status] of [
        ['activate', 'ACTIVE'],
        ['complete', 'COMPLETED'],
        ['archive', 'ARCHIVED'],
      ] as const) {
        if (path.endsWith(`/${action}`) && options?.method === 'POST')
          return Promise.resolve({ data: campaign({ status }) });
      }
      const detail = campaigns.find((row) => path === `/api/v1/campaigns/${row.id}`);
      if (detail) return Promise.resolve({ data: detail });
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

describe('campaign grid and management', () => {
  it('holds confirmation while completion is pending and sends the displayed version', async () => {
    const version = '2026-10-25T01:00:00.000Z';
    campaigns = [campaign({ updatedAt: version })];
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    if (!fallback) throw new Error('Missing fixture');
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      path.endsWith('/complete')
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : fallback(path, options),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, complete' }));
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/campaigns/${campaign().id}/complete`, {
      method: 'POST',
      body: { expectedUpdatedAt: version },
    });
    campaigns = [campaign({ status: 'COMPLETED' })];
    finish?.({ data: campaigns[0] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Campaign completed.'));
  });

  it('renders image cards with a recoverable missing-image state', async () => {
    campaigns = [campaign({ coverImageUrl: '/uploads/campaigns/fixture.png' })];
    const view = renderPage();
    await screen.findByText('Typhoon Relief');
    expect(screen.getByRole('article')).toBeInTheDocument();
    const image = view.container.querySelector('img');
    if (!image) throw new Error('Missing campaign image');
    fireEvent.error(image);
    expect(screen.getByText('No campaign image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage campaign' })).toBeEnabled();
  });

  it('filters immediately and pages the server-side result', async () => {
    renderPage();
    await screen.findByText('Typhoon Relief');
    fireEvent.change(screen.getByLabelText('Search campaigns'), { target: { value: 'Flood' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ACTIVE' } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/v1/campaigns?page=1&pageSize=12&q=Flood&status=ACTIVE',
      ),
    );
    expect(screen.queryByRole('button', { name: 'Apply filters' })).not.toBeInTheDocument();
  });

  it('lets staff read cards but hides management and protects General Pool', async () => {
    setUser({
      id: 'staff',
      name: 'Staff fixture',
      email: 'staff@example.invalid',
      role: 'STAFF',
      phone: null,
      emailVerified: true,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
    campaigns = [campaign({ name: 'General Pool', isSystem: true })];
    renderPage();
    await screen.findByText('General Pool');
    expect(screen.queryByRole('button', { name: 'Add Campaign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View campaign' }));
    await screen.findByRole('dialog', { name: 'General Pool' });
    expect(screen.queryByRole('button', { name: 'Edit campaign' })).not.toBeInTheDocument();
  });

  it('shows closure blockers and prevents confirmation until work is resolved', async () => {
    campaigns = [campaign({ closureBlockers: [{ blocking: 'requests', count: 2 }] })];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    await screen.findByRole('dialog', { name: 'Complete this campaign?' });
    expect(screen.getByRole('button', { name: 'Yes, complete' })).toBeDisabled();
    expect(screen.getByText(/Resolve first: 2 unresolved requests/)).toBeInTheDocument();
  });

  it('saves an existing campaign without creating a duplicate', async () => {
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    if (!fallback) throw new Error('Missing fixture');
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      options?.method === 'PATCH'
        ? Promise.resolve({ data: campaign({ name: 'Updated Relief' }) })
        : fallback(path, options),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit campaign' }));
    fireEvent.change(await screen.findByLabelText('Campaign name *'), {
      target: { value: 'Updated Relief' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Campaign updated.'));
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.filter(
          ([path, options]) => path === '/api/v1/campaigns' && options?.method === 'POST',
        ),
    ).toHaveLength(0);
  });
});

describe('CampaignsPage create dialog', () => {
  async function openAndFill() {
    renderPage();
    await screen.findByText('Typhoon Relief');
    fireEvent.click(screen.getByRole('button', { name: 'Add Campaign' }));
    fireEvent.change(screen.getByLabelText('Campaign name *'), {
      target: { value: 'Flood Response' },
    });
    fireEvent.change(screen.getByLabelText('Description *'), {
      target: { value: 'Helping flooded barangays.' },
    });
    fireEvent.change(screen.getByLabelText('Start date *'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('End date *'), { target: { value: '2026-11-30' } });
  }

  it('blocks duplicate submissions and dismissal until creation finishes', async () => {
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    if (!fallback) throw new Error('Missing fixture');
    let finish: ((value: unknown) => void) | undefined;
    vi.mocked(apiFetch).mockImplementation((path, options) =>
      path === '/api/v1/campaigns' && options?.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : fallback(path, options),
    );
    await openAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));
    const pending = screen.getByRole('button', { name: 'Creating…' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close campaign form' })).toBeDisabled();
    expect(screen.getByLabelText('Campaign name *')).toBeDisabled();
    fireEvent.click(pending);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish?.({ data: campaign({ status: 'DRAFT' }) });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.filter(
          ([path, options]) => path === '/api/v1/campaigns' && options?.method === 'POST',
        ),
    ).toHaveLength(1);
  });

  it('retries a failed image upload against the saved campaign without creating it twice', async () => {
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    if (!fallback) throw new Error('Missing fixture');
    let uploads = 0;
    vi.mocked(apiFetch).mockImplementation((path, options) => {
      if (path.endsWith('/image') && ++uploads === 1) return Promise.reject(new Error('Offline'));
      return fallback(path, options);
    });
    await openAndFill();
    fireEvent.change(screen.getByLabelText('Campaign image, optional'), {
      target: { files: [new File(['fixture'], 'cover.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));
    const retry = await screen.findByRole('button', { name: 'Retry image upload' });
    expect(screen.getByLabelText('Campaign name *')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(uploads).toBe(2);
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.filter(
          ([path, options]) => path === '/api/v1/campaigns' && options?.method === 'POST',
        ),
    ).toHaveLength(1);
  });

  it('accepts priority goods without a target, matching the shared optional-target contract', async () => {
    await openAndFill();
    await screen.findByRole('option', { name: 'Food Packs (pack)' });
    fireEvent.change(screen.getByLabelText('Priority item 1'), { target: { value: itemType.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));
    await waitFor(() =>
      expect(submittedBody).toMatchObject({
        priorityItems: [{ itemTypeId: itemType.id, targetQuantity: null }],
      }),
    );
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    fireEvent.change(screen.getByLabelText('Area 1 barangay'), { target: { value: 'San Isidro' } });
    fireEvent.change(screen.getByLabelText('Area 1 city'), { target: { value: 'Quezon City' } });
    fireEvent.change(screen.getByLabelText('Area 1 province'), {
      target: { value: 'Metro Manila' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Campaign' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Campaign created.'));
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

    fireEvent.click(await screen.findByRole('button', { name: 'Manage campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    expect(screen.getByText('Activate this campaign?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Activate this campaign?')).toBeNull());

    const notCalled = vi.mocked(apiFetch).mock.calls.some(([path]) => path.endsWith('/activate'));
    expect(notCalled).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Manage campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, activate' }));

    await waitFor(() => {
      const called = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/activate') && options?.method === 'POST',
        );
      expect(called).toBe(true);
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Campaign activated.'));
  });

  it('offers no activation for an already active campaign', async () => {
    campaigns = [campaign({ status: 'ACTIVE' })];
    renderPage();
    await waitFor(() => expect(screen.getByText('Typhoon Relief')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
  });
});
