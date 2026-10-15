import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HomePage } from './HomePage';
import { apiFetch } from '../lib/api-client';

vi.mock('../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const drive = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Typhoon Amihan Relief Drive',
  slug: 'typhoon-amihan',
  description: 'Supporting families affected by severe flooding.',
  calamityType: 'TYPHOON',
  status: 'ACTIVE',
  startDate: '2026-09-10T00:00:00.000Z',
  endDate: '2026-10-10T00:00:00.000Z',
  areas: [{ barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' }],
  priorityItems: [],
};

const stats = {
  data: { beneficiariesServed: 1289, goodsDistributedThisMonth: 3240, verifiedDonations: 248 },
};

let drives: unknown[] = [drive];

beforeEach(() => {
  vi.clearAllMocks();
  drives = [drive];
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/public/stats')) return Promise.resolve(stats);
    return Promise.resolve({ data: { items: drives, page: 1, pageSize: 6, total: drives.length } });
  });
});

function renderHome(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = <HomePage />;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  it('renders the hero heading', () => {
    renderHome();
    expect(
      screen.getByRole('heading', { name: /connecting donors with communities hit by calamity/i }),
    ).toBeInTheDocument();
  });

  it('links CTAs at live destinations only', () => {
    renderHome();
    const requestLink = screen.getByRole('link', { name: /request aid now/i });
    const donateLink = screen.getByRole('link', { name: /donate goods/i });
    expect(requestLink).toHaveAttribute('href', '/request-assistance');
    expect(donateLink).toHaveAttribute('href', '/campaigns');
  });

  it('renders the "What Agapay responds to" section with three cards', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: /what agapay responds to/i })).toBeInTheDocument();
    expect(screen.getByText(/Spirit of Kapit-Bisig/)).toBeInTheDocument();
    expect(screen.getByText(/Filipinos Take Care of Their Own/)).toBeInTheDocument();
    expect(screen.getByText(/No One Faces Life Alone/)).toBeInTheDocument();
  });

  it('renders live relief drives instead of fixed area claims', async () => {
    renderHome();
    expect(
      screen.getByRole('heading', { name: /affected areas of the philippines/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Typhoon Amihan Relief Drive')).toBeInTheDocument(),
    );
  });

  it('states honestly when no drives are active', async () => {
    drives = [];
    renderHome();
    await waitFor(() => expect(screen.getByText('No active drives right now')).toBeInTheDocument());
  });

  it('renders the mission section with verifiable claims', () => {
    renderHome();
    expect(
      screen.getByRole('heading', {
        name: /connecting those who can help with those who need it most/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/verified needs/i)).toBeInTheDocument();
    expect(screen.getByText(/live status updates/i)).toBeInTheDocument();
  });

  it('shows the hero impact figures from the public stats endpoint', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText('1,289')).toBeInTheDocument());
    expect(screen.getByText('Beneficiaries served')).toBeInTheDocument();
    expect(screen.getByText('3,240')).toBeInTheDocument();
    expect(screen.getByText('248')).toBeInTheDocument();
  });

  it('offers working paths instead of a newsletter form', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /request assistance/i })).toHaveAttribute(
      'href',
      '/request-assistance',
    );
    expect(screen.getByRole('link', { name: /track a request/i })).toHaveAttribute(
      'href',
      '/track',
    );
    expect(screen.queryByRole('button', { name: /join/i })).toBeNull();
  });

  it('shows a loading state when told data is in flight', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomePage isLoading />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('publishes no unverifiable claims (hard rule 12)', () => {
    const { container } = renderHome();
    const text = container.textContent?.toLowerCase() ?? '';
    for (const banned of ['trusted by', 'testimonial', 'lives impacted', 'real-time tracking']) {
      expect(text).not.toContain(banned);
    }
  });
});
