import { useState } from 'react';
import {
  assistanceRequestListResponseSchema,
  campaignListResponseSchema,
  type AssistanceRequestDto,
} from '@agapay/shared';
import { ApiClientError, apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const PAGE_SIZE = 20;
const REQUEST_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'DISTRIBUTED',
  'REJECTED',
  'CANCELLED',
] as const;
const REQUEST_FLAGS = ['duplicate', 'outsideArea', 'unverifiedEmail'] as const;

type RequestAction = 'claim' | 'release' | 'approve' | 'reject' | 'cancel';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  DISTRIBUTED: 'Distributed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const FLAG_LABEL: Record<string, string> = {
  duplicate: 'Possible duplicate',
  outsideArea: 'Outside campaign area',
  unverifiedEmail: 'Unverified email',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

function itemSummary(row: AssistanceRequestDto): string {
  if (row.items.length === 0) return '—';
  const first = row.items[0];
  if (first === undefined) return '—';
  const rest = row.items.length - 1;
  const text = `${first.quantity} ${first.itemTypeName}`;
  return rest === 0 ? text : `${text} +${rest} more`;
}

function flagSummary(row: AssistanceRequestDto): string {
  const flags: string[] = [];
  if (row.possibleDuplicate) flags.push(FLAG_LABEL.duplicate ?? 'Possible duplicate');
  if (row.outsideCampaignArea) flags.push(FLAG_LABEL.outsideArea ?? 'Outside campaign area');
  if (!row.emailVerified) flags.push(FLAG_LABEL.unverifiedEmail ?? 'Unverified email');
  return flags.length === 0 ? '—' : flags.join(' · ');
}

function buildQuery(
  status: string,
  campaignId: string,
  barangay: string,
  flag: string,
  q: string,
  page: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== 'ALL') params.set('status', status);
  if (campaignId !== '') params.set('campaignId', campaignId);
  if (barangay.trim() !== '') params.set('barangay', barangay.trim());
  if (flag !== 'ALL') params.set('flag', flag);
  if (q.trim() !== '') params.set('q', q.trim());
  return `/api/v1/assistance-requests?${params.toString()}`;
}

function actionFailureMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.status === 409) {
    return 'This request changed while you were reviewing it. The list was refreshed; check its current status.';
  }
  return err instanceof ApiClientError ? err.message : 'Action failed. Please try again.';
}

