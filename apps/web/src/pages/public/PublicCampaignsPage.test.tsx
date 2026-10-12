import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PublicCampaignsPage } from './PublicCampaignsPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Typhoon Amihan Relief Drive',
  slug: 'typhoon-amihan',
  description: 'Supporting families affected by severe flooding.',
  calamityType: 'TYPHOON',
  status: 'ACTIVE',
  startDate: '2026-09-10T00:00:00.000Z',
  endDate: '2026-10-10T00:00:00.000Z',
  areas: [],
  priorityItems: [{ itemTypeId: 'i-1', itemName: 'Food Pack', unit: 'pack', targetQuantity: 500 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <PublicCampaignsPage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PublicCampaignsPage', () => {
  it('lists active campaigns with a request path', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [campaign], page: 1, pageSize: 100, total: 1 },
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Typhoon Amihan Relief Drive')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Food Pack/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request assistance' })).toHaveAttribute(
      'href',
      expect.stringContaining('/request-assistance?campaign='),
    );
  });

  it('shows an empty state when no drives are active', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [], page: 1, pageSize: 100, total: 0 },
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('No active campaigns right now')).toBeInTheDocument(),
    );
  });
});
