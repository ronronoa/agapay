import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { login } from '../../lib/auth-api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    void login(email, password).catch((err: unknown) => {
      setError(
        err instanceof ApiClientError ? err.message : 'We could not sign you in. Please try again.',
      );
      setSubmitting(false);
    });
  }

  const inputClass = 'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm';

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-text-muted">Use your Agapay staff or admin account.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error === null ? undefined : 'login-error'}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error === null ? undefined : 'login-error'}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        {error === null ? null : (
          <p id="login-error" role="alert" className="text-sm font-medium text-text">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
