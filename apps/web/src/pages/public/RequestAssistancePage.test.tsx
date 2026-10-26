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
    return {
      data: { items: campaignItems, page: 1, pageSize: 100, total: campaignItems.length },
    };
  }
  return { data: { items: [foodItem, waterItem], page: 1, pageSize: 100, total: 2 } };
}

let campaignItems: unknown[] = [campaign];

beforeEach(() => {
  vi.clearAllMocks();
  campaignItems = [campaign];
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith('/api/v1/public/')) return Promise.resolve(mockGet(path));
    return Promise.reject(new Error(`unexpected POST ${path}`));
  });
});

function renderPage(entry = '/request-assistance'): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <RequestAssistancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillStepOne(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'Maria Santos' } });
  fireEvent.change(screen.getByLabelText('Email address *'), {
    target: { value: 'maria@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Mobile number *'), { target: { value: '9171234567' } });
  // Location selects are filled from the campaign areas query, which may still
  // be loading (or empty), so wait for the option before choosing it.
  const barangays = await screen.findAllByRole('option', { name: 'San Isidro' });
  if (barangays.length === 0) return;
  fireEvent.change(screen.getByLabelText('Barangay *'), { target: { value: 'San Isidro' } });
  fireEvent.change(screen.getByLabelText('City or municipality *'), {
    target: { value: 'Quezon City' },
  });
  fireEvent.change(screen.getByLabelText('Province *'), { target: { value: 'Metro Manila' } });
}

// A second area proves the city list narrows to the chosen barangay.
const multiAreaCampaign = {
  ...campaign,
  areas: [
    { barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila' },
    { barangay: 'Poblacion', city: 'Makati City', province: 'Metro Manila' },
  ],
};

function fillStepTwo(): void {
  fireEvent.change(screen.getByLabelText('Relief campaign *'), {
    target: { value: campaign.id },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: /Food Pack/ }));
}

