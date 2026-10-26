import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicCampaignLayout } from '../../components/layout/PublicCampaignLayout';
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
  coverImageUrl: '/uploads/campaigns/cover.png',
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
      <MemoryRouter initialEntries={['/campaigns']}>
        <Routes>
          <Route element={<PublicCampaignLayout />}>
            <Route path="/campaigns" element={ui} />
          </Route>
        </Routes>
      </MemoryRouter>
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
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '#top');
    const cover = screen.getByAltText('');
    expect(cover).toHaveAttribute('src', expect.stringContaining('/uploads/campaigns/cover.png'));
    fireEvent.error(cover);
    expect(screen.getByText('No campaign image')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Request assistance' }),
    ).toHaveAttribute('href', expect.stringContaining('/request-assistance?campaign='));
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
  it('paginates server results and resets to the first page when searching', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { items: [campaign], page: 1, pageSize: 12, total: 13 },
    });
    renderPage();
    await screen.findByText(campaign.name);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/public/campaigns?page=2&pageSize=12'),
    );
    fireEvent.change(screen.getByLabelText('Search campaigns'), { target: { value: 'Amihan' } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/api/v1/public/campaigns?page=1&pageSize=12&q=Amihan'),
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});