export function RequestsPage() {
  const [status, setStatus] = useState('PENDING');
  const [campaignId, setCampaignId] = useState('');
  const [barangay, setBarangay] = useState('');
  const [flag, setFlag] = useState('ALL');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<RequestAction | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useApiQuery(
    ['admin-requests', status, campaignId, barangay, flag, q, page],
    buildQuery(status, campaignId, barangay, flag, q, page),
    assistanceRequestListResponseSchema,
  );
  const campaignsQuery = useApiQuery(
    ['admin-request-campaigns'],
    '/api/v1/campaigns?pageSize=100',
    campaignListResponseSchema,
  );
  const items = query.data?.data.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? null;
  const total = query.data?.data.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage(): void {
    setPage(1);
  }

  function closeDetail(): void {
    setSelectedId(null);
    setAction(null);
    setNote('');
    setReason('');
    setFormError(null);
    setActionError(null);
  }

  function openAction(kind: RequestAction): void {
    if (selected === null) return;
    setFormError(null);
    setActionError(null);
    setNote('');
    setReason('');
    setAction(kind);
  }

  function submitAction(path: string, body: unknown, success: string): void {
    setActionError(null);
    void apiFetch(path, { method: 'POST', body })
      .then(() => {
        setMessage(success);
        closeDetail();
        query.refetch();
      })
      .catch((err: unknown) => {
        setActionError(actionFailureMessage(err));
      });
  }

  function submitDecision(kind: 'approve' | 'reject' | 'cancel'): void {
    if (selected === null) return;
    if (kind !== 'approve' && reason.trim().length === 0) {
      setFormError(
        kind === 'reject'
          ? 'Enter the reason the beneficiary will see.'
          : 'Enter the reason for this cancellation.',
      );
      return;
    }
    const path = `/api/v1/assistance-requests/${encodeURIComponent(selected.id)}/${kind}`;
    if (kind === 'approve') {
      const trimmed = note.trim();
      submitAction(
        path,
        trimmed === '' ? {} : { note: trimmed },
        'Request approved and tracking number issued.',
      );
    } else {
      submitAction(path, { reason: reason.trim() }, `Request ${kind}ed.`);
    }
  }

  const columns: Column<AssistanceRequestDto>[] = [
    {
      key: 'reference',
      header: 'Request ID',
      render: (row) => <span className="font-medium">{row.referenceNumber}</span>,
    },
    { key: 'name', header: 'Name', render: (row) => row.fullName },
    { key: 'campaign', header: 'Campaign', render: (row) => row.campaignName },
    { key: 'items', header: 'Requested goods', render: (row) => itemSummary(row) },
    {
      key: 'location',
      header: 'Location',
      render: (row) => `${row.barangay}, ${row.city}`,
    },
    { key: 'flags', header: 'Flags', render: (row) => flagSummary(row) },
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
        <button
          type="button"
          onClick={() => {
            setSelectedId(row.id);
            setAction(null);
            setActionError(null);
          }}
          className="font-medium text-primary underline underline-offset-4"
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistance Requests"
        description="Claim beneficiary requests, approve eligible households, or reject and cancel with a beneficiary-visible reason."
      />

      {message === null ? null : (
        <p role="status" className="text-sm font-medium">
          {message}
        </p>
      )}

      <form
        aria-label="Request filters"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <div>
          <Label htmlFor="request-status">Status</Label>
          <select
            id="request-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              resetPage();
            }}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            {REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="request-campaign">Campaign</Label>
          <select
            id="request-campaign"
            value={campaignId}
            onChange={(event) => {
              setCampaignId(event.target.value);
              resetPage();
            }}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">All campaigns</option>
            {(campaignsQuery.data?.data.items ?? []).map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="request-barangay">Barangay</Label>
          <Input
            id="request-barangay"
            value={barangay}
            onChange={(event) => {
              setBarangay(event.target.value);
              resetPage();
            }}
            placeholder="Barangay"
          />
        </div>
        <div>
          <Label htmlFor="request-flag">Flag</Label>
          <select
            id="request-flag"
            value={flag}
            onChange={(event) => {
              setFlag(event.target.value);
              resetPage();
            }}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="ALL">All requests</option>
            {REQUEST_FLAGS.map((value) => (
              <option key={value} value={FLAG_LABEL[value]}>
                {FLAG_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="request-search">Search</Label>
          <Input
            id="request-search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              resetPage();
            }}
            placeholder="Reference, name, email, or goods"
          />
        </div>
      </form>

      <AsyncBoundary
        data={items}
        error={query.error}
        isPending={query.isPending}
        onRetry={query.refetch}
        loadingLabel="Loading assistance requests…"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No requests match"
        emptyDescription="Adjust the filters or check another queue status."
      >
        {(rows) => (
          <div>
            <DataTable
              caption="Assistance request queue"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total} requests
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
                <span className="text-sm text-text-muted">
                  Page {page} of {totalPages}
                </span>
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

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogTitle>
          {selected === null
            ? 'Request'
            : `${selected.referenceNumber} · ${STATUS_LABEL[selected.status] ?? selected.status}`}
        </DialogTitle>
        <DialogDescription>
          Flags mark possible duplicates, outside-area households, and unverified email; they never
          auto-reject a request.
        </DialogDescription>

        {actionError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {actionError}
          </p>
        )}
        {formError === null ? null : (
          <p role="alert" className="mt-3 text-sm font-medium">
            {formError}
          </p>
        )}

        {selected !== null && action === null ? (
          <div className="mt-4 space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-text-muted">Name</dt>
              <dd className="font-medium">{selected.fullName}</dd>
              <dt className="text-text-muted">Email</dt>
              <dd>{selected.email}</dd>
              <dt className="text-text-muted">Contact</dt>
              <dd>{selected.contactNumber}</dd>
              <dt className="text-text-muted">Address</dt>
              <dd>{`${selected.barangay}, ${selected.city}, ${selected.province}`}</dd>
              <dt className="text-text-muted">Campaign</dt>
              <dd>{selected.campaignName}</dd>
              <dt className="text-text-muted">Tracking</dt>
              <dd>{selected.trackingNumber ?? '—'}</dd>
            </dl>
            <div>
              <h3 className="font-medium">Requested items</h3>
              <ul className="mt-1 space-y-1">
                {selected.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>
                      {item.itemTypeName}
                      {item.customName === null ? '' : ` (${item.customName})`}
                    </span>
                    <span className="text-text-muted">
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p>
              <span className="font-medium">Flags: </span>
              {flagSummary(selected)}
            </p>
            {selected.notes === null ? null : <p className="text-text-muted">{selected.notes}</p>}
            {selected.rejectionReason === null ? null : (
              <p>
                <span className="font-medium">Decision reason: </span>
                {selected.rejectionReason}
              </p>
            )}
            <div>
              <h3 className="font-medium">Timeline</h3>
              <ul className="mt-1 space-y-1">
                {selected.timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex justify-between gap-2">
                    <span>
                      {event.fromStatus ?? 'New'} → {event.toStatus}
                    </span>
                    <span className="text-text-muted">{formatDate(event.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'PENDING' ? (
                <>
                  <Button type="button" onClick={() => openAction('claim')}>
                    Claim
                  </Button>
                  <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                    Cancel
                  </Button>
                </>
              ) : null}
              {selected.status === 'UNDER_REVIEW' ? (
                <>
                  <Button type="button" onClick={() => openAction('approve')}>
                    Approve
                  </Button>
                  <Button type="button" variant="accent" onClick={() => openAction('release')}>
                    Release
                  </Button>
                  <Button type="button" variant="accent" onClick={() => openAction('reject')}>
                    Reject
                  </Button>
                  <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                    Cancel
                  </Button>
                </>
              ) : null}
              {selected.status === 'APPROVED' ? (
                <>
                  <a
                    className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface"
                    href={`/admin/distributions?request=${selected.id}`}
                  >
                    Schedule distribution
                  </a>
                  <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                    Cancel
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {selected !== null && (action === 'claim' || action === 'release') ? (
          <div className="mt-4 text-sm">
            <p>
              {action === 'claim'
                ? `Claim ${selected.referenceNumber} for review? Other staff will see it as under review.`
                : `Release ${selected.referenceNumber} back to pending? Its review assignment will be cleared.`}
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="accent">
                  Back
                </Button>
              </DialogClose>
              <Button
                type="button"
                onClick={() =>
                  submitAction(
                    `/api/v1/assistance-requests/${encodeURIComponent(selected.id)}/${action}`,
                    undefined,
                    action === 'claim'
                      ? 'Request claimed for review.'
                      : 'Request released to pending.',
                  )
                }
              >
                {action === 'claim' ? 'Confirm claim' : 'Confirm release'}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {selected !== null && action === 'approve' ? (
          <div className="mt-4">
            <Label htmlFor="request-approve-note">Approval note, optional</Label>
            <textarea
              id="request-approve-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="accent">
                  Back
                </Button>
              </DialogClose>
              <Button type="button" onClick={() => submitDecision('approve')}>
                Confirm approval
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {selected !== null && (action === 'reject' || action === 'cancel') ? (
          <div className="mt-4">
            <Label htmlFor="request-decision-reason">
              {action === 'reject'
                ? 'Reason the beneficiary will see'
                : 'Reason for this cancellation'}
            </Label>
            <textarea
              id="request-decision-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="accent">
                  Back
                </Button>
              </DialogClose>
              <Button type="button" onClick={() => submitDecision(action)}>
                {action === 'reject' ? 'Confirm rejection' : 'Confirm cancellation'}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
