import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ItemTypesPage } from './ItemTypesPage';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import type { ItemTypeDto } from '@agapay/shared';
import { itemTypeListResponseSchema } from '@agapay/shared';

// useApiQuery reads ApiClientError off this module, so the mock must keep it.
vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const item = (overrides: Partial<ItemTypeDto> = {}): ItemTypeDto => ({
  id: 'item-1',
  name: 'Food Pack',
  category: 'FOOD',
  unit: 'pack',
  lowStockThreshold: 20,
  maxPerRequest: null,
  perHouseholdMember: null,
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

function respondWith(items: ItemTypeDto[]): void {
  vi.mocked(apiFetch).mockResolvedValue({
    data: { items, page: 1, pageSize: 25, total: items.length },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithQuery(ui: ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ItemTypesPage', () => {
  it('shows a loading state before the data arrives', () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}));
    renderWithQuery(<ItemTypesPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading item types');
  });

  it('lists item types with their unit and limit', async () => {
    respondWith([item()]);
    const { container } = renderWithQuery(<ItemTypesPage />);

    await waitFor(() => expect(screen.getByText('Food Pack')).toBeInTheDocument());
    expect(screen.getByText('pack')).toBeInTheDocument();
    // Scoped to this render's container: vitest does not unmount between cases,
    // so a page-level query can match a table from an earlier test. The caption
    // is visually hidden, so it is matched by its sr-only class, not by role.
    const caption = container.querySelector('caption');
    expect(caption?.className).toContain('sr-only');
    expect(caption?.textContent).toBe('Item type catalogue');
  });

  it('renders a null limit as "No cap" rather than blank (D-06)', async () => {
    respondWith([item({ maxPerRequest: null, perHouseholdMember: null })]);
    renderWithQuery(<ItemTypesPage />);

    await waitFor(() => expect(screen.getAllByText('No cap').length).toBeGreaterThan(0));
  });

  it('shows an empty state rather than a bare table', async () => {
    respondWith([]);
    const { container } = renderWithQuery(<ItemTypesPage />);

    await waitFor(() => expect(screen.getByText('No item types yet')).toBeInTheDocument());
    expect(container.querySelector('table')).toBeNull();
  });

  it('shows an actionable error with a retry control', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('boom'));
    const { container } = renderWithQuery(<ItemTypesPage />);

    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('never shows status by colour alone', async () => {
    respondWith([item({ isActive: false })]);
    const { container } = renderWithQuery(<ItemTypesPage />);

    await waitFor(() => expect(screen.getByText('Inactive')).toBeInTheDocument());
    // The badge text itself carries the state; no colour-only assertion needed.
    expect(container.querySelector('table')?.textContent).toContain('Inactive');
  });
});

describe('schema contract', () => {
  it('matches the response the API actually returns', () => {
    const parsed = itemTypeListResponseSchema.safeParse({
      data: { items: [item()], page: 1, pageSize: 25, total: 1 },
    });
    expect(parsed.success).toBe(true);
  });

  it('exposes the hook used by the page', () => {
    expect(typeof useApiQuery).toBe('function');
  });
});
