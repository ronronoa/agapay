import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from '@agapay/shared';
import type * as ApiClientModule from '../../lib/api-client';
import { apiFetch } from '../../lib/api-client';
import { ReportsPage } from './ReportsPage';

vi.mock('../../lib/api-client', async () => ({
  ...(await vi.importActual<typeof ApiClientModule>('../../lib/api-client')),
  apiFetch: vi.fn(),
}));
const campaign = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: `Campaign ${index}`,
  slug: `campaign-${index}`,
  description: 'Fixture',
  calamityType: 'FLOOD',
  status: 'ACTIVE',
  isSystem: false,
  startDate: '2026-01-01',
  endDate: null,
  coverImageUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  deletable: false,
});
const base = { asOf: '2026-11-01T00:00:00.000Z', from: null, to: null, campaignId: null };
const donationReport: Report = {
  ...base,
  kind: 'donations',
  total: 121,
  byStatus: [{ status: 'COMPLETED', count: 121 }],
  byCampaign: [{ campaignId: campaign(0).id, campaignName: 'Campaign 0', count: 121 }],
  byItem: [
    { itemTypeId: 'item', itemTypeName: 'Food packs', unit: 'pack', declared: 605, received: 363 },
  ],
  byMonth: [{ month: '2026-11', count: 121 }],
};
const requestReport: Report = {
  ...base,
  kind: 'requests',
  total: 3,
  averageReviewHours: 3,
  byStatus: [],
  byCampaign: [],
  byBarangay: [],
};
const distributionReport: Report = {
  ...base,
  kind: 'distributions',
  total: 2,
  units: 15,
  byCampaign: [],
  byItem: [{ itemTypeId: 'food', itemTypeName: 'Food packs', unit: 'pack', quantity: 15 }],
  byBarangay: [],
};
const inventoryReport: Report = {
  ...base,
  kind: 'inventory',
  total: 30,
  lowStockRows: 0,
  stock: Array.from({ length: 30 }, (_, index) => ({
    campaignName: 'Campaign 0',
    itemTypeName: `Stock ${index}`,
    unit: 'pack',
    available: index,
    reserved: 0,
    distributed: 0,
    lowStock: false,
  })),
  movements: [],
};
function result(path: string): unknown {
  const params = new URLSearchParams(path.split('?')[1]);
  if (path.includes('/campaigns')) {
    const page = Number(params.get('page'));
    return {
      data: {
        items: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) =>
          campaign(page === 1 ? index : 100),
        ),
        total: 101,
      },
    };
  }
  const report = path.includes('/requests?')
    ? requestReport
    : path.includes('/inventory?')
      ? inventoryReport
      : path.includes('/distributions?')
        ? distributionReport
        : donationReport;
  return {
    data: {
      ...report,
      from: params.get('from'),
      to: params.get('to'),
      campaignId: params.get('campaignId'),
    },
  };
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation((path) => Promise.resolve(result(path)));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportsPage', () => {
  it('uses the newest selection when an older report request finishes later', async () => {
    let finishInventory: ((value: unknown) => void) | undefined;
    let inventoryPath = '';
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path.includes('/inventory?')) {
        inventoryPath = path;
        return new Promise((resolve) => {
          finishInventory = resolve;
        });
      }
      return Promise.resolve(result(path));
    });
    show();
    await screen.findByText('Food packs');
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'inventory' } });
    await waitFor(() => expect(finishInventory).toBeDefined());
    expect(screen.getByLabelText('Report')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'requests' } });
    await screen.findByText('Requests submitted');
    finishInventory?.(result(inventoryPath));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print report' })).toBeEnabled());
    expect(screen.getByLabelText('Report')).toHaveValue('requests');
    expect(screen.queryByRole('region', { name: 'Current stock' })).toBeNull();
    expect(screen.getByText('Requests submitted')).toBeInTheDocument();
  });
  it('prints every inventory group from the automatically filtered snapshot despite pagination', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    show();
    await screen.findByText('Food packs');
    await screen.findByRole('option', { name: 'Campaign 100' });
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'inventory' } });
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: campaign(100).id } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-30' } });
    const stock = await screen.findByRole('region', { name: 'Current stock' });
    fireEvent.click(within(stock).getByRole('button', { name: 'Next' }));
    expect(within(stock).queryByText('Stock 0')).toBeNull();
    const count = vi.mocked(apiFetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    const pending = screen.getByRole('button', { name: 'Preparing print…' });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Report')).toBeDisabled();
    fireEvent.click(pending);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const printable = document.querySelector('.report-print-root');
    // Tailwind's hidden-attribute reset would keep the report invisible in print.
    expect(printable).not.toHaveAttribute('hidden');
    expect(printable).toHaveTextContent('Inventory');
    expect(printable).toHaveTextContent('Campaign 100');
    expect(printable).toHaveTextContent('2026-11-01 to 2026-11-30');
    expect(printable).toHaveTextContent('Asia/Manila');
    expect(printable).toHaveTextContent('Stock 0');
    expect(printable).toHaveTextContent('Stock 29');
    expect(printable).toHaveTextContent('Stock is current.');
    expect(printable?.querySelector('[aria-label="Current stock"] tbody')?.children).toHaveLength(
      30,
    );
    expect(printable?.querySelector('button, nav, input, select')).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(count);
    fireEvent(window, new Event('afterprint'));
    expect(document.querySelector('.report-print-root')).toBeNull();
    expect(screen.getByRole('button', { name: 'Print report' })).toBeEnabled();
    expect(within(stock).getByText('Stock 29')).toBeInTheDocument();
  });
  it.each([
    ['donations', 'Donations submitted', 'Declared'],
    ['requests', 'Requests submitted', 'Average review time (hours)'],
    ['distributions', 'Completed handovers', 'Units handed over'],
  ])('prints %s summaries and semantics', async (kind, summary, detail) => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    show();
    await screen.findByText('Food packs');
    if (kind !== 'donations') {
      fireEvent.change(screen.getByLabelText('Report'), { target: { value: kind } });
      await screen.findByText(summary);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(document.querySelector('.report-print-root')).toHaveTextContent(summary);
    expect(document.querySelector('.report-print-root')).toHaveTextContent(detail);
    fireEvent(window, new Event('afterprint'));
  });
  it('recovers from a print dialog failure without losing the displayed report', async () => {
    const print = vi
      .spyOn(window, 'print')
      .mockImplementationOnce(() => {
        throw new Error('Unavailable');
      })
      .mockImplementation(() => {});
    show();
    await screen.findByText('Food packs');
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the print dialog.');
    expect(document.querySelector('.report-print-root')).toBeNull();
    expect(screen.getByText('605')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
    fireEvent(window, new Event('afterprint'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('cancels queued printing and removes its data when leaving Reports', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const view = show();
    await screen.findByText('Food packs');
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    view.unmount();
    expect(cancel).toHaveBeenCalledWith(123);
    expect(document.querySelector('.report-print-root')).toBeNull();
    expect(print).not.toHaveBeenCalled();
  });
  it('renders complete aggregates and fetches every campaign page', async () => {
    show();
    await screen.findByText('Food packs');
    expect(screen.getByText('605')).toBeInTheDocument();
    expect(screen.getByText('363')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Campaign 100' });
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/campaigns?page=2&pageSize=100');
  });
  it('automatically applies report, dates and campaign without a submit button', async () => {
    show();
    await screen.findByRole('option', { name: 'Campaign 100' });
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'requests' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: campaign(100).id } });
    expect(screen.queryByRole('button', { name: 'Apply filters' })).toBeNull();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/v1/reports/requests?from=2026-11-01&to=2026-11-30&campaignId=${campaign(100).id}`,
      ),
    );
    expect(await screen.findByText('Average review time (hours)')).toBeInTheDocument();
  });
  it('rejects an inverted date range locally', async () => {
    show();
    await screen.findByText('Food packs');
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('From date must be on or before To date');
    expect(
      vi.mocked(apiFetch).mock.calls.filter(([path]) => path.includes('/reports/')),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Print report' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.getByText('Food packs')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print report' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('downloads the displayed snapshot without another API fetch', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:report-fixture');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show();
    await screen.findByText('Food packs');
    await screen.findByRole('option', { name: 'Campaign 100' });
    const count = vi.mocked(apiFetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledTimes(count);
    expect(screen.getByRole('status')).toHaveTextContent('CSV download started');
  });
  it('shows loading/error/retry states instead of fabricated zero data', async () => {
    vi.mocked(apiFetch).mockImplementation((path) =>
      path.includes('/reports/') ? new Promise(() => {}) : Promise.resolve(result(path)),
    );
    const view = show();
    expect(screen.getByText('Loading report…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Print report' })).toBeDisabled();
    view.unmount();
    let failed = false;
    vi.mocked(apiFetch).mockImplementation((path) => {
      if (path.includes('/reports/') && !failed) {
        failed = true;
        return Promise.reject(new Error('Offline'));
      }
      return Promise.resolve(result(path));
    });
    show();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Print report' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Food packs');
  });
  it('shows empty aggregates without hiding summary counts', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    vi.mocked(apiFetch).mockImplementation((path) =>
      Promise.resolve(
        path.includes('/reports/')
          ? {
              data: {
                ...donationReport,
                total: 0,
                byStatus: [],
                byCampaign: [],
                byItem: [],
                byMonth: [],
              },
            }
          : result(path),
      ),
    );
    show();
    await screen.findByText('No matching records for these filters.');
    expect(screen.getByText('Donations submitted')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(document.querySelector('.report-print-root')).toHaveTextContent(
      'No matching records for these filters.',
    );
    expect(document.querySelector('.report-print-root')).toHaveTextContent('Donations submitted');
    fireEvent(window, new Event('afterprint'));
  });
  it('separates current inventory from dated movements and pages groups locally', async () => {
    show();
    await screen.findByText('Food packs');
    fireEvent.change(screen.getByLabelText('Report'), { target: { value: 'inventory' } });
    await screen.findByText(/Stock is current. Date filters apply only to movements/);
    const stock = screen.getByRole('region', { name: 'Current stock' });
    expect(within(stock).getByText('Stock 0')).toBeInTheDocument();
    expect(within(stock).queryByText('Stock 29')).toBeNull();
    fireEvent.click(within(stock).getByRole('button', { name: 'Next' }));
    expect(within(stock).getByText('Stock 29')).toBeInTheDocument();
    expect(within(stock).getByText(/CSV includes all groups/)).toBeInTheDocument();
  });
});
