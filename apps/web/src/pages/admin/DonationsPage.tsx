import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCcw, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  calendarEventDtoSchema,
  campaignSchema,
  donationListResponseSchema,
  type DonationDto,
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

const PAGE_SIZE = 20;
const DONATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'SCHEDULED',
  'COLLECTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

type DonationAction = 'verify' | 'reject' | 'schedule' | 'collect' | 'cancel';

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
  return new Date(iso).toLocaleDateString('en-PH', {
    dateStyle: 'medium',
    timeZone: 'Asia/Manila',
  });
}

function itemSummary(row: DonationDto): string {
  if (row.items.length === 0) return '—';
  const first = row.items[0];
  if (first === undefined) return '—';
  const rest = row.items.length - 1;
  const text = `${first.quantityDeclared} ${first.unit} ${first.itemTypeName}`;
  return rest === 0 ? text : `${text} +${rest} more`;
}

function buildQuery(
  status: string,
  campaignId: string,
  q: string,
  from: string,
  to: string,
  page: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (status !== 'ALL') params.set('status', status);
  if (campaignId !== '') params.set('campaignId', campaignId);
  if (q.trim() !== '') params.set('q', q.trim());
  if (from !== '') params.set('from', from);
  if (to !== '') params.set('to', to);
  return `/api/v1/donations?${params.toString()}`;
}

function actionFailureMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.status === 409) {
    return 'This donation changed while you were reviewing it. Review its latest status before trying again.';
  }
  return err instanceof ApiClientError ? err.message : 'Action failed. Please try again.';
}

