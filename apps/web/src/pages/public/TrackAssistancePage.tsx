import { useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trackRequestSchema, type TrackRequestInput } from '@agapay/shared';
import { ApiClientError } from '../../lib/api-client';
import { trackAssistanceRequest } from '../../lib/public-api';
import { PageHeader } from '../../components/layout/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';

type TrackResult = Awaited<ReturnType<typeof trackAssistanceRequest>>;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

const inputClass = 'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm';

export function TrackAssistancePage() {
  const [result, setResult] = useState<TrackResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TrackRequestInput>({ resolver: zodResolver(trackRequestSchema) });

  function onSubmit(values: TrackRequestInput): void {
    setLookingUp(true);
    setLookupError(null);
    setResult(null);

    void trackAssistanceRequest(values)
      .then((found) => {
        setResult(found);
        setLookingUp(false);
      })
      .catch((err: unknown) => {
        setLookupError(
          err instanceof ApiClientError ? err.message : 'Tracking failed. Please try again.',
        );
        setLookingUp(false);
      });
  }

  function onLookup(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void handleSubmit(onSubmit)(event);
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <PageHeader
        title="Track your request"
        description="Enter the code from your confirmation email together with the email address you registered with."
      />

      <form
        onSubmit={onLookup}
        noValidate
        className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-card"
      >
        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            Tracking or reference code
          </label>
          <input
            id="code"
            type="text"
            autoComplete="off"
            placeholder="TRK-XXXX-XXXX or REQ-2026-000000"
            {...register('code')}
            className={`mt-1 ${inputClass}`}
          />
          {errors.code === undefined ? null : (
            <p role="alert" className="mt-1 text-sm text-text-muted">
              {errors.code.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            {...register('email')}
            className={`mt-1 ${inputClass}`}
          />
          {errors.email === undefined ? null : (
            <p role="alert" className="mt-1 text-sm text-text-muted">
              {errors.email.message}
            </p>
          )}
        </div>

        {lookupError === null ? null : (
          <p role="alert" className="text-sm font-medium">
            {lookupError}
          </p>
        )}

        <button
          type="submit"
          disabled={lookingUp}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {lookingUp ? 'Looking up…' : 'Track request'}
        </button>
      </form>

      {result === null ? null : (
        <section
          aria-label="Request status"
          className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{result.campaign.name}</h2>
            <StatusBadge label={result.status.replace(/_/g, ' ')} />
          </div>
          <p className="text-sm">{result.statusMessage}</p>
          <p className="text-sm text-text-muted">
            Submitted {formatDateTime(result.submittedAt)} · Code {result.code}
          </p>

          {result.rejectionReason === null ? null : (
            <div>
              <h3 className="text-sm font-semibold">Reason</h3>
              <p className="mt-1 text-sm">{result.rejectionReason}</p>
            </div>
          )}

          {result.distribution === null ? null : (
            <div>
              <h3 className="text-sm font-semibold">Pickup schedule</h3>
              <p className="mt-1 text-sm">
                {formatDateTime(result.distribution.startAt)} to{' '}
                {formatDateTime(result.distribution.endAt)} · {result.distribution.location}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold">History</h3>
            <ol className="mt-1 space-y-1">
              {result.timeline.map((entry) => (
                <li key={`${entry.status}-${entry.at}`} className="text-sm text-text-muted">
                  {entry.status.replace(/_/g, ' ')} · {formatDateTime(entry.at)}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}
