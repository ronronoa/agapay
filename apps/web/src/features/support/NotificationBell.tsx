import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Check, RefreshCcw, X } from 'lucide-react';
import { inboxResponseSchema } from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { getUser } from '../../lib/session';
import { Button } from '../../components/ui/Button';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from '../../components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { Spinner } from '../../components/ui/spinner';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/badge';
// import { useLiveStatus } from './RealtimeProvider';

export function NotificationBell() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState('');
  // const status = useLiveStatus();
  const query = useApiQuery(
    ['in-app', before],
    `/api/v1/support/notifications?pageSize=20${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    inboxResponseSchema,
  );
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/v1/support/notifications/${id}/read`, { method: 'POST' });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['in-app'] });
      toast.success('Notification marked as read.');
    },
    onError: () => toast.error('Could not mark this notification as read. Please try again.'),
  });
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
          <Bell data-icon="inline-start" aria-hidden="true" />
          <span className="hidden sm:inline">Alerts</span>
          {query.data !== null && query.data.meta.unreadCount > 0 && (
            <Badge aria-hidden="true">{query.data.meta.unreadCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="region"
        aria-label="Notifications"
        className="flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <h2 className="font-display text-base font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh notifications"
                  disabled={query.isFetching}
                  aria-busy={query.isFetching}
                  onClick={query.refetch}
                >
                  <RefreshCcw
                    className={cn(query.isFetching && 'motion-safe:animate-spin')}
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh notifications</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close notifications">
                    <X data-icon="inline-start" aria-hidden="true" />
                  </Button>
                </PopoverClose>
              </TooltipTrigger>
              <TooltipContent>Close notifications</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {/* <p className="px-4 py-2 text-xs text-text-muted" role="status">
          {status === 'Live'
            ? 'Live updates are connected.'
            : `${status}. Refresh to check saved notifications.`}
        </p> */}
        <div className="min-h-0 max-h-[65dvh] overflow-y-auto overscroll-contain px-4 pb-4">
          <AsyncBoundary
            data={query.data}
            error={query.error}
            isPending={query.isPending}
            isRefreshing={query.isFetching && !query.isPending}
            onRetry={query.refetch}
            emptyTitle="No notifications"
            emptyDescription="Updates will appear here."
            loadingLabel="Loading notifications…"
            isEmpty={(data) => data.data.length === 0}
          >
            {(data) => (
              <div className="flex flex-col gap-3">
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
                            className="inline-flex min-h-11 min-w-0 items-center break-words [overflow-wrap:anywhere] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            to={href}
                            onClick={() => setOpen(false)}
                          >
                            {row.title}
                          </Link>
                          {row.readAt === null && (
                            <span className="size-2 shrink-0 rounded-full bg-primary">
                              <span className="sr-only">Unread</span>
                            </span>
                          )}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <time className="text-xs text-text-muted" dateTime={row.createdAt}>
                            {new Date(row.createdAt).toLocaleString('en-PH', {
                              timeZone: 'Asia/Manila',
                            })}
                          </time>
                          {row.readAt === null && (
                            <Button
                              variant="accent"
                              size="sm"
                              disabled={markRead.isPending}
                              aria-busy={markRead.isPending && markRead.variables === row.id}
                              onClick={() => markRead.mutate(row.id)}
                            >
                              {markRead.isPending && markRead.variables === row.id ? (
                                <>
                                  <Spinner aria-hidden="true" data-icon="inline-start" />
                                  Saving…
                                </>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Check aria-hidden="true" data-icon="inline-start" />
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
                      disabled={query.isFetching}
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
