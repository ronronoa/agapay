import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { resetPassword } from '../../lib/auth-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Input } from '../../components/ui/input';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const token = params.get('token');

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (token === null || token.length === 0) {
      setError('This reset link is incomplete.');
      return;
    }
    setSubmitting(true);
    setError(null);
    void resetPassword(token, password)
      .then(() => setDone(true))
      .catch((err: unknown) => {
        setError(err instanceof ApiClientError ? err.message : 'Reset failed. Please try again.');
        setSubmitting(false);
      });
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-border bg-surface p-8 shadow-card">
          <h1 className="font-display text-2xl font-bold tracking-tight">Set a new password</h1>
          {done ? (
            <div>
              <p role="status" className="mt-2 text-sm text-text-muted">
                Password changed. Sign in with your new password.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium">
                  New Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={error === null ? undefined : 'reset-error'}
                />
                <p className="mt-1 text-xs text-text-muted">
                  At least 10 characters. Avoid common passwords.
                </p>
              </div>
              {error === null ? null : (
                <p id="reset-error" role="alert" className="text-sm font-medium">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Change password'}
              </button>
            </form>
          )}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
