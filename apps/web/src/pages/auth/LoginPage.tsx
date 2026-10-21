import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiClientError } from '../../lib/api-client';
import { login } from '../../lib/auth-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Input } from '../../components/ui/input';
import { ArrowRight, Eye, EyeClosed, LoaderCircle, Lock, Mail } from 'lucide-react';

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
    <div className="min-h-screen font-sans flex flex-col justify-between">
      <LandingHeader />
      <main className="mx-auto w-full p-4 md:p-8 flex items-center justify-center flex-1">
        <div className="border border-border w-full grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl min-h-[600px]">
          <section
            aria-label="About signing in"
            className="relative bg-gradient-to-br from-[#2a4d46] via-[#23433e] to-[#122825] p-8 md:p-12 hidden md:flex flex-col justify-between rounded-br-[80px]"
          >
            <div>
              <p className="text-sm font-semibold tracking-wider text-slate-200 mb-10">Agapay</p>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-white mb-6">
                Welcome
                <br />
                back
              </h1>
              <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-sm">
                Log in to track donations, review requests, and see the impact of every relief pack.
              </p>
            </div>

            <div className="mt-12 space-y-4">
              <div className="border-t border-white/10 pt-4 flex items-center gap-3 text-xs md:text-sm text-slate-200">
                <svg
                  className="w-4 h-4 shrink-0 text-teal-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Verified needs, geo-located by local leaders</span>
              </div>
              <div className="border-t border-white/10 pt-4 flex items-center gap-3 text-xs md:text-sm text-slate-200">
                <svg
                  className="w-4 h-4 shrink-0 text-teal-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Real-time distribution tracking</span>
              </div>
              <div className="border-t border-white/10 pt-4 flex items-center gap-3 text-xs md:text-sm text-slate-200">
                <svg
                  className="w-4 h-4 shrink-0 text-teal-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                <span>Every gift reaches a family</span>
              </div>
            </div>
          </section>

          <section
            aria-label="Sign in form"
            className="p-8 md:p-12 flex flex-col justify-center max-w-md mx-auto w-full"
          >
            <div className="mb-6">
              <h2 className="text-3xl font-bold mb-2">Log in</h2>
              <p className="text-xs text-slate-500">Log in to continue to your dashboard.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-medium">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Mail size={16} />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={error === null ? undefined : 'login-error'}
                    className="w-full bg-transparent border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-4 text-sm placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-xs font-medium">
                  Password
                </label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock size={16} />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={error === null ? undefined : 'login-error'}
                    className="w-full bg-transparent border border-slate-700/80 rounded-xl py-2.5 pl-10 pr-10 text-sm placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 flex items-center cursor-pointer"
                  >
                    {showPassword ? <EyeClosed size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                {error === null ? null : (
                  <p id="login-error" role="alert" className="text-xs font-medium text-red-400">
                    {error}
                  </p>
                )}

                <Link
                  to="/forgot-password"
                  className="text-teal-700 hover:text-teal-500 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#3d6e70] hover:bg-[#498285] text-white font-medium py-3 px-6 rounded-full flex items-center justify-between transition-all mt-4 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <div className="flex items-center justify-center gap-2 w-full">
                    <span>Signing in</span>
                    <LoaderCircle className="animate-[spin_1s_ease-in-out_infinite]" size={16} />
                  </div>
                ) : (
                  <>
                    <span>Log In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="mt-8 text-center space-y-2 text-xs">
                <p className="text-slate-400">
                  New to Agapay?{' '}
                  <Link to="/register" className="text-teal-600 hover:text-teal-400 underline">
                    Create an account
                  </Link>
                </p>
                <p className="text-slate-400">
                  Agapay staff?{' '}
                  <Link to="/admin-login" className="text-teal-600 hover:text-teal-400 underline">
                    Admin log in
                  </Link>
                </p>
              </div>
            </form>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
