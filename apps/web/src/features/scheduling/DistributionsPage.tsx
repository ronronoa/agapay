import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  assistanceRequestDtoSchema,
  campaignSchema,
  calendarEventDtoSchema,
  distributionListResponseSchema,
  inventoryDtoSchema,
  createDistributionSchema,
  completeDistributionSchema,
  type DistributionDto,
} from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import {
  Field,
  QueryNotice,
  dateTime,
  selectClass,
  useAll,
  words,
  formText,
  actionError,
} from './shared';

export function DistributionsPage() {
  const [params] = useSearchParams();
  const [event, setEvent] = useState(params.get('event') ?? '');
  const [campaign, setCampaign] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(!!params.get('request'));
  const [selected, setSelected] = useState<DistributionDto | null>(null);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const campaigns = useAll('/api/v1/campaigns', campaignSchema);
  const events = useAll('/api/v1/calendar/events?type=DISTRIBUTION', calendarEventDtoSchema);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...(event ? { eventId: event } : {}),
    ...(campaign ? { campaignId: campaign } : {}),
    ...(status ? { status } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const list = useApiQuery(
    ['scheduling', 'distributions', query.toString()],
    `/api/v1/distributions?${query}`,
    distributionListResponseSchema,
  );
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['scheduling'] });
    list.refetch();
    setNotice('Distribution saved.');
  };
  const reset = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Distributions"
        description="Reserve goods, schedule beneficiaries, and record handovers."
        actions={<Button onClick={() => setCreating(true)}>Schedule beneficiary</Button>}
      />
      {notice && <p role="status">{notice}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Search request reference">
          <Input value={search} onChange={(e) => reset(setSearch, e.target.value)} />
        </Field>
        <Field label="Campaign">
          <select
            className={selectClass}
            value={campaign}
            onChange={(e) => reset(setCampaign, e.target.value)}
          >
            <option value="">All campaigns</option>
            {campaigns.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event">
          <select
            className={selectClass}
            value={event}
            onChange={(e) => reset(setEvent, e.target.value)}
          >
            <option value="">All distribution events</option>
            {events.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={selectClass}
            value={status}
            onChange={(e) => reset(setStatus, e.target.value)}
          >
            <option value="">All statuses</option>
            {['SCHEDULED', 'DISTRIBUTED', 'NO_SHOW', 'CANCELLED'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      {(campaigns.error || events.error) && (
        <QueryNotice
          pending={false}
          error={campaigns.error ?? events.error}
          retry={() => {
            void campaigns.refetch();
            void events.refetch();
          }}
        />
      )}
      <AsyncBoundary
        data={list.data}
        error={list.error}
        isPending={list.isPending}
        onRetry={list.refetch}
        isEmpty={(d) => d.data.items.length === 0}
        emptyTitle="No distributions"
        emptyDescription="Schedule an approved beneficiary request to reserve goods for an event."
      >
        {(d) => (
          <>
            <DataTable
              caption="Distributions"
              rows={d.data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'request', header: 'Request', render: (r) => r.requestReference },
                { key: 'event', header: 'Event', render: (r) => r.eventTitle },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <span className="capitalize">{words(r.status)}</span>,
                },
                {
                  key: 'items',
                  header: 'Goods',
                  render: (r) => r.items.map((i) => `${i.itemTypeName} × ${i.quantity}`).join(', '),
                },
                {
                  key: 'action',
                  header: 'Action',
                  render: (r) => (
                    <Button variant="accent" onClick={() => setSelected(r)}>
                      View distribution
                    </Button>
                  ),
                },
              ]}
            />
            <div className="mt-4 flex items-center justify-between">
              <Button variant="accent" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <p className="text-sm">
                Page {page} · {d.data.total} distributions
              </p>
              <Button
                variant="accent"
                disabled={page * 20 >= d.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </AsyncBoundary>
      {creating && (
        <ScheduleForm
          eventId={event}
          requestId={params.get('request') ?? ''}
          close={() => setCreating(false)}
          saved={refresh}
        />
      )}
      {selected && (
        <DistributionDetails row={selected} close={() => setSelected(null)} saved={refresh} />
      )}
    </div>
  );
}

function ScheduleForm({
  eventId,
  requestId,
  close,
  saved,
}: {
  eventId: string;
  requestId: string;
  close: () => void;
  saved: () => void;
}) {
  const requests = useAll(
    '/api/v1/assistance-requests?status=APPROVED',
    assistanceRequestDtoSchema,
  );
  const events = useAll(
    '/api/v1/calendar/events?type=DISTRIBUTION&status=SCHEDULED',
    calendarEventDtoSchema,
  );
  const [request, setRequest] = useState(requestId);
  const [event, setEvent] = useState(eventId);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = requests.data?.find((r) => r.id === request);
  const stock = useAll(
    `/api/v1/inventory?campaignId=${selected?.campaignId ?? ''}`,
    inventoryDtoSchema,
    !!selected,
  );
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const items = (stock.data ?? []).flatMap((i) =>
        Number(amounts[i.itemTypeId] ?? 0) > 0
          ? [{ itemTypeId: i.itemTypeId, quantity: Number(amounts[i.itemTypeId]) }]
          : [],
      );
      const body = createDistributionSchema.parse({
        requestId: request,
        calendarEventId: event,
        items,
      });
      await apiFetch('/api/v1/distributions', { method: 'POST', body });
      saved();
      close();
    } catch (e) {
      setError(actionError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      size="xl"
    >
      <DialogTitle>Schedule beneficiary</DialogTitle>
      <DialogDescription>
        Select an approved request, an event, and goods to reserve.
      </DialogDescription>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <QueryNotice
          pending={requests.isPending || events.isPending}
          error={requests.error ?? events.error}
          retry={() => {
            void requests.refetch();
            void events.refetch();
          }}
        />
        <Field label="Approved request">
          <select
            required
            className={selectClass}
            value={request}
            onChange={(e) => {
              setRequest(e.target.value);
              setAmounts({});
              setEvent('');
            }}
          >
            <option value="">Choose request</option>
            {requests.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.referenceNumber} · {r.fullName} · {r.campaignName}
              </option>
            ))}
          </select>
        </Field>
        {selected && (
          <p className="text-sm text-text-muted">
            Requested: {selected.items.map((i) => `${i.itemTypeName} × ${i.quantity}`).join(', ')}
          </p>
        )}
        <Field label="Distribution event">
          <select
            required
            className={selectClass}
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          >
            <option value="">Choose event</option>
            {events.data
              ?.filter(
                (e) =>
                  (!selected || e.campaignId === selected.campaignId) &&
                  +new Date(e.endAt) > Date.now(),
              )
              .map((e) => (
                <option
                  key={e.id}
                  value={e.id}
                  disabled={e.capacity !== null && e.occupied >= e.capacity}
                >
                  {e.title} · {dateTime(e.startAt)} · {e.occupied}/{e.capacity ?? 'unlimited'}
                </option>
              ))}
          </select>
        </Field>
        {selected && (
          <>
            <QueryNotice
              pending={stock.isPending}
              error={stock.error}
              retry={() => {
                void stock.refetch();
              }}
            />
            <h3 className="font-semibold">Goods to reserve</h3>
            {stock.data?.length === 0 && <p>No inventory for this campaign.</p>}
            {stock.data?.map((i) => (
              <div
                key={i.id}
                className="grid grid-cols-2 items-end gap-3 border-b border-border pb-3"
              >
                <p className="text-sm">
                  {i.itemTypeName}
                  <span className="block text-text-muted">
                    {i.available} {i.unit} available
                  </span>
                </p>
                <Field label={`Reserve ${i.itemTypeName}`}>
                  <Input
                    type="number"
                    min={0}
                    max={i.available}
                    value={amounts[i.itemTypeId] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [i.itemTypeId]: e.target.value }))}
                  />
                </Field>
              </div>
            ))}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <DialogFooter>
          <Button disabled={busy} variant="accent" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !selected || stock.isPending || !!stock.error}>
            {busy ? 'Reserving…' : 'Reserve and schedule'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function DistributionDetails({
  row,
  close,
  saved,
}: {
  row: DistributionDto;
  close: () => void;
  saved: () => void;
}) {
  const [action, setAction] = useState<'complete' | 'move' | 'cancel' | 'no-show' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const events = useAll(
    '/api/v1/calendar/events?type=DISTRIBUTION&status=SCHEDULED',
    calendarEventDtoSchema,
  );
  const request = useAll(
    `/api/v1/assistance-requests?q=${encodeURIComponent(row.requestReference)}`,
    assistanceRequestDtoSchema,
  );
  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError('');
    try {
      const f = new FormData(form);
      const body =
        action === 'complete'
          ? completeDistributionSchema.parse({
              receivedByName: formText(f, 'receivedByName'),
              notes: formText(f, 'notes'),
              items: row.items.map((i) => ({
                distributionItemId: i.id,
                quantity: Number(f.get(i.id)),
              })),
            })
          : action === 'move'
            ? { calendarEventId: formText(f, 'event') }
            : {};
      await apiFetch(`/api/v1/distributions/${row.id}${action === 'move' ? '' : `/${action}`}`, {
        method: action === 'move' ? 'PATCH' : 'POST',
        body,
      });
      saved();
      close();
    } catch (e) {
      setError(actionError(e));
    } finally {
      setBusy(false);
    }
  }
  const campaignId = request.data?.find((r) => r.id === row.requestId)?.campaignId;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      size="xl"
    >
      <DialogTitle>{row.requestReference}</DialogTitle>
      <DialogDescription>
        {row.eventTitle} · {words(row.status)}
      </DialogDescription>
      <div className="mt-4 space-y-3">
        {row.items.map((i) => (
          <p key={i.id}>
            {i.itemTypeName}: {i.quantity} {i.unit}
          </p>
        ))}
        {row.receivedByName && <p>Received by: {row.receivedByName}</p>}
        {row.distributedAt && <p>Handed over: {dateTime(row.distributedAt)}</p>}
        {row.notes && <p>{row.notes}</p>}
        {action && (
          <form
            className="space-y-4 rounded-md border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            {action === 'complete' && (
              <>
                <Field label="Received by">
                  <Input name="receivedByName" required minLength={2} maxLength={120} />
                </Field>
                {row.items.map((i) => (
                  <Field
                    key={i.id}
                    label={`Handed over: ${i.itemTypeName} (reserved ${i.quantity})`}
                  >
                    <Input
                      type="number"
                      name={i.id}
                      required
                      min={0}
                      max={i.quantity}
                      defaultValue={i.quantity}
                    />
                  </Field>
                ))}
                <Field label="Notes (optional)">
                  <textarea name="notes" className={selectClass} maxLength={2000} />
                </Field>
                <p className="text-sm text-text-muted">
                  Any unused quantities return to available inventory.
                </p>
              </>
            )}
            {action === 'move' && (
              <>
                <QueryNotice
                  pending={events.isPending || request.isPending}
                  error={events.error ?? request.error}
                  retry={() => {
                    void events.refetch();
                    void request.refetch();
                  }}
                />
                <Field label="New event">
                  <select name="event" className={selectClass} required defaultValue="">
                    <option value="">Choose event</option>
                    {events.data
                      ?.filter(
                        (e) =>
                          e.id !== row.calendarEventId &&
                          e.campaignId === campaignId &&
                          +new Date(e.endAt) > Date.now(),
                      )
                      .map((e) => (
                        <option
                          key={e.id}
                          value={e.id}
                          disabled={e.capacity !== null && e.occupied >= e.capacity}
                        >
                          {e.title} · {dateTime(e.startAt)}
                        </option>
                      ))}
                  </select>
                </Field>
                <p>Goods remain reserved. The beneficiary will receive the revised schedule.</p>
              </>
            )}
            {(action === 'cancel' || action === 'no-show') && (
              <p>
                Confirm {action === 'cancel' ? 'cancellation' : 'no-show'}? Reserved goods will be
                released and the request can be scheduled again.
                {action === 'no-show'
                  ? ' This is available only after the event ends.'
                  : ' The beneficiary will be notified.'}
              </p>
            )}
            <div className="flex gap-2">
              <Button disabled={busy} type="submit">
                {busy ? 'Saving…' : 'Confirm'}
              </Button>
              <Button disabled={busy} variant="accent" onClick={() => setAction(null)}>
                Back
              </Button>
            </div>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        <DialogFooter>
          {row.status === 'SCHEDULED' && !action && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAction('complete')}>Record handover</Button>
              <Button variant="accent" onClick={() => setAction('move')}>
                Reschedule
              </Button>
              <Button variant="accent" onClick={() => setAction('no-show')}>
                Mark no-show
              </Button>
              <Button variant="accent" onClick={() => setAction('cancel')}>
                Cancel allocation
              </Button>
            </div>
          )}
          <Button disabled={busy} variant="accent" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
