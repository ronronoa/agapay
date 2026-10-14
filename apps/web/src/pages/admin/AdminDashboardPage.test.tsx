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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.includes('/donations?status=PENDING')) return Promise.resolve(page(18));
    if (path.includes('/assistance-requests?status=PENDING')) return Promise.resolve(page(12));
    if (path.includes('/inventory?lowStock')) return Promise.resolve(page(5));
    if (path.includes('/donations?status=VERIFIED')) return Promise.resolve(page(9));
    if (path.includes('/donations?')) return Promise.resolve(page(4));
    if (path.includes('/distributions?')) return Promise.resolve(page(2));
    if (path.includes('/assistance-requests?status=DISTRIBUTED')) {
      return Promise.resolve(page(7));
    }
    if (path.includes('/assistance-requests?')) return Promise.resolve(page(0));
    if (path.includes('/campaigns?')) return Promise.resolve(page(3));
    if (path.includes('/inventory?')) return Promise.resolve(page(0));
    if (path.includes('/audit-logs')) {
      return Promise.resolve({ data: { items: [], nextCursor: null } });
    }
    if (path.includes('/calendar/events')) return Promise.resolve(page(3));
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

  it('shows queues as honestly pending instead of linking dead ends', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/soon/i).length).toBeGreaterThan(0));
  });

  it('publishes no fabricated deltas', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument());
    expect(container.textContent ?? '').not.toMatch(/\+\d+(\.\d+)?%/);
    expect(container.textContent ?? '').not.toMatch(/this month/i);
  });
});
