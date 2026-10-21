import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDashboardPage } from './AdminDashboardPage';
import { apiFetch } from '../../lib/api-client';
import type { AdminDashboardResponse } from '@agapay/shared';

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiClientModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
const period = { from: '2026-10-31T16:00:00.000Z', to: '2026-11-30T16:00:00.000Z' };
const dashboard: AdminDashboardResponse['data'] = {
  asOf: '2026-11-01T00:00:00.000Z',
  periods: { thisMonth: period, lastMonth: period, thisWeek: period, lastWeek: period },
  needsAttention: {
    donationsAwaitingVerification: 118,
    requestsAwaitingReview: 12,
    lowStockItems: 5,
    distributionsToday: 3,
  },
  awaitingStock: 2,
  donationActivity: { thisWeek: 204, lastWeek: 102, byWeekday: [101, 103, 0, 0, 0, 0, 0] },
  goodsDistributed: { thisMonth: 1000, lastMonth: 500, lastWeek: 50 },
  beneficiariesServed: { total: 107, thisMonth: 7, lastMonth: 5 },
  verifiedDonations: { total: 248, thisMonth: 9, lastMonth: 0 },
  activeCampaigns: 3,
  upcomingDistributions: [
    {
      id: 'event-1',
      title: 'Flood Relief',
      campaignName: 'Relief',
      startAt: '2026-10-31T16:30:00.000Z',
      endAt: '2026-11-01T01:00:00.000Z',
    },
  ],
  inventory: [
    {
      id: 'stock-1',
      itemTypeName: 'Food Packs',
      campaignName: 'Relief',
      unit: 'pack',
      available: 420,
      lowStock: false,
    },
  ],
  recentActivity: [
    {
      id: 'audit-1',
      action: 'donation.verify',
      entityType: 'Donation',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockResolvedValue({ data: dashboard });
});
afterEach(cleanup);
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <AdminDashboardPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminDashboardPage', () => {
  it('uses a single summary rather than truncated lists', async () => {
    renderPage();
    expect(await screen.findByText('118')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText(/2 approved requests await stock/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/dashboard/admin');
  });
  it('links operational queues', async () => {
    renderPage();
    await screen.findByText('118');
    expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/admin/inventory');
  });
  it('computes deltas from server periods and omits a zero baseline', async () => {
    renderPage();
    await screen.findByText('118');
    expect(screen.getAllByText('40%')).toHaveLength(1);
    expect(screen.getAllByText('100%')).toHaveLength(2);
    expect(screen.queryByText('0%')).toBeNull();
  });
  it('shows loading and retry errors instead of zero totals', async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    const view = renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
    expect(screen.queryByText('118')).toBeNull();
    view.unmount();
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({ data: dashboard });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('118');
  });
  it('renders empty sections and refreshes explicitly', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: {
        ...dashboard,
        donationActivity: { thisWeek: 0, lastWeek: 0, byWeekday: [0, 0, 0, 0, 0, 0, 0] },
        upcomingDistributions: [],
        inventory: [],
        recentActivity: [],
      },
    });
    renderPage();
    await screen.findByText('Nothing scheduled right now.');
    expect(screen.getByText('No donations this week.')).toBeInTheDocument();
    expect(screen.getByText('No stock rows yet.')).toBeInTheDocument();
    expect(screen.getByText('No recorded activity yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });
});
