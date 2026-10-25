import { toast } from 'sonner';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  EmailStatus,
  NotificationType,
  emailListResponseSchema,
  emailRetryResponseSchema,
  emailUsageResponseSchema,
  type EmailDto,
} from '@agapay/shared';
import { useApiQuery } from '../../lib/use-api-query';
import { apiFetch } from '../../lib/api-client';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';

const label = (value: string) => value.toLowerCase().replaceAll('_', ' ');
const date = (value: string | null) =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
const selectClass =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm';

export function EmailOperationsPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState<string>('FAILED');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<EmailDto | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const emails = useApiQuery(
    ['email-operations', params.toString()],
    `/api/v1/notifications/emails?${params}`,
    emailListResponseSchema,
  );
  const usage = useApiQuery(
    ['email-usage'],
    '/api/v1/notifications/emails/usage',
    emailUsageResponseSchema,
  );

  function refresh() {
    void client.invalidateQueries({ queryKey: ['email-operations'] });
    void client.invalidateQueries({ queryKey: ['email-usage'] });
  }
  async function retry() {
    if (busy || selected === null) return;
    setBusy(true);
    setError('');
    try {
      const response = emailRetryResponseSchema.parse(
        await apiFetch(`/api/v1/notifications/emails/${selected.id}/retry`, { method: 'POST' }),
      );
      setSelected(response.data);
      setConfirming(false);
      setPage(1);
      toast.success(
        'Email requeued. The delivery worker will apply the usual limits and schedule checks.',
      );
      refresh();
    } catch (err) {
      setError('Review current email details before retrying.');
      toast.error(err instanceof Error ? err.message : 'Could not retry this email.');
      refresh();
    } finally {
      setBusy(false);
    }
  }
  const columns: Column<EmailDto>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row) => <span className="break-all">{row.toEmail}</span>,
    },
    {
      key: 'subject',
      header: 'Email',
      render: (row) => (
        <div className="min-w-40 max-w-sm break-words">
          <p>{row.subject}</p>
          <p className="text-text-muted">{label(row.type)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge label={label(row.status)} /> },
    { key: 'attempts', header: 'Attempts', render: (row) => row.attempts },
    { key: 'scheduled', header: 'Scheduled (Manila)', render: (row) => date(row.scheduledFor) },
    {
      key: 'details',
      header: 'Actions',
      render: (row) => (
        <Button
          variant="accent"
          className="min-h-11"
          aria-label={`View delivery for ${row.subject} to ${row.toEmail}`}
          onClick={() => {
            setSelected(row);
            setConfirming(false);
            setError('');
          }}
        >
          View details
        </Button>
      ),
    },
  ];
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Email operations"
        description="Review delivery failures and requeue eligible emails."
      />
      <Button variant="accent" className="min-h-11" onClick={refresh}>
        Refresh emails and usage
      </Button>
      <AsyncBoundary
        data={usage.data?.data ?? null}
        error={usage.error}
        isPending={usage.isPending}
        onRetry={usage.refetch}
        loadingLabel="Loading email usage…"
        emptyTitle="Usage unavailable"
        emptyDescription="Refresh to load usage."
      >
        {(data) => (
          <section
            aria-label="Email usage"
            className="rounded-md border border-border bg-surface p-6"
          >
            <h2 className="font-display text-lg font-semibold">Sending usage</h2>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <dt>Today (UTC)</dt>
                <dd>
                  {data.sentToday} sent / {data.limit} limit · {data.remaining} remaining
                </dd>
              </div>
              <div>
                <dt>Rolling last hour</dt>
                <dd>
                  {data.sentThisHour} sent / {data.hourlyLimit} limit · {data.remainingThisHour}{' '}
                  remaining
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-text-muted">
              The daily budget resets at midnight UTC (8 AM Manila). Critical emails retain their
              existing budget exceptions. Sent means accepted by the provider, not confirmed inbox
              delivery.
            </p>
          </section>
        )}
      </AsyncBoundary>
      <div className="grid gap-4 sm:max-w-2xl sm:grid-cols-2">
        <label>
          Status
          <select
            className={selectClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {Object.values(EmailStatus).map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Email type
          <select
            className={selectClass}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All email types</option>
            {Object.values(NotificationType).map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-text-muted">
        Queued emails are handled automatically. Only failed emails can be retried. Suppressed
        emails are intentionally withheld. Dates below use Philippine time.
      </p>
      <AsyncBoundary
        data={emails.data}
        error={emails.error}
        isPending={emails.isPending}
        onRetry={emails.refetch}
        loadingLabel="Loading emails…"
        emptyTitle="Emails unavailable"
        emptyDescription="Refresh to load emails."
      >
        {(data) => (
          <div className="space-y-4">
            {data.data.length > 0 ? (
              <DataTable
                caption="Email deliveries"
                columns={columns}
                rows={data.data}
                rowKey={(row) => row.id}
              />
            ) : (
              <p className="rounded-md border border-border bg-surface p-6">
                No emails match these filters.
              </p>
            )}
            <nav aria-label="Email pagination" className="flex flex-wrap items-center gap-3">
              <Button
                variant="accent"
                className="min-h-11"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))} ·{' '}
                {data.meta.total} emails
              </span>
              <Button
                variant="accent"
                className="min-h-11"
                disabled={page * data.meta.pageSize >= data.meta.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          </div>
        )}
      </AsyncBoundary>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelected(null);
            setConfirming(false);
            setError('');
          }
        }}
        size="xl"
      >
        <DialogTitle>{confirming ? 'Retry this email?' : 'Email delivery details'}</DialogTitle>
        <DialogDescription>
          {confirming
            ? 'Requeue this failed email for delivery. Sending limits, priority, deduplication, and obsolete-schedule checks still apply.'
            : 'Delivery metadata only. Email bodies and password links are not shown.'}
        </DialogDescription>
        {selected && (
          <dl className="mt-4 space-y-3 break-words text-sm">
            <div>
              <dt className="font-medium">Recipient</dt>
              <dd className="break-all">{selected.toEmail}</dd>
            </div>
            <div>
              <dt className="font-medium">Subject</dt>
              <dd>{selected.subject}</dd>
            </div>
            <div>
              <dt className="font-medium">Type / status</dt>
              <dd>
                {label(selected.type)} / {label(selected.status)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Attempts / priority</dt>
              <dd>
                {selected.attempts} / {selected.priority} (lower is earlier)
              </dd>
            </div>
            <div>
              <dt className="font-medium">Last error</dt>
              <dd className="whitespace-pre-wrap">{selected.lastError ?? 'No error recorded.'}</dd>
            </div>
            <div>
              <dt className="font-medium">Provider message ID</dt>
              <dd className="break-all">{selected.providerMessageId ?? 'Not available'}</dd>
            </div>
            <div>
              <dt className="font-medium">Created (Manila)</dt>
              <dd>{date(selected.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-medium">Scheduled (Manila)</dt>
              <dd>{date(selected.scheduledFor)}</dd>
            </div>
            <div>
              <dt className="font-medium">Sent (Manila)</dt>
              <dd>{date(selected.sentAt)}</dd>
            </div>
          </dl>
        )}
        <DialogFooter>
          <Button
            variant="accent"
            disabled={busy}
            className="min-h-11"
            onClick={() => {
              if (confirming) setConfirming(false);
              else setSelected(null);
            }}
          >
            {confirming ? 'Cancel' : 'Close'}
          </Button>
          {selected?.status === 'FAILED' && (
            <Button
              disabled={busy || Boolean(error)}
              className="min-h-11"
              onClick={() => {
                if (confirming) void retry();
                else setConfirming(true);
              }}
            >
              {busy ? 'Requeuing…' : confirming ? 'Confirm retry' : 'Retry email'}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}
