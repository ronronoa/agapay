import { useState } from 'react';
import type { FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trackRequestSchema, type TrackRequestInput } from '@agapay/shared';
import { ApiClientError } from '../../lib/api-client';
import { trackAssistanceRequest } from '../../lib/public-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { PageHeader } from '../../components/layout/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

type TrackResult = Awaited<ReturnType<typeof trackAssistanceRequest>>;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function TrackAssistancePage() {
  const [result, setResult] = useState<TrackResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<TrackRequestInput>({
    resolver: zodResolver(trackRequestSchema),
  });

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
    <div className="min-h-screen bg-bg border">
      <LandingHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 min-h-screen flex items-center justify-center">
        <div className="space-y-6 px-4 py-10 bg-surface border border-border rounded-xs">
          <PageHeader
            title="Track your request"
            description="Enter the code from your confirmation email together with the email address you registered with."
          />

          <form onSubmit={onLookup} noValidate className="space-y-4 rounded-lg py-5 px-4">
            <Field control={control} name="code" label="Tracking or reference code">
              {(field) => (
                <Input
                  id={field.id}
                  autoComplete="off"
                  placeholder="TRK-XXXX-XXXX or REQ-2026-000000"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                  className="py-4 rounded-xs"
                />
              )}
            </Field>

            <Field control={control} name="email" label="Email address">
              {(field) => (
                <Input
                  id={field.id}
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                  className="rounded-xs"
                />
              )}
            </Field>

            {lookupError === null ? null : (
              <p role="alert" className="text-sm font-medium">
                {lookupError}
              </p>
            )}

            <button
              type="submit"
              disabled={lookingUp}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lookingUp ? 'Looking up…' : 'Track request'}
            </button>
          </form>

          {result === null ? null : (
            <section
              aria-label="Request status"
              className="space-y-4 rounded-sm border border-border bg-surface p-5 shadow-card"
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
      </main>
      <LandingFooter />
    </div>
  );
}