describe('RequestAssistancePage', () => {
  it('applies reviewed goods while leaving identity, consent and submission to the visitor', async () => {
    const fields = { campaignId: campaign.id, items: [{ itemTypeId: foodItem.id, quantity: 2 }] };
    renderPage(
      `/request-assistance?${new URLSearchParams({ campaign: campaign.id, goods: JSON.stringify(fields) })}`,
    );
    await screen.findByRole('option', { name: 'San Isidro' });
    expect(screen.getByLabelText('Full name *')).toHaveValue('');
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    expect(await screen.findByLabelText('Relief campaign *')).toHaveValue(campaign.id);
    fireEvent.click(screen.getByText('Food'));
    expect(screen.getByRole('checkbox', { name: /Food Pack/ })).toBeChecked();
    expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === 'POST')).toBe(
      false,
    );
  });
  it('opens on personal information with a progress indicator and no role toggle', () => {
    renderPage();
    expect(screen.getByText('Request relief assistance')).toBeInTheDocument();
    expect(screen.getByLabelText('Step 1 of 3: Your information')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue to assistance needs →' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Choose a role' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Register to donate goods' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('blocks Continue on step one until the personal details are valid', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'Maria Santos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.queryByLabelText('Relief campaign *')).toBeNull();
  });

  it('summarises invalid fields accessibly and keeps focus on the summary', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((node) => node.textContent?.includes('There is a problem')),
      ).toBe(true),
    );
    const summary = screen
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('There is a problem'));
    expect(summary).toHaveTextContent('Full name');
    expect(summary).toHaveTextContent('Email address');
    expect(document.activeElement).toBe(summary);
  });

  it('offers the campaign areas as barangay and city choices', async () => {
    campaignItems = [multiAreaCampaign];
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Poblacion' })).toBeInTheDocument(),
    );
    // Cities narrow to the chosen barangay.
    fireEvent.change(screen.getByLabelText('Barangay *'), { target: { value: 'Poblacion' } });
    const cities = screen.getAllByRole('option').map((node) => node.textContent ?? '');
    expect(cities).toContain('Makati City');
    expect(cities).not.toContain('Quezon City');
  });

  it('explains when no active campaign exists and blocks the form', async () => {
    campaignItems = [];
    renderPage();
    expect(await screen.findByText('No active relief campaigns right now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to assistance needs →' })).toBeDisabled();
  });

  it('explains when a campaign has no affected areas', async () => {
    campaignItems = [{ ...campaign, id: 'no-area', name: 'No Area Campaign', areas: [] }, campaign];
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Relief campaign *'), { target: { value: 'no-area' } });

    expect(await screen.findByText(/has no affected areas yet/)).toBeInTheDocument();
  });

  it('moves to assistance needs and keeps entries when going back', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));

    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    expect(screen.getByLabelText('Step 2 of 3: Assistance needs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    await waitFor(() => expect(screen.getByLabelText('Full name *')).toBeInTheDocument());
    expect(screen.getByLabelText('Full name *')).toHaveValue('Maria Santos');
    expect(screen.getByLabelText('Email address *')).toHaveValue('maria@example.com');
  });

  it('shows cap hints from the goods catalogue', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByText('Up to 5 per request')).toBeInTheDocument());
  });

  it('reviews details with edit actions before submitting', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fillStepTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));

    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(/Typhoon Amihan/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Submit assistance request' })).toBeInTheDocument();
  });

  it('blocks submit until consent is checked without calling the API', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fillStepTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Submit assistance request' }));

    await waitFor(() => expect(screen.getByText(/Consent is required/)).toBeInTheDocument());
    const posts = vi
      .mocked(apiFetch)
      .mock.calls.filter(
        ([, options]) => (options as { method?: string } | undefined)?.method === 'POST',
      );
    expect(posts).toHaveLength(0);
  });

  it('shows the reference number with copy and tracking after submit', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fillStepTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
    vi.mocked(apiFetch).mockImplementation((path: string) => {
      if (path === '/api/v1/public/assistance-requests') {
        return Promise.resolve({ data: { referenceNumber: 'REQ-2026-004281', status: 'PENDING' } });
      }
      return Promise.resolve(mockGet(path));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit assistance request' }));

    await waitFor(() => expect(screen.getByText('REQ-2026-004281')).toBeInTheDocument());
    expect(screen.getByText(/awaiting review/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy reference' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Track my request' })).toHaveAttribute(
      'href',
      '/track',
    );
  });

  it('points duplicate submissions at the tracking page', async () => {
    renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fillStepTwo();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Submit assistance request' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Go to the tracking page' })).toBeInTheDocument(),
    );
  });

  it('submits selections from collapsed groups', async () => {
    const { container } = renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fillStepTwo();
    container.querySelectorAll('details').forEach((group) => group.setAttribute('open', ''));
    fireEvent.click(screen.getByRole('checkbox', { name: /Drinking Water/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
    let submitted: unknown = null;
    vi.mocked(apiFetch).mockImplementation((path: string, options?: { body?: unknown }) => {
      if (path === '/api/v1/public/assistance-requests') {
        submitted = (options as { body?: unknown } | undefined)?.body;
        return Promise.resolve({ data: { referenceNumber: 'REQ-2026-004282', status: 'PENDING' } });
      }
      return Promise.resolve(mockGet(path));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit assistance request' }));

    await waitFor(() => expect(screen.getByText('REQ-2026-004282')).toBeInTheDocument());
    const body = submitted as { items?: { itemTypeId?: string }[] } | null;
    const ids = (body?.items ?? []).map((item) => item.itemTypeId).sort();
    expect(ids).toEqual([foodItem.id, waterItem.id].sort());
  });

  it('starts every goods group collapsed and narrows them with the filter', async () => {
    const { container } = renderPage();
    await fillStepOne();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
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

describe('RequestAssistancePage outside-area escape hatch', () => {
  it('swaps the location selects for free text and back', async () => {
    renderPage();
    await screen.findAllByRole('option', { name: 'San Isidro' });
    expect(screen.getByLabelText('Barangay *').tagName).toBe('SELECT');

    fireEvent.click(screen.getByLabelText(/isn.t in the list/));
    expect(screen.getByLabelText('Barangay *').tagName).toBe('INPUT');
    expect(screen.getByLabelText('City or municipality *').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Province *').tagName).toBe('INPUT');
    expect(screen.getByText(/reviewed by staff/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/isn.t in the list/));
    expect(screen.getByLabelText('Barangay *').tagName).toBe('SELECT');
  });

  it('submits a typed location when the area is not listed', async () => {
    let submitted: unknown = null;
    vi.mocked(apiFetch).mockImplementation((path: string, options?: { body?: unknown }) => {
      if (path === '/api/v1/public/assistance-requests') {
        submitted = options?.body;
        return Promise.resolve({ data: { referenceNumber: 'REQ-2026-009999', status: 'PENDING' } });
      }
      return Promise.resolve(mockGet(path));
    });
    renderPage();
    await screen.findAllByRole('option', { name: 'San Isidro' });
    fireEvent.change(screen.getByLabelText('Full name *'), { target: { value: 'Maria Santos' } });
    fireEvent.change(screen.getByLabelText('Email address *'), {
      target: { value: 'maria@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Mobile number *'), { target: { value: '9171234567' } });
    fireEvent.click(screen.getByLabelText(/isn.t in the list/));
    fireEvent.change(screen.getByLabelText('Barangay *'), { target: { value: 'Barangay 999' } });
    fireEvent.change(screen.getByLabelText('City or municipality *'), {
      target: { value: 'Remote Town' },
    });
    fireEvent.change(screen.getByLabelText('Province *'), { target: { value: 'Isabela' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to assistance needs →' }));
    await waitFor(() => expect(screen.getByLabelText('Relief campaign *')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Relief campaign *'), {
      target: { value: campaign.id },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Food Pack/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    await waitFor(() => expect(screen.getByText('Check your details')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /I consent/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit assistance request' }));

    await waitFor(() => expect(screen.getByText('REQ-2026-009999')).toBeInTheDocument());
    const body = submitted as { barangay?: string; city?: string; province?: string } | null;
    expect(body?.barangay).toBe('Barangay 999');
    expect(body?.city).toBe('Remote Town');
    expect(body?.province).toBe('Isabela');
  });
});
