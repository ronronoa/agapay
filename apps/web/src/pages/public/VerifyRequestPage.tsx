import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { verifyRequestEmail } from '../../lib/public-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { PageHeader } from '../../components/layout/PageHeader';

type VerifyState =
  { kind: 'pending' } | { kind: 'verified' } | { kind: 'invalid'; message: string };

export function VerifyRequestPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<VerifyState>({ kind: 'pending' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token');
    if (token === null || token.length === 0) {
      setState({ kind: 'invalid', message: 'This confirmation link is incomplete.' });
      return;
    }
    void verifyRequestEmail(token)
      .then(() => setState({ kind: 'verified' }))
      .catch((err: unknown) => {
        setState({
          kind: 'invalid',
          message:
            err instanceof ApiClientError
              ? err.message
              : 'This confirmation link is not valid. Please try again.',
        });
      });
  }, [params]);

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="space-y-6">
          <PageHeader
            title="Confirm your email"
            description="We are confirming the address on your assistance request."
          />

          {state.kind === 'pending' ? (
            <p role="status" className="text-sm text-text-muted">
              Confirming…
            </p>
          ) : null}

          {state.kind === 'verified' ? (
            <div className="rounded-lg border border-border bg-surface p-5 shadow-card">
              <p className="font-medium">Email confirmed.</p>
              <p className="mt-1 text-sm text-text-muted">
                We can now reach you about your request. You can follow its progress any time.
              </p>
              <Link
                to="/track"
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Track my request
              </Link>
            </div>
          ) : null}

          {state.kind === 'invalid' ? (
            <div
              role="alert"
              className="rounded-lg border border-border bg-surface p-5 shadow-card"
            >
              <p className="font-medium">This link did not work.</p>
              <p className="mt-1 text-sm text-text-muted">{state.message}</p>
              <p className="mt-2 text-sm text-text-muted">
                Links expire after a day. Submit a fresh request to receive a new confirmation
                email.
              </p>
              <Link
                to="/request-assistance"
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Submit a new request
              </Link>
            </div>
          ) : null}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
