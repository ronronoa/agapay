import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonorDashboardPage } from './DonorDashboardPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const dashboard = {
  data: {
    totalDonations: 12,
    byStatus: [{ status: 'COMPLETED', count: 12 }],
    totalItemsReceived: 1250,
    campaignsSupported: 5,
    activeCampaigns: 3,
    donationsThisMonth: 2,
    featuredCampaign: {
      id: 'c-2',
      name: 'Typhoon Kristine Relief',
      slug: 'typhoon-kristine',
      endDate: null,
      goalUnits: null,
      raisedUnits: 0,
    },
    recent: [
      {
        id: 'd-1',
        referenceNumber: 'DON-2026-000101',
        status: 'COMPLETED',
        campaignId: 'c-1',
        campaignName: 'Flood Relief',
        submittedAt: '2026-09-20T00:00:00.000Z',
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockResolvedValue(dashboard);
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <DonorDashboardPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DonorDashboardPage', () => {
  it('shows live totals with no invented deltas', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('Total donations')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
    expect(screen.getByText('Flood Relief')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/\+\d+(\.\d+)?%/);
    expect(screen.getByText('+2 this month')).toBeInTheDocument();
  });

  it('labels the assistant as coming soon instead of faking it', () => {
    renderPage();
    const button = screen.getByRole('button', { name: /agapay ai/i });
    expect(button).toBeDisabled();
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('links the donation card at the live campaign list', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Donate Now/i })).toHaveAttribute(
      'href',
      '/donor/campaign',
    );
  });

  it('features a live campaign and stays honest when no goal is set', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('Featured campaign')).toBeInTheDocument();
    expect(screen.getByText('No goal set for this campaign yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support this campaign' })).toHaveAttribute(
      'href',
      '/donate?campaign=c-2',
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});
