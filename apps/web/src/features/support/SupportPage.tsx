import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, RefreshCcw, Search, Send } from 'lucide-react';
import {
  supportConversationResponseSchema,
  supportListResponseSchema,
  supportMessagesResponseSchema,
  supportSendResponseSchema,
  sendSupportMessageSchema,
} from '@agapay/shared';
import { apiFetch } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { getUser } from '../../lib/session';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/input';
import { AsyncBoundary } from '../../components/ui/AsyncBoundary';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Dialog, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { useLiveStatus } from './RealtimeProvider';
import { Textarea } from '../../components/ui/textarea';
import { Spinner } from '../../components/ui/spinner';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { NativeSelect } from '../../components/ui/native-select';
import { Message, MessageContent, MessageHeader, MessageFooter } from '../../components/ui/message';
import { Bubble, BubbleContent } from '../../components/ui/bubble';
import { Marker, MarkerContent } from '../../components/ui/marker';
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScrollerScrollable,
} from '../../components/ui/message-scroller';

type Draft = { body: string; clientMessageId: string };
const day = (value: string) =>
  new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
function ReaderPosition({ onChange }: { onChange: (atEnd: boolean) => void }) {
  const { end } = useMessageScrollerScrollable();
  useEffect(() => onChange(!end), [end, onChange]);
  return null;
}
export function SupportPage({ personnel }: { personnel: boolean }) {
  const client = useQueryClient();
  const status = useLiveStatus();
  const refreshing = useIsFetching({ queryKey: ['support'] }) > 0;
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState<{ status: 'OPEN' | 'CLOSED'; revision: number } | null>(
    null,
  );
  const [readRetry, setReadRetry] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const readThrough = useRef(new Map<string, number>());
  const [atBottom, setAtBottom] = useState(true);
  const mine = useQuery({
    queryKey: ['support', 'mine'],
    enabled: !personnel,
    queryFn: async () =>
      supportConversationResponseSchema.parse(
        await apiFetch('/api/v1/support/conversations', { method: 'POST' }),
      ).data,
  });
  const selected = personnel ? (params.get('conversation') ?? '') : (mine.data?.id ?? '');
  const list = useQuery({
    queryKey: ['support', 'list', search, filter, unread, page],
    enabled: personnel,
    queryFn: async () =>
      supportListResponseSchema.parse(
        await apiFetch('/api/v1/support/conversations/search', {
          method: 'POST',
          body: {
            q: search,
            ...(filter ? { status: filter } : {}),
            unread: String(unread),
            page,
            pageSize: 20,
          },
        }),
      ),
  });
  const detail = useApiQuery(
    ['support', 'detail', selected],
    `/api/v1/support/conversations/${selected}`,
    supportConversationResponseSchema,
    { enabled: Boolean(selected) },
  );
  const history = useInfiniteQuery({
    queryKey: ['support', 'messages', selected],
    enabled: Boolean(selected),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      supportMessagesResponseSchema.parse(
        await apiFetch(
          `/api/v1/support/conversations/${selected}/messages?pageSize=50${pageParam ? `&before=${pageParam}` : ''}`,
        ),
      ),
    getNextPageParam: (last) => last.meta.nextBefore ?? undefined,
  });
  const messages =
    history.data?.pages
      .slice()
      .reverse()
      .flatMap((part) => part.data) ?? [];
  const latest = messages.at(-1)?.sequence ?? 0;
  useEffect(() => {
    setAtBottom(true);
  }, [selected]);
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (
      !selected ||
      !visible ||
      closing ||
      !atBottom ||
      latest <= (readThrough.current.get(selected) ?? 0)
    )
      return;
    readThrough.current.set(selected, latest);
    void apiFetch(`/api/v1/support/conversations/${selected}/read`, {
      method: 'POST',
      body: { sequence: latest },
    })
      .then(() => {
        void client.invalidateQueries({ queryKey: ['in-app'] });
      })
      .catch(() => {
        readThrough.current.delete(selected);
        toast.error('Could not update read status. Refresh the conversation to retry.', {
          id: 'support-read-status',
        });
      });
  }, [selected, latest, visible, client, readRetry, atBottom, closing]);
  const draft = drafts[selected];
  async function send() {
    if (!selected || busy) return;
    const parsed = sendSupportMessageSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Enter a message.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      supportSendResponseSchema.parse(
        await apiFetch(`/api/v1/support/conversations/${selected}/messages`, {
          method: 'POST',
          body: parsed.data,
        }),
      );
      setDrafts((previous) => {
        const next = { ...previous };
        if (next[selected]?.clientMessageId === parsed.data.clientMessageId) delete next[selected];
        return next;
      });
      await client.invalidateQueries({ queryKey: ['support'] });
      await client.invalidateQueries({ queryKey: ['in-app'] });
    } catch (err) {
      toast.error('Message could not be sent. Retry with the same draft.');
      setError(
        err instanceof Error
          ? err.message
          : 'Message could not be sent. Retry with the same draft.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus() {
    if (!closing) return;
    setBusy(true);
    setError('');
    try {
      supportConversationResponseSchema.parse(
        await apiFetch(`/api/v1/support/conversations/${selected}`, {
          method: 'PATCH',
          body: closing,
        }),
      );
      setClosing(null);
      toast.success('Conversation status updated.');
      await client.invalidateQueries({ queryKey: ['support'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update conversation.');
      setClosing(null);
      detail.refetch();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
      <div className="sr-only">
        <PageHeader
          title="Messages"
          description={
            personnel
              ? 'A shared support inbox for donor conversations.'
              : 'Contact the Agapay operations team about your donations.'
          }
        />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p className="text-sm text-text-muted" role="status">
          {status === 'Live'
            ? 'Live updates connected'
            : `${status} · messages stay saved; refresh to check for updates.`}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh messages"
              disabled={refreshing}
              aria-busy={refreshing}
              onClick={() => {
                setError('');
                readThrough.current.delete(selected);
                setReadRetry((value) => value + 1);
                void client.invalidateQueries({ queryKey: ['support'] });
              }}
            >
              <RefreshCcw
                data-icon="inline-start"
                aria-hidden="true"
                className={cn(refreshing && 'motion-safe:animate-spin')}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh messages</TooltipContent>
        </Tooltip>
      </div>
      {!personnel && mine.isPending && <p role="status">Opening your conversation…</p>}
      {!personnel && mine.isError && (
        <div role="alert">
          <p>Could not open your conversation.</p>
          <Button onClick={() => void mine.refetch()}>Try again</Button>
        </div>
      )}
      <div
        className={cn(
          'grid min-h-0 min-w-0 flex-1 overflow-hidden bg-surface',
          personnel && 'lg:grid-cols-[20rem_minmax(0,1fr)]',
        )}
      >
        {personnel && (
          <section
            aria-label="Donor conversations"
            className={cn(
              'min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-border p-4 lg:flex lg:border-r',
              selected ? 'hidden' : 'flex',
            )}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(q.trim());
                setPage(1);
              }}
              className="flex flex-wrap gap-2"
            >
              <label className="w-full text-sm">
                <Input
                  value={q}
                  maxLength={100}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Search donors"
                />
              </label>
              <Button
                type="submit"
                variant="accent"
                disabled={list.isFetching}
                aria-busy={list.isFetching}
              >
                {list.isFetching ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Search aria-hidden="true" data-icon="inline-start" />
                )}
                Search
              </Button>
            </form>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">
                Status
                <NativeSelect
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </NativeSelect>
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unread}
                  onChange={(event) => {
                    setUnread(event.target.checked);
                    setPage(1);
                  }}
                />
                Unread only
              </label>
            </div>
            <AsyncBoundary
              data={list.data ?? null}
              error={list.isError ? 'Could not load conversations.' : null}
              isPending={list.isPending}
              isRefreshing={list.isFetching && !list.isPending}
              onRetry={() => void list.refetch()}
              emptyTitle="No conversations"
              emptyDescription="Donor conversations will appear here."
            >
              {(data) => (
                <>
                  {!data.data.length && <p>No conversations match these filters.</p>}
                  <ul className="flex flex-col gap-2">
                    {data.data.map((conversation) => (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          aria-current={selected === conversation.id ? 'true' : undefined}
                          className={cn(
                            'flex min-h-20 w-full items-center gap-3 rounded-md border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                            selected === conversation.id
                              ? 'border-primary bg-surface-alt'
                              : 'border-border hover:bg-surface-alt',
                          )}
                          onClick={() => {
                            setParams({ conversation: conversation.id });
                            setError('');
                          }}
                        >
                          <Avatar className="size-11">
                            <AvatarFallback>{initials(conversation.donorName)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 break-words">
                            <span className="block font-medium">{conversation.donorName}</span>
                            <span className="block text-sm">
                              {conversation.status === 'OPEN' ? 'Open' : 'Closed'} ·{' '}
                              {conversation.unreadCount} unread
                            </span>
                            {conversation.lastMessageAt && (
                              <time
                                className="block text-xs text-text-muted"
                                dateTime={conversation.lastMessageAt}
                              >
                                {day(conversation.lastMessageAt)}
                              </time>
                            )}
                          </span>
                          {conversation.unreadCount > 0 && (
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <nav
                    className="flex flex-wrap items-center gap-2"
                    aria-label="Conversation pagination"
                  >
                    <Button
                      variant="accent"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span>Page {page}</span>
                    <Button
                      variant="accent"
                      disabled={page * data.meta.pageSize >= data.meta.total}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </nav>
                </>
              )}
            </AsyncBoundary>
          </section>
        )}
        <section
          aria-label="Conversation"
          className={cn(
            'min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-4',
            personnel && !selected ? 'hidden lg:flex' : 'flex',
          )}
        >
          {personnel && selected && (
            <Button
              variant="ghost"
              className="mb-3 self-start lg:hidden"
              onClick={() => setParams({})}
            >
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Back to inbox
            </Button>
          )}
          {!selected ? (
            <p>Select a conversation to read and reply.</p>
          ) : (
            <>
              <AsyncBoundary
                data={detail.data?.data ?? null}
                error={detail.error}
                isPending={detail.isPending}
                isRefreshing={detail.isFetching && !detail.isPending}
                onRetry={detail.refetch}
                emptyTitle="Conversation unavailable"
                emptyDescription="Choose another conversation."
              >
                {(conversation) => (
                  <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarFallback>
                          {personnel ? initials(conversation.donorName) : 'AA'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 break-words">
                        <h2 className="font-display text-lg font-semibold">
                          {personnel ? conversation.donorName : 'Agapay support'}
                        </h2>
                        <StatusBadge label={conversation.status === 'OPEN' ? 'Open' : 'Closed'} />
                      </div>
                    </div>
                    {personnel && (
                      <Button
                        variant="accent"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() =>
                          setClosing({
                            status: conversation.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                            revision: conversation.revision,
                          })
                        }
                      >
                        {conversation.status === 'OPEN'
                          ? 'Close conversation'
                          : 'Reopen conversation'}
                      </Button>
                    )}
                  </div>
                )}
              </AsyncBoundary>
              {history.isPending ? (
                <div role="status" aria-busy="true" className="flex flex-col gap-3 py-4">
                  <Skeleton className="h-16 w-3/4" />
                  <Skeleton className="ml-auto h-16 w-3/4" />
                  <span className="text-sm text-text-muted">Loading messages…</span>
                </div>
              ) : history.isError ? (
                <div role="alert">
                  <p>Could not load messages.</p>
                  <Button onClick={() => void history.refetch()}>Try again</Button>
                </div>
              ) : (
                <>
                  {history.hasNextPage && (
                    <Button
                      variant="accent"
                      disabled={history.isFetchingNextPage}
                      onClick={() => void history.fetchNextPage()}
                    >
                      {history.isFetchingNextPage
                        ? 'Loading older messages…'
                        : 'Load older messages'}
                    </Button>
                  )}
                  {!messages.length && (
                    <p className="py-6 text-text-muted">
                      No messages yet. Send a message to start the conversation.
                    </p>
                  )}
                  <MessageScrollerProvider key={selected} autoScroll defaultScrollPosition="end">
                    <ReaderPosition onChange={setAtBottom} />
                    <MessageScroller className="my-2">
                      <MessageScrollerViewport aria-label="Message history">
                        <MessageScrollerContent>
                          {messages.map((message, index) => (
                            <MessageScrollerItem
                              messageId={message.id}
                              key={message.id}
                              className="flex flex-col gap-4"
                            >
                              {(!index ||
                                day(messages[index - 1]?.createdAt ?? message.createdAt) !==
                                  day(message.createdAt)) && (
                                <Marker>
                                  <MarkerContent>{day(message.createdAt)}</MarkerContent>
                                </Marker>
                              )}
                              <Message align={message.senderId === getUser()?.id ? 'end' : 'start'}>
                                <Avatar>
                                  <AvatarFallback>{initials(message.senderName)}</AvatarFallback>
                                </Avatar>
                                <MessageContent>
                                  <MessageHeader>
                                    {message.senderName} ·{' '}
                                    {message.senderRole === 'DONOR' ? 'Donor' : 'Operations'}
                                  </MessageHeader>
                                  <Bubble
                                    align={message.senderId === getUser()?.id ? 'end' : 'start'}
                                  >
                                    <BubbleContent>{message.body}</BubbleContent>
                                  </Bubble>
                                  <MessageFooter
                                    className={cn(
                                      'flex items-center gap-1',
                                      message.senderId === getUser()?.id && 'justify-end',
                                    )}
                                  >
                                    <time dateTime={message.createdAt}>
                                      {new Date(message.createdAt).toLocaleTimeString('en-PH', {
                                        timeZone: 'Asia/Manila',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </time>
                                    {message.senderId === getUser()?.id && (
                                      <span
                                        className="inline-flex items-center"
                                        role="img"
                                        aria-label="Sent"
                                      >
                                        <Check className="size-3" aria-hidden="true" />
                                      </span>
                                    )}
                                  </MessageFooter>
                                </MessageContent>
                              </Message>
                            </MessageScrollerItem>
                          ))}
                        </MessageScrollerContent>
                      </MessageScrollerViewport>
                      <MessageScrollerButton />
                    </MessageScroller>
                  </MessageScrollerProvider>
                </>
              )}
              {detail.data && (
                <form
                  className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  <label className="block text-sm font-medium" htmlFor="support-message">
                    Message
                  </label>
                  <div className="flex items-center gap-2">
                    <Textarea
                      id="support-message"
                      value={draft?.body ?? ''}
                      maxLength={4000}
                      disabled={busy || (personnel && detail.data.data.status === 'CLOSED')}
                      onChange={(event) => {
                        setError('');
                        setDrafts((previous) => ({
                          ...previous,
                          [selected]: {
                            body: event.target.value,
                            clientMessageId: crypto.randomUUID(),
                          },
                        }));
                      }}
                    />

                    <Button
                      type="submit"
                      className="min-h-11"
                      disabled={
                        busy ||
                        !draft?.body.trim() ||
                        (personnel && detail.data.data.status === 'CLOSED')
                      }
                      aria-busy={busy}
                    >
                      {busy ? (
                        <Spinner aria-hidden="true" data-icon="inline-start" />
                      ) : (
                        <Send aria-hidden="true" data-icon="inline-start" />
                      )}
                      {busy ? 'Saving…' : error ? 'Retry send' : 'Send message'}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-text-muted">
                      {draft?.body.length ?? 0}/4000 · Drafts stay here while Messages is open.
                    </p>
                  </div>
                  {!personnel && detail.data.data.status === 'CLOSED' && (
                    <p className="text-sm text-text-muted">
                      Sending a new message reopens your conversation.
                    </p>
                  )}
                </form>
              )}
            </>
          )}
        </section>
      </div>
      <Dialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!busy && !open) setClosing(null);
        }}
      >
        <DialogTitle>Update conversation status?</DialogTitle>
        <DialogDescription>
          History stays available. A new donor message reopens a closed conversation.
        </DialogDescription>
        <DialogFooter>
          <Button variant="accent" disabled={busy} onClick={() => setClosing(null)}>
            Cancel
          </Button>
          <Button disabled={busy} aria-busy={busy} onClick={() => void changeStatus()}>
            {busy && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {busy ? 'Saving…' : 'Confirm status change'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
