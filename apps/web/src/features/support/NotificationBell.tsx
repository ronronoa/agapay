import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, RefreshCcw, X } from 'lucide-react';
import { inboxResponseSchema } from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { getUser } from '../../lib/session';
import { Button } from '../../components/ui/Button';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from '../../components/ui/popover';
// import { useLiveStatus } from './RealtimeProvider';

export function NotificationBell() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  // const status = useLiveStatus();
  const refreshing = useIsFetching({ queryKey: ['in-app', before] }) > 0;
  const query = useApiQuery(
    ['in-app', before],
    `/api/v1/support/notifications?pageSize=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    inboxResponseSchema,
  );
  async function read(id: string) {
    setBusy(id);
    setError('');
    try {
      await apiFetch(`/api/v1/support/notifications/${id}/read`, { method: 'POST' });
      await client.invalidateQueries({ queryKey: ['in-app'] });
    } catch {
      setError('Could not mark this notification as read. Please try again.');
    } finally {
      setBusy('');
    }
  }
  const donor = getUser()?.role === 'DONOR';
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setBefore('');
      }}
      modal={false}
    >
      <PopoverTrigger asChild aria-haspopup={undefined}>
        <Button
          variant="accent"
          className="min-h-11 shrink-0 gap-2 rounded-full"
          aria-label={`Notifications${query.data ? ` (${query.data.meta.unreadCount} unread)` : ''}`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Alerts{query.data ? ` (${query.data.meta.unreadCount})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="region"
        aria-label="Notifications"
        className="flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <h2 className="font-display text-base font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="accent"
              className="h-11 w-11 p-0"
              aria-label="Refresh notifications"
              title="Refresh notifications"
              disabled={refreshing}
              onClick={query.refetch}
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
                aria-hidden="true"
              />
            </Button>
            <PopoverClose asChild>
              <Button
                variant="accent"
                className="h-11 w-11 p-0"
                aria-label="Close notifications"
                title="Close notifications"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </PopoverClose>
          </div>
        </div>
        {/* <p className="px-4 py-2 text-xs text-text-muted" role="status">
          {status === 'Live'
            ? 'Live updates are connected.'
            : `${status}. Refresh to check saved notifications.`}
        </p> */}
        <div className="min-h-0 max-h-[65dvh] overflow-y-auto overscroll-contain px-4 pb-4">
          {error && (
            <p role="alert" className="mb-3 text-sm">
              {error}
            </p>
          )}
          <AsyncBoundary
            data={query.data}
            error={query.error}
            isPending={query.isPending}
            onRetry={query.refetch}
            emptyTitle="No notifications"
            emptyDescription="Updates will appear here."
            loadingLabel="Loading notifications…"
          >
            {(data) => (
              <div className="space-y-3">
                {!data.data.length && <p>No notifications yet.</p>}
                <ul className="divide-y divide-border">
                  {data.data.map((row) => {
                    const href = row.conversationId
                      ? `${donor ? '/donor' : '/admin'}/messages?conversation=${row.conversationId}`
                      : row.donationId
                        ? donor
                          ? `/donor/donations/${row.donationId}`
                          : '/admin/donations'
                        : '/admin/calendar';
                    return (
                      <li key={row.id} className="py-3">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Link
                            className="inline-flex min-h-11 items-center hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            to={href}
                            onClick={() => setOpen(false)}
                          >
                            {row.title}
                          </Link>
                          {row.readAt === null && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary">
                              <span className="sr-only">Unread</span>
                            </span>
                          )}
                        </p>
                        <div className="mt-2 flex justify-between flex-wrap items-center gap-3">
                          <p className="text-xs text-text-muted">
                            {new Date(row.createdAt).toLocaleString('en-PH', {
                              timeZone: 'Asia/Manila',
                            })}
                          </p>
                          {row.readAt === null && (
                            <Button
                              variant="accent"
                              className="py-1 px-2 rounded-xs text-xs"
                              disabled={busy !== ''}
                              onClick={() => void read(row.id)}
                            >
                              {busy === row.id ? (
                                'Saving…'
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Check size={12} />
                                  Mark as read
                                </span>
                              )}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap gap-3">
                  {before && (
                    <Button variant="accent" className="min-h-11" onClick={() => setBefore('')}>
                      Latest notifications
                    </Button>
                  )}
                  {data.meta.nextCursor && (
                    <Button
                      variant="accent"
                      className="min-h-11"
                      onClick={() => setBefore(data.meta.nextCursor ?? '')}
                    >
                      Older notifications
                    </Button>
                  )}
                </div>
              </div>
            )}
          </AsyncBoundary>
        </div>
      </PopoverContent>
    </Popover>
  );
}
