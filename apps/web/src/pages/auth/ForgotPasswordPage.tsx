import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { forgotPassword } from '../../lib/auth-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Input } from '../../components/ui/input';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    void forgotPassword(email)
      .then(() => setDone(true))
      .catch((err: unknown) => {
        setError(err instanceof ApiClientError ? err.message : 'Request failed. Please try again.');
        setSubmitting(false);
      });
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-border bg-surface p-8 shadow-card">
          <h1 className="font-display text-2xl font-bold tracking-tight">Forgot password</h1>
          {done ? (
            <p role="status" className="mt-2 text-sm text-text-muted">
              If an account uses that address, a reset link is on its way. Check your inbox.
            </p>
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby={error === null ? undefined : 'forgot-error'}
                />
              </div>
              {error === null ? null : (
                <p id="forgot-error" role="alert" className="text-sm font-medium">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-center text-sm text-text-muted">
                Remembered it?{' '}
                <Link to="/login" className="font-medium text-primary underline underline-offset-4">
                  Log In
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
