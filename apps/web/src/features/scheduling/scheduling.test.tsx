import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CalendarPage } from './CalendarPage';
import { DistributionsPage } from './DistributionsPage';
import { fetchAll, localDate, manilaIso } from './shared';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({ apiFetch: vi.fn() }));
const campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test relief',
  slug: 'test-relief',
  description: 'Test',
  calamityType: 'TYPHOON',
  status: 'ACTIVE',
  isSystem: false,
  startDate: '2026-10-01T00:00:00Z',
  endDate: null,
  coverImageUrl: null,
  createdAt: '2026-10-01T00:00:00Z',
  areas: [],
  priorityItems: [],
  donationCount: 0,
  requestCount: 0,
  eventCount: 0,
  inventoryCount: 0,
  deletable: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  vi.mocked(apiFetch).mockImplementation((path) =>
    Promise.resolve({
      data: {
        items: path.startsWith('/api/v1/campaigns') ? [campaign] : [],
        total: path.startsWith('/api/v1/campaigns') ? 1 : 0,
        page: 1,
        pageSize: 100,
      },
    }),
  );
});
function show(component: React.ReactNode, route = '/') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[route]}>{component}</MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('M4 scheduling screens', () => {
  it('opens the event form from a date and keeps accessible labels', async () => {
    show(<CalendarPage />);
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Create event on / }).length).toBeGreaterThan(
        0,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Starts')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('Location')).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('defaults to list on phones and shows an honest empty state', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    show(<CalendarPage />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/No events in this month/)).toBeInTheDocument();
  });
  it('shows fetch failures with retry instead of an empty calendar', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Calendar unavailable'));
    show(<CalendarPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Calendar unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('opens scheduling from the distributions page', async () => {
    show(<DistributionsPage />);
    expect(await screen.findByText('No distributions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule beneficiary' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Approved request')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Reserve and schedule' })).toBeDisabled();
  });
  it('fetches every page rather than truncating at 100 events', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve({
        data: {
          items: path.includes('page=1&')
            ? Array.from({ length: 100 }, (_, id) => ({ id }))
            : [{ id: 100 }],
          total: 101,
        },
      }),
    );
    const rows = await fetchAll('/events', z.object({ id: z.number() }));
    expect(rows).toHaveLength(101);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
  it('converts Manila input independently of the browser timezone', () => {
    expect(manilaIso('2026-11-01T09:30')).toBe('2026-11-01T01:30:00.000Z');
    expect(localDate('2026-10-31T23:30:00.000Z')).toBe('2026-11-01T07:30');
  });
});
