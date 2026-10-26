import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { verifyAuthEmail } from '../../lib/auth-api';
import { RecoveryLayout } from './RecoveryLayout';
import { VerificationResend } from './VerificationResend';

type VerifyState =
  { kind: 'pending' } | { kind: 'verified' } | { kind: 'invalid'; message: string };

export function VerifyEmailPage() {
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
    void verifyAuthEmail(token)
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
    <RecoveryLayout>
      <h1 className="font-display text-2xl font-bold tracking-tight">Confirm your email</h1>
      {state.kind === 'pending' ? (
        <p role="status" className="mt-2 text-sm text-text-muted">
          Confirming…
        </p>
      ) : null}
      {state.kind === 'verified' ? (
        <div>
          <p className="mt-2 font-medium">Email confirmed.</p>
          <p className="mt-1 text-sm text-text-muted">
            Your donor account is ready. Sign in to start donating.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
          >
            Go to sign in
          </Link>
        </div>
      ) : null}
      {state.kind === 'invalid' ? (
        <div>
          <p className="mt-2 font-medium">This link did not work.</p>
          <p className="mt-1 text-sm text-text-muted">{state.message}</p>
          <VerificationResend />
          <Link
            to="/login"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
          >
            Back to sign in
          </Link>
        </div>
      ) : null}
    </RecoveryLayout>
  );
}
