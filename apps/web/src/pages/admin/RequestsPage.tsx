import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCcw, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  assistanceRequestListResponseSchema,
  campaignSchema,
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
import { Alert, AlertDescription } from '../../components/ui/alert';
import { NativeSelect } from '../../components/ui/native-select';
import { Textarea } from '../../components/ui/textarea';
import { Spinner } from '../../components/ui/spinner';
import { fetchAll } from '../../lib/fetch-all';
import { FieldGroup, FieldLayout } from '../../components/ui/field';
import { CorrectRequestForm } from './CorrectRequestForm';

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

type RequestAction = 'claim' | 'release' | 'approve' | 'reject' | 'cancel' | 'correct';

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
  return new Date(iso).toLocaleDateString('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  });
}

function itemSummary(row: AssistanceRequestDto): string {
  if (row.items.length === 0) return '—';
  const first = row.items[0];
  if (first === undefined) return '—';
  const rest = row.items.length - 1;
  const text = `${first.quantity} ${first.unit} ${first.itemTypeName}`;
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
    return 'This request changed while you were reviewing it. Review its latest status before trying again.';
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
  const inFlight = useRef(false);

  const query = useApiQuery(
    ['admin-requests', status, campaignId, barangay, flag, q, page],
    buildQuery(status, campaignId, barangay, flag, q, page),
    assistanceRequestListResponseSchema,
  );
  const campaignsQuery = useQuery({
    queryKey: ['admin-request-campaigns'],
    queryFn: () => fetchAll('/api/v1/campaigns', campaignSchema),
  });
  const items = query.data?.data.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? null;
  const total = query.data?.data.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown; success: string }) =>
      apiFetch(path, { method: 'POST', body }),
    onSuccess: (_data, variables) => {
      inFlight.current = false;
      closeDetail();
      query.refetch();
      toast.success(variables.success);
    },
    onError: (err: unknown) => {
      inFlight.current = false;
      if (err instanceof ApiClientError && err.status === 409) {
        closeDetail();
        query.refetch();
        toast.warning(actionFailureMessage(err));
      } else {
        toast.error(actionFailureMessage(err));
      }
    },
  });

  function resetPage(): void {
    setPage(1);
  }

  function closeDetail(): void {
    if (inFlight.current) return;
    setSelectedId(null);
    setAction(null);
    setNote('');
    setReason('');
    setFormError(null);
  }

  function openAction(kind: RequestAction): void {
    if (selected === null) return;
    setFormError(null);
    setNote('');
    setReason('');
    setAction(kind);
  }

  function submitAction(path: string, body: unknown, success: string): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    mutation.mutate({ path, body, success });
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
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            setSelectedId(row.id);
            setAction(null);
          }}
        >
          <Eye data-icon="inline-start" aria-hidden="true" />
          Review
        </Button>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Assistance Requests"
        description="Claim beneficiary requests, approve eligible households, or reject and cancel with a beneficiary-visible reason."
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            aria-busy={query.isFetching}
            onClick={query.refetch}
          >
            {query.isFetching ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <RefreshCcw data-icon="inline-start" aria-hidden="true" />
            )}
            Refresh requests
          </Button>
        }
      />

      {campaignsQuery.isError && (
        <Alert role="status" variant="warning">
          <AlertDescription>
            Campaign choices could not load.{' '}
            <Button
              variant="ghost"
              onClick={() => void campaignsQuery.refetch()}
              disabled={campaignsQuery.isFetching}
            >
              Retry campaigns
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form
        aria-label="Request filters"
        className="rounded-lg border border-border bg-surface p-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <FieldLayout>
            <Label htmlFor="request-status">Status</Label>
            <NativeSelect
              id="request-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                resetPage();
              }}
              className="mt-1"
            >
              <option value="ALL">All statuses</option>
              {REQUEST_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </NativeSelect>
          </FieldLayout>
          <FieldLayout>
            <Label htmlFor="request-campaign">Campaign</Label>
            <NativeSelect
              id="request-campaign"
              value={campaignId}
              onChange={(event) => {
                setCampaignId(event.target.value);
                resetPage();
              }}
              className="mt-1"
            >
              <option value="">All campaigns</option>
              {(campaignsQuery.data ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </NativeSelect>
          </FieldLayout>
          <FieldLayout>
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
          </FieldLayout>
          <FieldLayout>
            <Label htmlFor="request-flag">Flag</Label>
            <NativeSelect
              id="request-flag"
              value={flag}
              onChange={(event) => {
                setFlag(event.target.value);
                resetPage();
              }}
              className="mt-1"
            >
              <option value="ALL">All requests</option>
              {REQUEST_FLAGS.map((value) => (
                <option key={value} value={value}>
                  {FLAG_LABEL[value]}
                </option>
              ))}
            </NativeSelect>
          </FieldLayout>
          <FieldLayout className="sm:col-span-2">
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
          </FieldLayout>
        </FieldGroup>
      </form>

      <AsyncBoundary
        data={query.data === null ? null : items}
        error={query.error}
        isPending={query.isPending}
        isRefreshing={query.isFetching && !query.isPending}
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
                <Button
                  variant="outline"
                  type="button"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft data-icon="inline-start" aria-hidden="true" />
                  Previous
                </Button>
                <span className="text-sm text-text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  type="button"
                  disabled={page >= totalPages || query.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </AsyncBoundary>

      <Dialog
        size="xl"
        className="wrap-break-word"
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
        <fieldset
          disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          className="min-w-0 border-0 p-0"
        >
          {mutation.isPending && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm">
              <Spinner aria-hidden="true" />
              Saving request…
            </p>
          )}

          {formError === null ? null : (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
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
                <dt className="text-text-muted">Household size</dt>
                <dd>{selected.householdSize ?? 'Unknown'}</dd>
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
              <Alert
                role="status"
                variant={
                  selected.possibleDuplicate ||
                  selected.outsideCampaignArea ||
                  !selected.emailVerified
                    ? 'warning'
                    : 'info'
                }
              >
                <AlertDescription>Flags: {flagSummary(selected)}</AlertDescription>
              </Alert>
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
                        {event.fromStatus === event.toStatus
                          ? 'Details corrected'
                          : `${event.fromStatus ?? 'New'} → ${event.toStatus}`}
                        {event.fromStatus === event.toStatus && event.note ? (
                          <span className="block text-text-muted">{event.note}</span>
                        ) : null}
                      </span>
                      <span className="text-text-muted">{formatDate(event.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selected.status === 'PENDING' || selected.status === 'UNDER_REVIEW') && (
                  <Button type="button" variant="accent" onClick={() => openAction('correct')}>
                    Correct details
                  </Button>
                )}
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
                      Back to release
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

          {selected !== null && action === 'correct' ? (
            <CorrectRequestForm
              key={selected.id}
              request={selected}
              pending={mutation.isPending}
              onBack={() => setAction(null)}
              onSave={(input) =>
                submitAction(
                  `/api/v1/assistance-requests/${encodeURIComponent(selected.id)}/correct`,
                  input,
                  'Request details corrected.',
                )
              }
            />
          ) : null}

          {selected !== null && action === 'approve' ? (
            <div className="mt-4">
              <Label htmlFor="request-approve-note">Approval note, optional</Label>
              <Textarea
                id="request-approve-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1"
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
              <Textarea
                id="request-decision-reason"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1"
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
        </fieldset>
      </Dialog>
    </div>
  );
}
