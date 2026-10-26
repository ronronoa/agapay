import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CalendarPage } from './CalendarPage';
import { DistributionsPage } from './DistributionsPage';
import { fetchAll, localDate, manilaIso } from './shared';
import { apiFetch } from '../../lib/api-client';
import { toast } from 'sonner';
import { updateCalendarEventSchema } from '@agapay/shared';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
  it('confirms a saved event once through a toast without a page banner', async () => {
    show(<CalendarPage />);
    const day = (await screen.findAllByRole('button', { name: /^Create event on / }))[0];
    if (!day) throw new Error('Expected calendar days.');
    fireEvent.click(day);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Relief distribution' } });
    await within(screen.getByRole('dialog')).findByRole('option', { name: campaign.name });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Campaign'), {
      target: { value: campaign.id },
    });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Community hall' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledExactlyOnceWith('Event updated.'));
    expect(screen.queryByText('Event updated.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('uses the entire day box as the creation button and preselects its date', async () => {
    show(<CalendarPage />);
    const day = (await screen.findAllByRole('button', { name: /^Create event on / }))[0];
    expect(day).toHaveClass('absolute', 'inset-0', 'size-full');
    if (!day) throw new Error('Expected calendar days.');
    const date = day.getAttribute('aria-label')?.replace('Create event on ', '');
    fireEvent.click(day);
    expect(screen.getByLabelText('Starts')).toHaveValue(`${date}T09:00`);
    expect(screen.getByLabelText('Ends')).toHaveValue(`${date}T12:00`);
  });
  it('opens an existing event without triggering creation on its day', async () => {
    const date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const event = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'COLLECTION',
      status: 'SCHEDULED',
      title: 'Existing collection',
      description: null,
      campaignId: campaign.id,
      campaignName: campaign.name,
      startAt: `${date}T01:00:00Z`,
      endAt: `${date}T04:00:00Z`,
      location: 'Covered court',
      capacity: null,
      syncStatus: 'NOT_SYNCED',
      revision: 1,
      occupied: 0,
      outstandingCollections: 0,
      outstandingDistributions: 0,
      syncEnabled: false,
      externalEventId: null,
      createdAt: '2026-10-01T00:00:00Z',
    };
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.endsWith(`/calendar/events/${event.id}`)
          ? { data: event }
          : {
              data: {
                items: path.startsWith('/api/v1/campaigns')
                  ? [campaign]
                  : path.startsWith('/api/v1/calendar/events?')
                    ? [event]
                    : [],
                total:
                  path.startsWith('/api/v1/campaigns') ||
                  path.startsWith('/api/v1/calendar/events?')
                    ? 1
                    : 0,
              },
            },
      ),
    );
    show(<CalendarPage />);
    const button = await screen.findByRole('button', { name: /Existing collection/ });
    expect(button.closest('button')?.parentElement?.closest('button')).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Existing collection' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create event' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit event' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Event type')).toBeEnabled();
    expect(within(screen.getByRole('dialog')).getByLabelText('Campaign')).toBeEnabled();
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Event type'), {
      target: { value: 'DONATION_DRIVE' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const patch = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(updateCalendarEventSchema.parse(patch?.[1]?.body)).toMatchObject({
      type: 'DONATION_DRIVE',
      campaignId: campaign.id,
      revision: 1,
    });
  });
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
    fireEvent.click(screen.getByRole('button', { name: 'Close event form' }));
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