export function DonationsPage() {
  const [status, setStatus] = useState('PENDING');
  const [campaignId, setCampaignId] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<DonationAction | null>(null);
  const [reason, setReason] = useState('');
  const [eventId, setEventId] = useState('');
  const [received, setReceived] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const query = useApiQuery(
    ['admin-donations', status, campaignId, q, from, to, page],
    buildQuery(status, campaignId, q, from, to, page),
    donationListResponseSchema,
  );
  const campaignsQuery = useQuery({
    queryKey: ['admin-donation-campaigns'],
    queryFn: () => fetchAll('/api/v1/campaigns', campaignSchema),
  });
  const items = query.data?.data.items ?? [];
  const selected = items.find((row) => row.id === selectedId) ?? null;
  const scheduleEventsQuery = useQuery({
    queryKey: ['admin-collection-events'],
    queryFn: () =>
      fetchAll('/api/v1/calendar/events?type=COLLECTION&status=SCHEDULED', calendarEventDtoSchema),
    enabled:
      action === 'schedule' &&
      (selected?.status === 'VERIFIED' || selected?.status === 'SCHEDULED'),
  });
  const events = (scheduleEventsQuery.data ?? []).filter(
    (event) => event.campaignId === selected?.campaignId && +new Date(event.endAt) > Date.now(),
  );
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
    setReason('');
    setEventId('');
    setReceived({});
    setExpiry({});
    setFormError(null);
  }

  function openAction(kind: DonationAction): void {
    if (selected === null) return;
    setFormError(null);
    if (kind === 'reject') setReason('');
    if (kind === 'schedule') setEventId('');
    if (kind === 'collect') {
      const nextReceived: Record<string, string> = {};
      const nextExpiry: Record<string, string> = {};
      for (const item of selected.items) {
        nextReceived[item.id] = String(item.quantityDeclared);
        nextExpiry[item.id] = item.expiryDate?.slice(0, 10) ?? '';
      }
      setReceived(nextReceived);
      setExpiry(nextExpiry);
    }
    setAction(kind);
  }

  function submitAction(path: string, body: unknown, success: string): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    mutation.mutate({ path, body, success });
  }

  function submitReject(): void {
    if (selected === null) return;
    if (reason.trim().length === 0) {
      setFormError('Enter the reason the donor will see.');
      return;
    }
    submitAction(
      `/api/v1/donations/${encodeURIComponent(selected.id)}/reject`,
      { reason: reason.trim() },
      'Donation rejected.',
    );
  }

  function submitSchedule(): void {
    if (selected === null) return;
    if (eventId === '') {
      setFormError('Select a scheduled collection event.');
      return;
    }
    submitAction(
      `/api/v1/donations/${encodeURIComponent(selected.id)}/schedule`,
      { calendarEventId: eventId },
      'Collection scheduled.',
    );
  }

  function submitCollect(): void {
    if (selected === null) return;
    const lines: Array<{ donationItemId: string; quantityReceived: number; expiryDate?: string }> =
      [];
    for (const item of selected.items) {
      const raw = (received[item.id] ?? '').trim();
      const quantity = raw === '' ? Number.NaN : Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0) {
        setFormError('Enter a whole received quantity of zero or more for every item.');
        return;
      }
      const date = (expiry[item.id] ?? '').trim();
      lines.push(
        date === ''
          ? { donationItemId: item.id, quantityReceived: quantity }
          : { donationItemId: item.id, quantityReceived: quantity, expiryDate: date },
      );
    }
    if (lines.length === 0) {
      setFormError('This donation has no items to collect.');
      return;
    }
    if (lines.every((line) => line.quantityReceived === 0)) {
      setFormError('Enter at least one received quantity before completing collection.');
      return;
    }
    submitAction(
      `/api/v1/donations/${encodeURIComponent(selected.id)}/collect`,
      { items: lines },
      'Donation collected and completed.',
    );
  }

  const columns: Column<DonationDto>[] = [
    {
      key: 'reference',
      header: 'Donation ID',
      render: (row) => <span className="font-medium">{row.referenceNumber}</span>,
    },
    { key: 'donor', header: 'Donor', render: (row) => row.donorName },
    { key: 'campaign', header: 'Campaign', render: (row) => row.campaignName },
    { key: 'items', header: 'Declared goods', render: (row) => itemSummary(row) },
    { key: 'date', header: 'Submitted', render: (row) => formatDate(row.submittedAt) },
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
        title="Donations"
        description="Verify submissions, schedule collections, record what arrived, or reject and cancel ineligible donations."
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
            Refresh donations
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
        aria-label="Donation filters"
        className="rounded-lg border border-border bg-surface p-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FieldLayout>
            <Label htmlFor="donation-status">Status</Label>
            <NativeSelect
              id="donation-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                resetPage();
              }}
              className="mt-1"
            >
              <option value="ALL">All statuses</option>
              {DONATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </NativeSelect>
          </FieldLayout>
          <FieldLayout>
            <Label htmlFor="donation-campaign">Campaign</Label>
            <NativeSelect
              id="donation-campaign"
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
            <Label htmlFor="donation-search">Search</Label>
            <Input
              id="donation-search"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                resetPage();
              }}
              placeholder="Reference, donor, or goods"
            />
          </FieldLayout>
          <FieldLayout>
            <Label htmlFor="donation-from">From</Label>
            <Input
              id="donation-from"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                resetPage();
              }}
            />
          </FieldLayout>
          <FieldLayout>
            <Label htmlFor="donation-to">To</Label>
            <Input
              id="donation-to"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                resetPage();
              }}
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
        loadingLabel="Loading donations…"
        isEmpty={(rows) => rows.length === 0}
        emptyTitle="No donations match"
        emptyDescription="Adjust the filters or check another queue status."
      >
        {(rows) => (
          <div>
            <DataTable
              caption="Donation review queue"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total} donations
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
        className="break-words"
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogTitle>
          {selected === null
            ? 'Donation'
            : `${selected.referenceNumber} · ${STATUS_LABEL[selected.status] ?? selected.status}`}
        </DialogTitle>
        <DialogDescription>
          {action === null
            ? 'Review the submission, then choose the next valid staff action.'
            : 'Only the actions allowed by the current status are shown.'}
        </DialogDescription>
        <fieldset
          disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          className="min-w-0 border-0 p-0"
        >
          {mutation.isPending && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm">
              <Spinner aria-hidden="true" />
              Saving donation…
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
                <dt className="text-text-muted">Donor</dt>
                <dd className="font-medium">{selected.donorName}</dd>
                <dt className="text-text-muted">Email</dt>
                <dd>{selected.donorEmail}</dd>
                <dt className="text-text-muted">Campaign</dt>
                <dd>{selected.campaignName}</dd>
                <dt className="text-text-muted">Submitted</dt>
                <dd>{formatDate(selected.submittedAt)}</dd>
                <dt className="text-text-muted">Preferred date</dt>
                <dd>
                  {selected.preferredDate === null ? '—' : formatDate(selected.preferredDate)}
                </dd>
              </dl>
              <div>
                <h3 className="font-medium">Declared items</h3>
                <ul className="mt-1 space-y-1">
                  {selected.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span>
                        {item.itemTypeName}
                        {item.customName === null ? '' : ` (${item.customName})`}
                      </span>
                      <span className="text-text-muted">
                        declared {item.quantityDeclared}
                        {item.quantityReceived === null
                          ? ''
                          : ` · received ${item.quantityReceived}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {selected.rejectionReason === null ? null : (
                <p>
                  <span className="font-medium">Rejection reason: </span>
                  {selected.rejectionReason}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {selected.status === 'PENDING' ? (
                  <>
                    <Button type="button" onClick={() => openAction('verify')}>
                      Verify
                    </Button>
                    <Button type="button" variant="accent" onClick={() => openAction('reject')}>
                      Reject
                    </Button>
                    <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                      Cancel
                    </Button>
                  </>
                ) : null}
                {selected.status === 'VERIFIED' ? (
                  <>
                    <Button type="button" onClick={() => openAction('schedule')}>
                      Schedule
                    </Button>
                    <Button type="button" onClick={() => openAction('collect')}>
                      Collect
                    </Button>
                    <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                      Cancel
                    </Button>
                  </>
                ) : null}
                {selected.status === 'SCHEDULED' ? (
                  <>
                    <Button type="button" variant="accent" onClick={() => openAction('schedule')}>
                      Reschedule
                    </Button>
                    <Button type="button" onClick={() => openAction('collect')}>
                      Collect
                    </Button>
                    <Button type="button" variant="accent" onClick={() => openAction('cancel')}>
                      Cancel
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {selected !== null && action === 'verify' ? (
            <div className="mt-4 text-sm">
              <p>
                Verify {selected.referenceNumber} from {selected.donorName}? The donor will receive
                a verification email.
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
                      `/api/v1/donations/${encodeURIComponent(selected.id)}/verify`,
                      undefined,
                      'Donation verified.',
                    )
                  }
                >
                  Confirm verify
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {selected !== null && action === 'reject' ? (
            <div className="mt-4">
              <Label htmlFor="donation-reject-reason">Reason the donor will see</Label>
              <Textarea
                id="donation-reject-reason"
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
                <Button type="button" onClick={submitReject}>
                  Confirm rejection
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {selected !== null && action === 'schedule' ? (
            <div className="mt-4">
              <Label htmlFor="donation-schedule-event">Collection event</Label>
              {scheduleEventsQuery.isPending ? (
                <p role="status" className="mt-1 text-sm text-text-muted">
                  Loading collection events…
                </p>
              ) : scheduleEventsQuery.isError ? (
                <div className="mt-1 text-sm">
                  <Alert variant="destructive">
                    <AlertDescription>Collection events could not load.</AlertDescription>
                  </Alert>
                  <Button
                    type="button"
                    variant="accent"
                    className="mt-2"
                    onClick={() => void scheduleEventsQuery.refetch()}
                  >
                    Retry events
                  </Button>
                </div>
              ) : (
                <NativeSelect
                  id="donation-schedule-event"
                  value={eventId}
                  onChange={(event) => setEventId(event.target.value)}
                  className="mt-1"
                >
                  <option value="">Select an event</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} · {event.location} · {formatDate(event.startAt)}
                    </option>
                  ))}
                </NativeSelect>
              )}
              {!scheduleEventsQuery.isPending &&
                !scheduleEventsQuery.isError &&
                events.length === 0 && (
                  <Alert role="status" variant="info">
                    <AlertDescription>
                      No eligible collection events. Create a scheduled collection event for this
                      campaign in Calendar.
                    </AlertDescription>
                  </Alert>
                )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="accent">
                    Back
                  </Button>
                </DialogClose>
                <Button type="button" onClick={submitSchedule}>
                  Confirm schedule
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {selected !== null && action === 'collect' ? (
            <div className="mt-4 space-y-3">
              {selected.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
                >
                  <p className="text-sm font-medium sm:col-span-2">
                    {item.itemTypeName} · declared {item.quantityDeclared} {item.unit}
                  </p>
                  <div>
                    <Label htmlFor={`collect-qty-${item.id}`}>Received</Label>
                    <Input
                      id={`collect-qty-${item.id}`}
                      type="number"
                      min={0}
                      step={1}
                      value={received[item.id] ?? ''}
                      onChange={(event) =>
                        setReceived((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`collect-expiry-${item.id}`}>Expiry date</Label>
                    <Input
                      id={`collect-expiry-${item.id}`}
                      type="date"
                      value={expiry[item.id] ?? ''}
                      onChange={(event) =>
                        setExpiry((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="accent">
                    Back
                  </Button>
                </DialogClose>
                <Button type="button" onClick={submitCollect}>
                  Confirm collection
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {selected !== null && action === 'cancel' ? (
            <div className="mt-4 text-sm">
              <p>
                Cancel {selected.referenceNumber}? Cancelled donations leave the review queue and
                cannot be reopened here.
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
                      `/api/v1/donations/${encodeURIComponent(selected.id)}/cancel`,
                      undefined,
                      'Donation cancelled.',
                    )
                  }
                >
                  Confirm cancellation
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </fieldset>
      </Dialog>
    </div>
  );
}
