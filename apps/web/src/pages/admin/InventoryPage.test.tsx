import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InventoryPage } from './InventoryPage';
import { apiFetch } from '../../lib/api-client';
import { clearSession, setSession } from '../../lib/session';
import type {
  AuthUserDto,
  CampaignDto,
  InventoryDto,
  InventoryMovementDto,
  ItemTypeDto,
} from '@agapay/shared';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CAMPAIGN_ID = '55555555-5555-4555-8555-555555555555';

function row(overrides: Partial<InventoryDto> = {}): InventoryDto {
  return {
    id: 'inv-1',
    itemTypeId: ITEM_ID,
    itemTypeName: 'Food Packs',
    unit: 'pack',
    campaignId: CAMPAIGN_ID,
    campaignName: 'Typhoon Relief',
    available: 124,
    reserved: 0,
    distributed: 0,
    total: 124,
    lowStockThreshold: 20,
    lowStock: false,
    imageUrl: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function movement(): InventoryMovementDto {
  return {
    id: 'm-1',
    type: 'ADJUSTMENT_IN',
    quantity: 50,
    availableAfter: 124,
    reservedAfter: 0,
    distributedAfter: 0,
    reason: 'Initial supply',
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function campaign(id: string, name: string): CampaignDto {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/ /g, '-'),
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
    requestCount: 0,
    eventCount: 0,
    inventoryCount: 1,
    deletable: false,
  };
}

function itemType(): ItemTypeDto {
  return {
    id: ITEM_ID,
    name: 'Food Packs',
    category: 'FOOD',
    unit: 'pack',
    lowStockThreshold: 20,
    maxPerRequest: null,
    perHouseholdMember: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function admin(): AuthUserDto {
  return {
    id: 'admin-1',
    name: 'Admin Lead',
    email: 'admin@example.com',
    role: 'ADMIN',
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function respondWith(items: InventoryDto[]): void {
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/inventory?')) {
      return Promise.resolve({ data: { items, page: 1, pageSize: 20, total: items.length } });
    }
    if (path.includes('/movements?')) {
      return Promise.resolve({ data: { items: [movement()], page: 1, pageSize: 10, total: 1 } });
    }
    if (path.startsWith('/api/v1/campaigns?')) {
      const campaigns = [
        campaign(CAMPAIGN_ID, 'Typhoon Relief'),
        campaign(OTHER_CAMPAIGN_ID, 'Flood Response'),
      ];
      return Promise.resolve({ data: { items: campaigns, page: 1, pageSize: 100, total: 2 } });
    }
    if (path.startsWith('/api/v1/item-types?')) {
      return Promise.resolve({ data: { items: [itemType()], page: 1, pageSize: 100, total: 1 } });
    }
    return Promise.resolve({ data: row() });
  });
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InventoryPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
  setSession('token', admin());
  respondWith([row()]);
});

describe('InventoryPage', () => {
  it('shows loading before stock arrives', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading inventory');
  });

  it('filters low-stock rows only', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByLabelText('Low stock only'));

    await waitFor(() => {
      const requested = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path]) => path.includes('/api/v1/inventory?') && path.includes('lowStock=true'),
        );
      expect(requested).toBe(true);
    });
  });

  it('shows movement history for a stock row', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Movements' }));

    expect(await screen.findByText('Adjustment in')).toBeInTheDocument();
    expect(screen.getByText(/Initial supply|available 124/)).toBeInTheDocument();
  });

  it('requires a reason before adding supply', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Restock' }));
    fireEvent.change(await screen.findByLabelText('Quantity'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supply' }));

    expect(
      await screen.findByText(
        'Enter the reason for this stock change. Adjustments require a reason.',
      ),
    ).toBeInTheDocument();
    const adjusted = vi
      .mocked(apiFetch)
      .mock.calls.some(
        ([path, options]) => path.endsWith('/adjustments') && options?.method === 'POST',
      );
    expect(adjusted).toBe(false);
  });

  it('transfers stock between campaigns as an admin', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));
    fireEvent.change(await screen.findByLabelText('To campaign'), {
      target: { value: OTHER_CAMPAIGN_ID },
    });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Balance flood response stock.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm transfer' }));

    await waitFor(() => {
      const transferred = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) => path.endsWith('/transfer') && options?.method === 'POST',
        );
      expect(transferred).toBe(true);
    });
    expect(await screen.findByText('Stock transferred.')).toBeInTheDocument();
  });

  it('hides transfers from non-admin staff', async () => {
    clearSession();
    setSession('token', { ...admin(), role: 'STAFF' });
    renderPage();
    await screen.findAllByText('Food Packs');
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull();
  });

  it('shows the photo thumbnail when a row has one', async () => {
    respondWith([row({ imageUrl: '/uploads/inventory/abc123.png' })]);
    const { container } = renderPage();
    await screen.findAllByText('Food Packs');
    // Decorative alt keeps it out of the accessibility tree; check the DOM.
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/uploads/inventory/abc123.png');
  });

  it('rejects a non-image file before uploading', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Photo' }));
    const file = new File(['not a photo'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    expect(await screen.findByText('Photos must be PNG, JPG, or WEBP.')).toBeInTheDocument();
    const uploaded = vi
      .mocked(apiFetch)
      .mock.calls.some(([path, options]) => path.endsWith('/image') && options?.method === 'POST');
    expect(uploaded).toBe(false);
  });

  it('uploads a photo for a row', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Photo' }));
    const file = new File(['pixels'], 'rice.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Photo'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    await waitFor(() => {
      const uploaded = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) =>
            path.endsWith('/inv-1/image') &&
            options?.method === 'POST' &&
            options?.body instanceof FormData,
        );
      expect(uploaded).toBe(true);
    });
    expect(await screen.findByText('Photo saved.')).toBeInTheDocument();
  });

  it('attaches a photo after adding supply', async () => {
    renderPage();
    await screen.findAllByText('Food Packs');
    fireEvent.click(screen.getByRole('button', { name: 'Restock' }));
    fireEvent.change(await screen.findByLabelText('Quantity'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'New arrival.' } });
    const file = new File(['pixels'], 'rice.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Item photo, optional'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm supply' }));

    await waitFor(() => {
      const uploaded = vi
        .mocked(apiFetch)
        .mock.calls.some(
          ([path, options]) =>
            path.endsWith('/inv-1/image') &&
            options?.method === 'POST' &&
            options?.body instanceof FormData,
        );
      expect(uploaded).toBe(true);
    });
    expect(await screen.findByText('Stock added with photo.')).toBeInTheDocument();
  });
});
