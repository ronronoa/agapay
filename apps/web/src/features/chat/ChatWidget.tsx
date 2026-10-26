import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { z } from 'zod';
import { MessageCircle, RefreshCcw, Send, Square, X, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CHAT_FAQ,
  chatStatusResponseSchema,
  chatSuggestionSchema,
  hasPrivateChatData,
  chatRequestSchema,
} from '@agapay/shared';
import { apiResponse } from '../../lib/api-client';
import { useApiQuery } from '../../lib/use-api-query';
import { Button, buttonVariants } from '../../components/ui/Button';
import { Popover, PopoverTrigger, PopoverClose, PopoverContent } from '../../components/ui/popover';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Message, MessageContent, MessageHeader } from '../../components/ui/message';
import { Bubble, BubbleContent } from '../../components/ui/bubble';
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from '../../components/ui/message-scroller';
import { cn } from '../../lib/utils';
import { FieldGroup, FieldLayout } from '../../components/ui/field';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { PrivateTrackingForm } from './PrivateTrackingForm';

const suggestionResult = z.object({
  form: z.enum(['request', 'donation']),
  fields: chatSuggestionSchema,
  campaignName: z.string().max(120),
  goods: z
    .array(z.object({ itemTypeId: z.string().uuid(), name: z.string().max(120).optional() }))
    .max(10)
    .optional(),
});
function textOf(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}
function Suggestion({ output }: { output: unknown }) {
  const parsed = suggestionResult.safeParse(output);
  if (!parsed.success) return null;
  const data = parsed.data;
  const params = new URLSearchParams({
    campaign: data.fields.campaignId,
    goods: JSON.stringify(data.fields),
  });
  return (
    <div className="my-3 flex flex-col items-start gap-2 text-sm">
      <p>
        Review {data.campaignName}: {data.fields.items.length} goods type(s). Quantities remain
        editable in the form.
      </p>
      <ul>
        {data.fields.items.map((item) => (
          <li key={item.itemTypeId}>
            {item.quantity} ×{' '}
            {data.goods?.find((goods) => goods.itemTypeId === item.itemTypeId)?.name ??
              'Goods type'}
          </li>
        ))}
      </ul>
      <a
        className={buttonVariants({ variant: 'outline' })}
        href={`/${data.form === 'donation' ? 'donate' : 'request-assistance'}?${params}`}
      >
        Apply to {data.form} form
      </a>
      <p className="text-xs text-text-muted">
        This fills campaign/goods only. It does not submit anything.
      </p>
    </div>
  );
}

function QuickQuestions() {
  return (
    <section aria-label="Agapay FAQ" className="flex flex-col">
      <h3 className="mb-1 text-xs font-medium text-text-muted">Quick questions</h3>
      {CHAT_FAQ.map((faq) => (
        <details key={faq.question} className="border-b border-border py-3 text-xs">
          <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary">
            {faq.question}
          </summary>
          <p className="mt-2 text-text-muted">{faq.answer}</p>
        </details>
      ))}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a className="text-primary underline" href="/request-assistance">
          Request assistance
        </a>
        <a className="text-primary underline" href="/track">
          Track a request
        </a>
        <a className="text-primary underline" href="/campaigns">
          View campaigns
        </a>
      </div>
    </section>
  );
}

