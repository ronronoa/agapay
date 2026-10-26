import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DonorCampaignPage } from './DonorCampaignPage';
import { DonorMessagesPage } from './DonorMessagesPage';
import { DonorSettingsPage } from './DonorSettingsPage';
import { AdminMessagesPage } from '../admin/AdminMessagesPage';
import { apiFetch } from '../../lib/api-client';

vi.mock('../../lib/api-client', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('../../lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const campaign = {
  id: 'c-1',
  name: 'Typhoon Amihan Relief Drive',
  slug: 'typhoon-amihan',
  description: 'Supporting families.',
  calamityType: 'TYPHOON',
  status: 'ACTIVE',
  isSystem: false,
  startDate: '2026-09-10T00:00:00.000Z',
  endDate: null,
  coverImageUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
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
  vi.mocked(apiFetch).mockResolvedValue({
    data: { items: [campaign], page: 1, pageSize: 100, total: 1 },
  });
});

function renderWith(ui: ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DonorCampaignPage', () => {
  it('lists drives with working detail and donation links', async () => {
    renderWith(<DonorCampaignPage />);
    await waitFor(() =>
      expect(screen.getByText('Typhoon Amihan Relief Drive')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/campaigns/typhoon-amihan',
    );
    expect(screen.getByRole('link', { name: 'Donate goods' })).toHaveAttribute(
      'href',
      `/donate?campaign=${campaign.id}`,
    );
  });
});

describe('DonorMessagesPage', () => {
  it('opens a donor conversation with an enabled plain-text composer', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.includes('/messages?')
          ? { data: [], meta: { nextBefore: null, nextAfter: null } }
          : {
              data: {
                id: '00000000-0000-4000-8000-000000000001',
                donorId: '00000000-0000-4000-8000-000000000002',
                donorName: 'Fixture',
                donorEmail: 'fixture@example.invalid',
                status: 'OPEN',
                revision: 1,
                lastSequence: 0,
                lastMessageAt: '2026-10-22T00:00:00Z',
                unreadCount: 0,
              },
            },
      ),
    );
    renderWith(<DonorMessagesPage />);
    expect(await screen.findByLabelText('Message')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Support question' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });
});

describe('AdminMessagesPage', () => {
  it('loads the staff inbox and provides a donor search', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    renderWith(<AdminMessagesPage />);
    expect(await screen.findByText('No conversations match these filters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search donors')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh messages' })).toBeEnabled();
  });
});

describe('DonorSettingsPage', () => {
  it('renders profile fields with photo and birthday honestly parked', () => {
    renderWith(<DonorSettingsPage />);
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit Photo/ })).toBeDisabled();
  });

  it('requires a name before saving', async () => {
    renderWith(<DonorSettingsPage />);
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));
    await waitFor(() =>
      expect(screen.getByText(/String must contain at least 2 character\(s\)/)).toBeInTheDocument(),
    );
  });
});
