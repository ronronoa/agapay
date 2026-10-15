import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDashboardPage } from './AdminDashboardPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

function page(total: number, items: unknown[] = []): unknown {
  return { data: { items, page: 1, pageSize: 100, total } };
}

// Ranges whose end is still in the future are the current period; the
// comparison range ends in the past.
function isCurrentPeriod(path: string): boolean {
  const to = new URLSearchParams(path.split('?')[1] ?? '').get('to');
  return to !== null && new Date(to).getTime() > Date.now();
}

function distributionWith(units: number): unknown {
  return {
    id: `dist-${units}`,
    status: 'DISTRIBUTED',
    requestId: 'request-1',
    requestReference: 'REQ-2026-000001',
    calendarEventId: 'event-1',
    eventTitle: 'Flood Relief',
    receivedByName: 'Juan Dela Cruz',
    notes: null,
    items: [
      {
        id: `di-${units}`,
        itemTypeId: 'item-type-1',
        itemTypeName: 'Food Packs',
        unit: 'pack',
        quantity: units,
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

function inventoryRow(itemTypeName: string, available: number, lowStock: boolean): unknown {
  return {
    id: `inv-${itemTypeName}`,
    itemTypeId: 'item-type-1',
    itemTypeName,
    unit: 'pack',
    campaignId: 'campaign-1',
    campaignName: 'General Pool',
    available,
    reserved: 0,
    distributed: 0,
    total: available,
    imageUrl: null,
    lowStockThreshold: 100,
    lowStock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.includes('/donations?status=PENDING')) return Promise.resolve(page(18));
    if (path.includes('/assistance-requests?status=PENDING')) return Promise.resolve(page(12));
    if (path.includes('/inventory?lowStock')) return Promise.resolve(page(5));
    if (path.includes('/donations?status=VERIFIED&from=')) {
      return Promise.resolve(page(isCurrentPeriod(path) ? 9 : 0));
    }
    if (path.includes('/donations?status=VERIFIED')) return Promise.resolve(page(248));
    if (path.includes('/donations?from=')) {
      return Promise.resolve(page(isCurrentPeriod(path) ? 4 : 2));
    }
    if (path.includes('/donations?')) return Promise.resolve(page(4));
    if (path.includes('/distributions?status=DISTRIBUTED&from=')) {
      return Promise.resolve(page(1, [distributionWith(isCurrentPeriod(path) ? 100 : 50)]));
    }
    if (path.includes('/distributions?')) return Promise.resolve(page(2));
    if (path.includes('/assistance-requests?status=DISTRIBUTED&from=')) {
      return Promise.resolve(page(isCurrentPeriod(path) ? 7 : 5));
    }
    if (path.includes('/assistance-requests?status=DISTRIBUTED')) return Promise.resolve(page(7));
    if (path.includes('/assistance-requests?')) return Promise.resolve(page(0));
    if (path.includes('/campaigns?')) return Promise.resolve(page(3));
    if (path.includes('/inventory?')) {
      return Promise.resolve(
        page(2, [inventoryRow('Food Packs', 420, false), inventoryRow('Hygiene Kits', 50, true)]),
      );
    }
    if (path.includes('/audit-logs')) {
      return Promise.resolve({
        data: {
          items: [
            {
              id: 'audit-1',
              action: 'Donation DON-00182 verified',
              entityType: 'Donation',
              entityId: 'donation-1',
              actorId: null,
              actorName: 'Admin Lead',
              metadata: null,
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        },
      });
    }
    if (path.includes('/calendar/events')) {
      const startAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      return Promise.resolve(
        page(1, [
          {
            id: 'event-1',
            type: 'DISTRIBUTION',
            status: 'SCHEDULED',
            title: 'Flood Relief',
            description: null,
            campaignId: 'campaign-1',
            campaignName: 'Flood Relief',
            startAt,
            endAt: startAt,
            location: 'Barangay hall',
            capacity: null,
            syncStatus: 'NOT_SYNCED',
            externalEventId: null,
            createdAt: new Date().toISOString(),
          },
        ]),
      );
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <AdminDashboardPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminDashboardPage', () => {
  it('shows live needs-attention counts', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
    expect(screen.getByText('Donations awaiting verification')).toBeInTheDocument();
    expect(screen.getByText('Assistance requests')).toBeInTheDocument();
  });

  it('links the live queues instead of marking them as soon', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(2));
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/admin/inventory');
  });

  it('computes every percentage from the two periods it fetched', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
    // Beneficiaries served: 7 this month against 5 last month.
    expect(await screen.findAllByText('40%')).toHaveLength(1);
    // Donation activity and goods distributed: both doubled against the
    // comparison period.
    expect(await screen.findAllByText('100%')).toHaveLength(2);
    // Verified donations had no previous-period data, so no pill is shown.
    expect(screen.queryByText('0%')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/12\.5%/);
  });
});