function Conversation({
  expanded,
  onToggleExpand,
}: {
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [tracking, setTracking] = useState(false);
  const sentDraft = useRef('');
  const inFlight = useRef(false);
  const query = useApiQuery(['assistant-status'], '/api/v1/chat/status', chatStatusResponseSchema);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/v1/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: chatRequestSchema.parse({
            messages: messages
              .slice(-20)
              .filter((message) => message.role !== 'system' && textOf(message).trim())
              .map((message) => ({ role: message.role, content: textOf(message).slice(0, 1000) })),
          }),
        }),
        fetch: async (_url, init) => {
          const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          return apiResponse('/api/v1/chat', {
            method: 'POST',
            body,
            ...(init?.signal ? { signal: init.signal } : {}),
          });
        },
      }),
    [],
  );
  const chat = useChat({
    transport,
    onError: () => {
      inFlight.current = false;
      setDraft(sentDraft.current);
      toast.error(
        'The assistant could not answer. Your message is kept; use the FAQ or try again.',
      );
      void query.refetch();
    },
    onFinish: ({ isError, isAbort }) => {
      inFlight.current = false;
      if (!isError && !isAbort) setDraft('');
      void query.refetch();
    },
  });
  const stop = chat.stop;
  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );
  const busy = chat.status === 'submitted' || chat.status === 'streaming';
  async function send() {
    if (inFlight.current || busy || !consent || !query.data?.data.available || !draft.trim())
      return;
    if (hasPrivateChatData(draft)) {
      toast.error('Keep private details out of chat. Use Track privately for request lookups.');
      return;
    }
    inFlight.current = true;
    sentDraft.current = draft.trim();
    chat.clearError();
    try {
      await chat.sendMessage({ text: draft.trim() });
    } catch {
      inFlight.current = false;
    }
  }
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 bg-primary p-3 text-surface">
        <Avatar>
          <AvatarFallback variant="sidebar">AI</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 id="assistant-heading" className="truncate text-sm font-semibold">
            Agapay assistant
          </h2>
          <p className="text-xs">
            {query.isPending
              ? 'Checking…'
              : query.data?.data.available
                ? 'AI enabled'
                : 'Quick answers available'}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="sidebar"
            size="icon"
            aria-label="Check assistant availability"
            title="Refresh availability"
            disabled={query.isFetching || busy}
            onClick={() => {
              query.refetch();
            }}
          >
            <RefreshCcw aria-hidden="true" />
          </Button>
          <Button
            variant="sidebar"
            size="icon"
            aria-label={expanded ? 'Restore AI assistant size' : 'Expand AI assistant'}
            title={expanded ? 'Restore size' : 'Expand'}
            onClick={onToggleExpand}
          >
            {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
          <PopoverClose asChild>
            <Button variant="sidebar" size="icon" aria-label="Close AI assistant" title="Close">
              <X aria-hidden="true" />
            </Button>
          </PopoverClose>
        </div>
      </header>
      <p id="assistant-description" className="sr-only">
        Read-only AI guidance, quick answers and private request tracking.
      </p>
      <MessageScrollerProvider autoScroll defaultScrollPosition="start">
        <MessageScroller>
          <MessageScrollerViewport
            aria-label="Assistant message history"
            className="rounded-none p-4"
          >
            <MessageScrollerContent className="gap-4">
              <p role="status" className="text-xs text-text-muted">
                {query.isPending
                  ? 'Checking availability…'
                  : query.data?.data.available
                    ? `${query.data.data.remainingToday} model calls remaining today`
                    : 'AI unavailable. FAQ and private tracking remain available.'}
              </p>
              <details className="text-xs text-text-muted">
                <summary className="w-fit cursor-pointer py-1 font-medium">
                  About AI &amp; privacy
                </summary>
                <p className="mt-2 leading-relaxed">
                  AI messages and sanitized tool results are processed by Google Gemini. Do not
                  enter names, emails, phone numbers, addresses, passwords or private notes. Chats
                  are not saved by Agapay; closing this panel clears them. For urgent help, contact
                  local emergency services or your barangay.
                </p>
              </details>
              {!tracking && (
                <label className="flex items-start gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  I understand that AI chat text goes to Google Gemini.
                </label>
              )}
              {tracking ? (
                <PrivateTrackingForm />
              ) : (
                <>
                  <MessageScrollerItem messageId="assistant-welcome">
                    <Message>
                      <Avatar>
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <MessageContent>
                        <Bubble>
                          <BubbleContent className="text-sm">
                            Hi! I can help with campaigns, donations, and assistance requests. What
                            would you like to know?
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                  <QuickQuestions />
                  <div
                    role="log"
                    aria-live="polite"
                    aria-label="AI conversation"
                    className="flex flex-col gap-3"
                  >
                    {chat.messages.map((message) => (
                      <MessageScrollerItem messageId={message.id} key={message.id}>
                        <Message align={message.role === 'user' ? 'end' : 'start'}>
                          {message.role !== 'user' && (
                            <Avatar>
                              <AvatarFallback>AI</AvatarFallback>
                            </Avatar>
                          )}
                          <MessageContent>
                            <MessageHeader className="sr-only">
                              {message.role === 'user' ? 'You' : 'Agapay assistant'}
                            </MessageHeader>
                            <Bubble align={message.role === 'user' ? 'end' : 'start'}>
                              <BubbleContent className="text-sm">{textOf(message)}</BubbleContent>
                              {message.parts.map((part, index) =>
                                'output' in part && part.state === 'output-available' ? (
                                  <Suggestion key={index} output={part.output} />
                                ) : null,
                              )}
                              {message.parts.some(
                                (part) =>
                                  'output' in part &&
                                  part.state === 'output-available' &&
                                  typeof part.output === 'object' &&
                                  part.output !== null &&
                                  'action' in part.output &&
                                  part.output.action === 'show-tracking-form',
                              ) && (
                                <Button variant="outline" onClick={() => setTracking(true)}>
                                  Open private tracking
                                </Button>
                              )}
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ))}
                  </div>
                  {busy && (
                    <p role="status" className="text-xs text-text-muted">
                      {chat.status === 'submitted' ? 'Thinking…' : 'Writing…'}
                    </p>
                  )}
                </>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form
        className="shrink-0 border-t border-border bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <FieldGroup className="gap-2">
          {!tracking && (
            <>
              <div className="flex items-end gap-2">
                <FieldLayout className="min-w-0 flex-1">
                  <Label htmlFor="assistant-draft" className="sr-only">
                    Message to AI assistant
                  </Label>
                  <Textarea
                    id="assistant-draft"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={1000}
                    disabled={busy || !query.data?.data.available}
                    placeholder="Type your message…"
                    className="min-h-11 max-h-28 resize-none"
                    aria-describedby="assistant-composer-hint"
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.altKey &&
                        !event.repeat &&
                        !event.nativeEvent.isComposing &&
                        event.nativeEvent.keyCode !== 229
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                </FieldLayout>
                {busy ? (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Stop"
                    title="Stop response"
                    className="rounded-full"
                    onClick={() => {
                      inFlight.current = false;
                      void chat.stop();
                    }}
                  >
                    <Square aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Send"
                    title="Send message"
                    className="rounded-full"
                    disabled={!consent || !query.data?.data.available || !draft.trim()}
                  >
                    <Send aria-hidden="true" />
                  </Button>
                )}
              </div>
              <p id="assistant-composer-hint" className="sr-only">
                {consent
                  ? 'Enter to send. Shift+Enter for a new line.'
                  : 'Select the Google Gemini consent checkbox above to send your message.'}
              </p>
              {!consent && query.data?.data.available && (
                <p className="text-xs text-text-muted">
                  Select the Google Gemini consent checkbox above to send.
                </p>
              )}
            </>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="min-h-8"
              onClick={() => setTracking((value) => !value)}
            >
              {tracking ? 'Hide private tracking' : 'Track privately'}
            </Button>
            {!tracking && <span className="text-xs text-text-muted">{draft.length}/1000</span>}
          </div>
        </FieldGroup>
      </form>
    </>
  );
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setExpanded(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          className="fixed bottom-4 right-4 rounded-full"
          size="icon"
          aria-label="Open Agapay AI assistant"
        >
          <MessageCircle />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={8}
        aria-labelledby="assistant-heading"
        aria-describedby="assistant-description"
        className={cn(
          'flex h-[min(38rem,calc(100dvh-6rem))] max-h-[var(--radix-popover-content-available-height)] w-[23rem] flex-col overflow-hidden rounded-xl',
          expanded && 'h-[calc(100dvh-6rem)] w-[44rem]',
        )}
      >
        {open && (
          <Conversation expanded={expanded} onToggleExpand={() => setExpanded((value) => !value)} />
        )}
      </PopoverContent>
    </Popover>
  );
}
