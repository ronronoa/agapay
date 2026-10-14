import { useState } from 'react';
import { Link } from 'react-router-dom';
import { donationListResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { DonationDto } from '@agapay/shared';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  SCHEDULED: 'Scheduled',
  COLLECTED: 'Collected',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

function itemSummary(row: DonationDto): string {
  if (row.items.length === 0) return '—';
  const first = row.items[0];
  if (first === undefined) return '—';
  const rest = row.items.length - 1;
  const received = first.quantityReceived ?? first.quantityDeclared;
  const text = `${received} ${first.itemTypeName}`;
  return rest === 0 ? text : `${text} +${rest} more`;
}

const columns: Column<DonationDto>[] = [
  {
    key: 'reference',
    header: 'Donation ID',
    render: (row) => <span className="font-medium">{row.referenceNumber}</span>,
  },
  { key: 'campaign', header: 'Campaign', render: (row) => row.campaignName },
  { key: 'items', header: 'Items', render: (row) => itemSummary(row) },
  { key: 'date', header: 'Date', render: (row) => formatDate(row.submittedAt) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <StatusBadge
        label={STATUS_LABEL[row.status] ?? row.status}
        muted={row.status === 'REJECTED' || row.status === 'CANCELLED'}
      />
    ),
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => (
      <Link
        to={`/donor/donations/${row.id}`}
        className="font-medium text-primary underline underline-offset-4"
      >
        View
      </Link>
    ),
  },
];

const PAGE_SIZE = 10;

export function DonorActivityPage() {
  const [page, setPage] = useState(1);
  const query = useApiQuery(
    ['donor-donations', page],
    `/api/v1/donations?page=${page}&pageSize=${PAGE_SIZE}`,
    donationListResponseSchema,
  );
  const total = query.data?.data.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Activity"
        description="Track your donation history and impact across active disaster relief programs."
      />

      <AsyncBoundary
        data={query.data?.data.items ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading your donations…"
        isEmpty={(items) => items.length === 0}
        emptyTitle="No donations yet"
        emptyDescription="Your donations will appear here once you make your first one."
      >
        {(items) => (
          <div>
            <DataTable
              caption="Donation history"
              columns={columns}
              rows={items}
              rowKey={(row) => row.id}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {from}–{to} of {total} donations
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    aria-current={pageNumber === page ? 'page' : undefined}
                    className={
                      pageNumber === page
                        ? 'rounded-md bg-primary-subtle px-3 py-2 text-sm font-medium text-surface'
                        : 'rounded-md border border-border px-3 py-2 text-sm font-medium'
                    }
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
