import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  campaignSchema,
  calendarEventDtoSchema,
  calendarEventResponseSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  donationDtoSchema,
  distributionDtoSchema,
  type CalendarEventDto,
} from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Field,
  QueryNotice,
  dateTime,
  eventTypes,
  localDate,
  manilaIso,
  selectClass,
  useAll,
  words,
  formText,
  actionError,
} from './shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { toast } from 'sonner';

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
export function CalendarPage() {
  const [month, setMonth] = useState(() => monthStart(new Date(Date.now() + 8 * 3600_000)));
  const [view, setView] = useState<'month' | 'list'>(() =>
    window.matchMedia('(max-width: 767px)').matches ? 'list' : 'month',
  );
  const [campaign, setCampaign] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const from = new Date(+month - 8 * 3600_000).toISOString();
  const to = new Date(+next - 8 * 3600_000).toISOString();
  const query = new URLSearchParams({
    from,
    to,
    ...(campaign ? { campaignId: campaign } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  });
  const events = useAll(`/api/v1/calendar/events?${query}`, calendarEventDtoSchema);
  const campaigns = useAll('/api/v1/campaigns', campaignSchema);
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['scheduling'] });
    toast.success('Event updated.');
  };
  const firstWeekday = month.getUTCDay();
  const days = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 0)).getUTCDate();
  const choose = (id: string) => setParams({ event: id });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Plan collections and relief distributions. All times are Philippine time."
        actions={
          <Button
            onClick={() =>
              setCreateDate(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10))
            }
          >
            Create event
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Campaign">
          <select
            className={selectClass}
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
          >
            <option value="">All campaigns</option>
            {campaigns.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event type">
          <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {words(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="accent"
            aria-label="Previous month"
            onClick={() =>
              setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))
            }
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="font-display text-xl font-semibold">
            {month.toLocaleString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </h2>
          <Button variant="accent" aria-label="Next month" onClick={() => setMonth(next)}>
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="accent"
            onClick={() => setMonth(monthStart(new Date(Date.now() + 8 * 3600_000)))}
          >
            Today
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'month' ? 'primary' : 'accent'}
            aria-pressed={view === 'month'}
            onClick={() => setView('month')}
          >
            Month
          </Button>
          <Button
            variant={view === 'list' ? 'primary' : 'accent'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </Button>
        </div>
      </div>
      <QueryNotice
        pending={events.isPending}
        error={events.error ?? campaigns.error}
        retry={() => {
          void events.refetch();
          void campaigns.refetch();
        }}
      />
      {events.data && view === 'month' && (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <div className="min-w-[640px] grid grid-cols-7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="border-b border-border p-3 text-sm text-text-muted">
                {d}
              </div>
            ))}
            {Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, i) => {
              const day = i - firstWeekday + 1;
              if (day < 1 || day > days)
                return <div key={i} className="min-h-32 border-b border-r border-border bg-bg" />;
              const date = `${month.toISOString().slice(0, 7)}-${String(day).padStart(2, '0')}`;
              const dayStart = +new Date(`${date}T00:00:00+08:00`);
              const dayEvents = events.data.filter(
                (e) =>
                  +new Date(e.startAt) < dayStart + 86_400_000 && +new Date(e.endAt) > dayStart,
              );
              return (
                <div
                  key={i}
                  className="relative min-h-32 min-w-0 border-b border-r border-border p-2"
                >
                  <button
                    type="button"
                    aria-label={`Create event on ${date}`}
                    className="absolute inset-0 size-full cursor-pointer text-left text-sm hover:bg-surface-alt focus-visible:-outline-offset-2"
                    onClick={() => setCreateDate(date)}
                  >
                    <span className="absolute left-2 top-2 rounded px-2 py-1">{day}</span>
                  </button>
                  <div className="pointer-events-none relative mt-10 flex flex-col gap-1">
                    {dayEvents.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => choose(e.id)}
                        type="button"
                        className="pointer-events-auto relative block w-full rounded border border-primary bg-surface-alt p-2 text-left text-xs hover:bg-info-bg"
                      >
                        <span className="block font-semibold break-words">{e.title}</span>
                        <span>
                          {localDate(e.startAt).slice(11)} · {words(e.type)}
                        </span>
                        <span className="block">{words(e.status)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {events.data && view === 'list' && (
        <div className="divide-y divide-border rounded-md border border-border bg-surface">
          {events.data.length === 0 ? (
            <p className="p-6 text-text-muted">
              No events in this month. Create an event to schedule relief activities.
            </p>
          ) : (
            events.data.map((e) => (
              <button
                key={e.id}
                className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-surface-alt"
                onClick={() => choose(e.id)}
              >
                <span>
                  <strong className="block">{e.title}</strong>
                  <span className="text-sm text-text-muted">
                    {dateTime(e.startAt)} · {e.location}
                  </span>
                </span>
                <span className="text-sm capitalize">
                  {words(e.type)} · {words(e.status)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {createDate && (
        <EventForm date={createDate} close={() => setCreateDate(null)} saved={refresh} />
      )}
      {params.get('event') && (
        <EventDetails id={params.get('event') ?? ''} close={() => setParams({})} saved={refresh} />
      )}
    </div>
  );
}

function EventForm({
  date,
  event,
  close,
  saved,
}: {
  date?: string;
  event?: CalendarEventDto;
  close: () => void;
  saved: () => void;
}) {
  const campaigns = useAll('/api/v1/campaigns', campaignSchema);
  const [type, setType] = useState(event?.type ?? 'DISTRIBUTION');
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  async function submit(form: HTMLFormElement) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const f = new FormData(form);
      const changes = {
        title: formText(f, 'title'),
        description: formText(f, 'description'),
        startAt: manilaIso(formText(f, 'startAt')),
        endAt: manilaIso(formText(f, 'endAt')),
        location: formText(f, 'location'),
        capacity: type === 'DISTRIBUTION' && f.get('capacity') ? Number(f.get('capacity')) : null,
      };
      const body = event
        ? updateCalendarEventSchema.parse({ ...changes, revision: event.revision })
        : createCalendarEventSchema.parse({
            ...changes,
            campaignId: formText(f, 'campaignId'),
            type,
          });
      await apiFetch(`/api/v1/calendar/events${event ? `/${event.id}` : ''}`, {
        method: event ? 'PATCH' : 'POST',
        body,
      });
      saved();
      close();
    } catch (e) {
      setError(actionError(e));
      toast.error(actionError(e));
    } finally {
      inFlight.current = false;
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
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3"
          aria-label="Close event form"
          disabled={busy}
        >
          <X aria-hidden="true" />
        </Button>
      </DialogClose>
      <DialogTitle className="pr-12">{event ? 'Edit event' : 'Create event'}</DialogTitle>
      <DialogDescription>Schedule in Philippine time. Events may overlap.</DialogDescription>
      <form
        className="mt-5 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          <Field label="Title">
            <Input
              name="title"
              required
              minLength={3}
              maxLength={200}
              defaultValue={event?.title}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event type">
              <select
                name="type"
                className={selectClass}
                value={type}
                disabled={!!event}
                onChange={(e) => {
                  const t = eventTypes.find((t) => t === e.target.value);
                  if (t) setType(t);
                }}
              >
                {eventTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Campaign">
              <select
                name="campaignId"
                className={selectClass}
                required
                disabled={!!event}
                defaultValue={event?.campaignId ?? ''}
              >
                <option value="">Choose campaign</option>
                {campaigns.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input
                type="datetime-local"
                name="startAt"
                required
                defaultValue={event ? localDate(event.startAt) : `${date}T09:00`}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="datetime-local"
                name="endAt"
                required
                defaultValue={event ? localDate(event.endAt) : `${date}T12:00`}
              />
            </Field>
          </div>
          <Field label="Location">
            <Input name="location" required maxLength={300} defaultValue={event?.location} />
          </Field>
          {type === 'DISTRIBUTION' && (
            <Field label="Capacity (beneficiary requests; leave blank for unlimited)">
              <Input
                name="capacity"
                type="number"
                min={1}
                max={100000}
                defaultValue={event?.capacity ?? ''}
              />
            </Field>
          )}
          <Field label="Description (optional)">
            <textarea
              className={selectClass}
              name="description"
              maxLength={2000}
              defaultValue={event?.description ?? ''}
            />
          </Field>
          {event && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed the {event.outstandingCollections} collections and{' '}
              {event.outstandingDistributions} distributions affected. Time or location changes will
              email their recipients.
            </label>
          )}
          {error && (
            <div>
              {event && (
                <button
                  type="button"
                  className="mt-2 underline"
                  onClick={() => {
                    void client.invalidateQueries({ queryKey: ['scheduling'] });
                    close();
                  }}
                >
                  Reload latest event
                </button>
              )}
            </div>
          )}
          {campaigns.error && (
            <Alert variant="destructive">
              <AlertDescription>{campaigns.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="accent" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || campaigns.isPending || (!!event && !confirmed)}>
              {busy ? 'Saving…' : 'Save event'}
            </Button>
          </DialogFooter>
        </fieldset>
      </form>
    </Dialog>
  );
}

function EventDetails({ id, close, saved }: { id: string; close: () => void; saved: () => void }) {
  const event = useApiQuery(
    ['scheduling', 'event', id],
    `/api/v1/calendar/events/${id}`,
    calendarEventResponseSchema,
  );
  const collections = useAll(`/api/v1/donations?eventId=${id}`, donationDtoSchema);
  const distributions = useAll(`/api/v1/distributions?eventId=${id}`, distributionDtoSchema);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<'cancel' | 'complete' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const e = event.data?.data;
  async function mutate(path: string, body: unknown) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await apiFetch(path, { method: 'POST', body });
      saved();
      setAction(null);
      event.refetch();
      void collections.refetch();
      void distributions.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
      toast.error(err instanceof Error ? err.message : 'Could not update the event.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (editing && e) return <EventForm event={e} close={() => setEditing(false)} saved={saved} />;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      size="xl"
    >
      <DialogClose asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3"
          aria-label="Close event details"
          disabled={busy}
        >
          <X aria-hidden="true" />
        </Button>
      </DialogClose>
      <DialogTitle className="pr-12">{e?.title ?? 'Event details'}</DialogTitle>
      <DialogDescription>Manage this event and its assignments.</DialogDescription>
      {event.isPending && <p role="status">Loading event…</p>}
      {event.error && (
        <Alert variant="destructive">
          {event.error} <button onClick={event.refetch}>Try again</button>
        </Alert>
      )}
      {e && (
        <div className="mt-5 space-y-4">
          <p className="capitalize">
            {words(e.type)} · {words(e.status)} · {e.campaignName}
          </p>
          <p>
            {dateTime(e.startAt)} to {dateTime(e.endAt)}
          </p>
          <p>{e.location}</p>
          {e.description && <p className="whitespace-pre-wrap">{e.description}</p>}
          {e.type === 'DISTRIBUTION' && (
            <p>
              {e.occupied} occupied / {e.capacity ?? 'unlimited'} slots
              {e.capacity !== null ? ` · ${e.capacity - e.occupied} remaining` : ''}
            </p>
          )}
          <Alert
            role="status"
            variant={
              !e.syncEnabled
                ? 'info'
                : e.syncStatus === 'FAILED'
                  ? 'destructive'
                  : e.syncStatus === 'SYNCED'
                    ? 'success'
                    : 'warning'
            }
          >
            <AlertDescription>
              {!e.syncEnabled
                ? 'Google sync disabled'
                : `Google: ${e.syncStatus === 'NOT_SYNCED' ? 'Pending' : words(e.syncStatus)}`}
            </AlertDescription>
          </Alert>
          {e.syncEnabled && e.syncStatus === 'FAILED' && (
            <Button
              disabled={busy}
              onClick={() => {
                void mutate(`/api/v1/calendar/events/${id}/resync`, {});
              }}
            >
              Retry Google sync
            </Button>
          )}
          <QueryNotice
            pending={collections.isPending || distributions.isPending}
            error={collections.error ?? distributions.error}
            retry={() => {
              void collections.refetch();
              void distributions.refetch();
            }}
          />
          {e.type === 'COLLECTION' && (
            <div>
              <h3 className="font-semibold">Donations</h3>
              {collections.data?.length === 0 && (
                <p className="text-sm text-text-muted">No donations assigned.</p>
              )}
              {collections.data?.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap justify-between gap-2 border-b border-border py-2"
                >
                  <span>
                    {d.referenceNumber} · {d.donorName} · {words(d.status)}
                  </span>
                  {d.status === 'SCHEDULED' && (
                    <Button
                      disabled={busy}
                      variant="accent"
                      onClick={() => {
                        void mutate(`/api/v1/donations/${d.id}/unschedule`, {});
                      }}
                    >
                      Remove schedule
                    </Button>
                  )}
                </div>
              ))}
              <Link className="mt-3 inline-block underline" to="/admin/donations">
                Manage collections and received goods
              </Link>
            </div>
          )}
          {e.type === 'DISTRIBUTION' && (
            <div>
              <h3 className="font-semibold">Beneficiary allocations</h3>
              {distributions.data?.length === 0 && (
                <p className="text-sm text-text-muted">No beneficiaries assigned.</p>
              )}
              {distributions.data?.map((d) => (
                <p key={d.id} className="border-b border-border py-2">
                  {d.requestReference} · {words(d.status)}
                </p>
              ))}
              <Link className="mt-3 inline-block underline" to={`/admin/distributions?event=${id}`}>
                Manage distributions for this event
              </Link>
            </div>
          )}
          {action && (
            <div className="rounded-md border border-border-strong p-4">
              <p>
                {action === 'cancel'
                  ? `Cancel this event? ${e.outstandingCollections} collections and ${e.outstandingDistributions} distributions will be unscheduled and recipients notified. Reserved goods will be released.`
                  : 'Close this event? All assignments must be resolved and the event must have ended.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() => {
                    void mutate(`/api/v1/calendar/events/${id}/${action}`, {
                      revision: e.revision,
                    });
                  }}
                >
                  Confirm {action === 'cancel' ? 'cancellation' : 'closure'}
                </Button>
                <Button disabled={busy} variant="accent" onClick={() => setAction(null)}>
                  Keep event
                </Button>
              </div>
            </div>
          )}
          {error && (
            <div>
              <button
                className="mt-2 underline"
                onClick={() => {
                  setAction(null);
                  setError('');
                  event.refetch();
                  void collections.refetch();
                  void distributions.refetch();
                }}
              >
                Refresh event
              </button>
            </div>
          )}
          <DialogFooter>
            {e.status === 'SCHEDULED' && !action && (
              <>
                <Button disabled={busy} variant="accent" onClick={() => setEditing(true)}>
                  Edit event
                </Button>
                <Button disabled={busy} variant="accent" onClick={() => setAction('cancel')}>
                  Cancel event
                </Button>
                <Button disabled={busy} onClick={() => setAction('complete')}>
                  Close event
                </Button>
              </>
            )}
            <Button variant="accent" disabled={busy} onClick={close}>
              Done
            </Button>
          </DialogFooter>
        </div>
      )}
    </Dialog>
  );
}
