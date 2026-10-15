import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type * as ApiClientModule from '../../lib/api-client';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RequestAssistancePage } from './RequestAssistancePage';
import { apiFetch, ApiClientError } from '../../lib/api-client';

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
  areas: [{ barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' }],
  priorityItems: [],
};

const foodItem = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Food Pack',
  unit: 'pack',
  category: 'FOOD',
  maxPerRequest: 5,
  perHouseholdMember: null,
};

const waterItem = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Drinking Water',
  unit: 'liter',
  category: 'WATER',
  maxPerRequest: null,
  perHouseholdMember: null,
};

function mockGet(path: string): unknown {
  if (path.startsWith('/api/v1/public/campaigns')) {
    return { data: { items: [campaign], page: 1, pageSize: 100, total: 1 } };
  }
  return { data: { items: [foodItem, waterItem], page: 1, pageSize: 100, total: 2 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/public/')) return Promise.resolve(mockGet(path));
    return Promise.reject(new Error(`unexpected POST ${path}`));
  });
});

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/request-assistance']}>
        <RequestAssistancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillValidForm(): void {
  fireEvent.change(screen.getByLabelText('Relief campaign'), {
    target: { value: campaign.id },
  });
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Maria Santos' } });
  fireEvent.change(screen.getByLabelText('Email Address'), {
    target: { value: 'maria@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Contact Number'), { target: { value: '9171234567' } });
  fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'San Isidro' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Quezon City' } });
  fireEvent.change(screen.getByLabelText('Province'), { target: { value: 'Metro Manila' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Food Pack/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
}

describe('RequestAssistancePage', () => {
  it('renders the beneficiary form from the approved mockup', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    expect(screen.getByText('Register to request assistance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for Verification' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Have Already Submitted' })).toHaveAttribute(
      'href',
      '/track',
    );
  });

  it('shows cap hints from the goods catalogue', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Up to 5 per request')).toBeInTheDocument());
  });

  it('blocks submit until consent is checked without calling the API', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Maria Santos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }));

    await waitFor(() => expect(screen.getByText(/Consent is required/)).toBeInTheDocument());
    const posts = vi
      .mocked(apiFetch)
      .mock.calls.filter(
        ([, options]) => (options as { method?: string } | undefined)?.method === 'POST',
      );
    expect(posts).toHaveLength(0);
  });

  it('shows the reference number after a successful submit', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    fillValidForm();
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/public/assistance-requests') {
        return Promise.resolve({ data: { referenceNumber: 'REQ-2026-004281', status: 'PENDING' } });
      }
      return Promise.resolve(mockGet(path));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }));

    await waitFor(() => expect(screen.getByText('REQ-2026-004281')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Track my request' })).toHaveAttribute(
      'href',
      '/track',
    );
  });

  it('points duplicate submissions at the tracking page', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    fillValidForm();
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/public/assistance-requests') {
        return Promise.reject(
          new ApiClientError(
            'DUPLICATE_ACTIVE_REQUEST',
            'Already active.',
            409,
            'req-1',
            undefined,
          ),
        );
      }
      return Promise.resolve(mockGet(path));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Go to the tracking page' })).toBeInTheDocument(),
    );
  });

  it('groups goods by category with counts', async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    const summaries = [...container.querySelectorAll('summary')].map(
      (node) => node.textContent ?? '',
    );
    expect(summaries.some((text) => text.includes('Food'))).toBe(true);
    expect(summaries.some((text) => text.includes('Water'))).toBe(true);
    expect(summaries.some((text) => text.includes('1 good'))).toBe(true);
  });

  it('submits selections from collapsed groups', async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    fillValidForm();
    container.querySelectorAll('details').forEach((group) => group.setAttribute('open', ''));
    fireEvent.click(screen.getByRole('checkbox', { name: /Drinking Water/ }));
    let submitted: unknown = null;
    vi.mocked(apiFetch).mockImplementation((path: string, options?: { body?: unknown }) => {
      if (path === '/api/v1/public/assistance-requests') {
        submitted = (options as { body?: unknown } | undefined)?.body;
        return Promise.resolve({ data: { referenceNumber: 'REQ-2026-004282', status: 'PENDING' } });
      }
      return Promise.resolve(mockGet(path));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for Verification' }));

    await waitFor(() => expect(screen.getByText('REQ-2026-004282')).toBeInTheDocument());
    const body = submitted as { items?: { itemTypeId?: string }[] } | null;
    const ids = (body?.items ?? []).map((item) => item.itemTypeId).sort();
    expect(ids).toEqual([foodItem.id, waterItem.id].sort());
  });

  it('starts every goods group collapsed and narrows them with the filter', async () => {
    const { container } = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Typhoon Amihan/ })).toBeInTheDocument(),
    );
    const groups = [...container.querySelectorAll('details')];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => !group.open)).toBe(true);

    const filter = screen.getByLabelText('Find a good');
    fireEvent.change(filter, { target: { value: 'water' } });
    const summaries = [...container.querySelectorAll('summary')].map(
      (node) => node.textContent ?? '',
    );
    expect(summaries.some((text) => text.includes('Water'))).toBe(true);
    expect(summaries.some((text) => text.includes('Food'))).toBe(false);

    fireEvent.change(filter, { target: { value: 'no such good' } });
    expect(screen.getByText('No goods match that filter.')).toBeInTheDocument();
  });
});
