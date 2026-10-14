import { useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export function AdminMessagesPage() {
  const [draft, setDraft] = useState('');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Conversations with donors and beneficiaries about relief work."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
          <EmptyState
            title="No conversations yet"
            description="Messaging arrives in a later release. Urgent matters go out by email for now."
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card lg:col-span-2">
          <p className="text-sm text-text-muted">
            Select a conversation to read it here once messaging is available.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a message…"
              disabled
              aria-disabled="true"
              title="Messaging arrives in a later release"
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Messaging arrives in a later release"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
