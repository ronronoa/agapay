import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { login } from '../../lib/auth-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Input } from '../../components/ui/input';

const inputWrap = 'mt-1';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    void login(email, password)
      .then((user) => {
        void navigate(user.role === 'DONOR' ? '/donor' : '/admin', { replace: true });
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'We could not sign you in. Please try again.',
        );
        setSubmitting(false);
      });
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        <section
          aria-label="About signing in"
          className="rounded-xl border border-border bg-surface p-8 shadow-card"
        >
          <p className="text-lg font-semibold">Agapay</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Welcome back to Agapay
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Sign in to continue supporting or receiving aid. Your secure account is ready when you
            are.
          </p>
          <div className="mt-6 aspect-4/3 w-full overflow-hidden rounded-lg">
            <img
              src="/images/relief-distribution.png"
              alt="Volunteers packing donated relief goods"
              className="h-full w-full object-cover"
            />
          </div>
        </section>

        <section
          aria-label="Sign in form"
          className="rounded-xl border border-border bg-surface p-8 shadow-card"
        >
          <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-text-muted">
            Sign in to continue supporting or receiving aid.
          </p>

          <div
            role="group"
            aria-label="Choose a role"
            className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border p-1"
          >
            <span
              aria-current="true"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm font-semibold shadow-xl"
            >
              Donor
            </span>
            <Link
              to="/request-assistance"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Beneficiary
            </Link>
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={error === null ? undefined : 'login-error'}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <div className={`${inputWrap} flex gap-2`}>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={error === null ? undefined : 'login-error'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Forgot Password?
              </Link>
            </div>

            {error === null ? null : (
              <p id="login-error" role="alert" className="text-sm font-medium">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Log In'}
            </button>
            <p className="text-center text-sm text-text-muted">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-primary underline underline-offset-4"
              >
                Sign Up
              </Link>
            </p>
          </form>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
