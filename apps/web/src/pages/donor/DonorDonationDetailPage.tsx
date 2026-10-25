import { toast } from 'sonner';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { campaignListResponseSchema, donationResponseSchema } from '@agapay/shared';
import type { SubmitDonationInput } from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/Button';
import { DonateForm } from './DonateForm';

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function DonorDonationDetailPage() {
  const { id } = useParams();
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const query = useApiQuery(
    ['donor-donation', id],
    `/api/v1/donations/${encodeURIComponent(id ?? '')}`,
    donationResponseSchema,
    { enabled: id !== undefined && id.length > 0 },
  );
  const campaignsQuery = useApiQuery(
    ['donor-campaigns', 'edit'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
    { enabled: editing },
  );

  function onEdit(input: SubmitDonationInput): Promise<void> {
    return apiFetch(`/api/v1/donations/${encodeURIComponent(id ?? '')}`, {
      method: 'PATCH',
      body: input,
    })
      .then(() => {
        setEditing(false);
        toast.success('Donation updated.');
        query.refetch();
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof ApiClientError ? err.message : 'Update failed. Please try again.',
        );
      });
  }

  function onCancel(): void {
    void apiFetch(`/api/v1/donations/${encodeURIComponent(id ?? '')}/cancel`, { method: 'POST' })
      .then(() => {
        setConfirmingCancel(false);
        toast.success('Donation cancelled.');
        query.refetch();
      })
      .catch((err: unknown) => {
        setConfirmingCancel(false);
        toast.error(
          err instanceof ApiClientError ? err.message : 'Cancel failed. Please try again.',
        );
      });
  }

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

            {donation.status === 'PENDING' && !editing ? (
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => setEditing(true)}>
                  Edit donation
                </Button>
                <Button type="button" variant="accent" onClick={() => setConfirmingCancel(true)}>
                  Cancel donation
                </Button>
              </div>
            ) : null}

            {editing ? (
              <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
                <h2 className="font-display text-base font-semibold">Edit donation</h2>
                <DonateForm
                  campaigns={campaignsQuery.data?.data.items ?? []}
                  defaults={{
                    campaignId: donation.campaignId,
                    preferredDate: donation.preferredDate?.slice(0, 10) ?? '',
                    preferredNote: donation.preferredNote ?? '',
                    notes: donation.notes ?? '',
                    items: donation.items.map((item) => ({
                      itemTypeId: item.itemTypeId,
                      quantity: item.quantityDeclared,
                      description: item.description ?? '',
                      customName: item.customName ?? '',
                      expiryDate: item.expiryDate?.slice(0, 10) ?? '',
                      checked: true,
                    })),
                  }}
                  submitLabel="Save changes"
                  pendingLabel="Saving…"
                  onSubmit={onEdit}
                />
                <Button
                  type="button"
                  variant="accent"
                  className="mt-3"
                  onClick={() => setEditing(false)}
                >
                  Stop editing
                </Button>
              </div>
            ) : null}

            <Dialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
              <DialogTitle>Cancel this donation?</DialogTitle>
              <DialogDescription>
                {donation.referenceNumber} will be withdrawn. This cannot be undone.
              </DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="accent">
                    Keep donation
                  </Button>
                </DialogClose>
                <Button type="button" onClick={onCancel}>
                  Yes, cancel it
                </Button>
              </DialogFooter>
            </Dialog>

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
