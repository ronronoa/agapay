import { Link, useParams } from 'react-router-dom';
import { donationResponseSchema } from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { StatusBadge } from '../../components/ui/StatusBadge';

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function DonorDonationDetailPage() {
  const { id } = useParams();
  const query = useApiQuery(
    ['donor-donation', id],
    `/api/v1/donations/${encodeURIComponent(id ?? '')}`,
    donationResponseSchema,
    { enabled: id !== undefined && id.length > 0 },
  );

  return (
    <div className="space-y-6">
      <AsyncBoundary
        data={query.data?.data ?? null}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading donation…"
        isEmpty={() => false}
        emptyTitle="Donation not found"
        emptyDescription="This donation does not exist or belongs to someone else."
      >
        {(donation) => (
          <div className="space-y-6">
            <PageHeader
              title={donation.referenceNumber}
              description={`${donation.campaignName} · submitted ${formatDate(donation.submittedAt)}`}
            />
            <p>
              <StatusBadge label={donation.status.replace(/_/g, ' ')} />
            </p>

            <section
              aria-label="Donated items"
              className="rounded-lg border border-border bg-surface p-5 shadow-card"
            >
              <h2 className="font-display text-base font-semibold">Items</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {donation.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span className="font-medium">
                      {item.itemTypeName}
                      {item.customName === null ? '' : ` (${item.customName})`}
                    </span>
                    <span className="text-text-muted">
                      declared {item.quantityDeclared}
                      {item.quantityReceived === null ? '' : ` · received ${item.quantityReceived}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section
              aria-label="Donation timeline"
              className="rounded-lg border border-border bg-surface p-5 shadow-card"
            >
              <h2 className="font-display text-base font-semibold">Timeline</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-text-muted">Verified</dt>
                <dd>{formatDate(donation.verifiedAt)}</dd>
                <dt className="text-text-muted">Collected</dt>
                <dd>{formatDate(donation.collectedAt)}</dd>
                <dt className="text-text-muted">Completed</dt>
                <dd>{formatDate(donation.completedAt)}</dd>
              </dl>
              {donation.rejectionReason === null ? null : (
                <p className="mt-2 text-sm">
                  <span className="font-medium">Rejection reason: </span>
                  {donation.rejectionReason}
                </p>
              )}
              {donation.notes === null ? null : (
                <p className="mt-2 text-sm text-text-muted">{donation.notes}</p>
              )}
            </section>

            <Link
              to="/donor/activity"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              Back to activity
            </Link>
          </div>
        )}
      </AsyncBoundary>
    </div>
  );
}
