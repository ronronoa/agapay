import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from '@agapay/shared';
import { ApiClientError } from '../../lib/api-client';
import { register } from '../../lib/auth-api';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Eye, EyeOff } from 'lucide-react';

export function RegisterPage() {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  function onSubmit(values: RegisterInput): void {
    setSubmitError(null);
    if (values.password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      return;
    }
    setConfirmError(null);
    void register(values)
      .then((res) => setDone(res.email))
      .catch((err: unknown) => {
        setSubmitError(
          err instanceof ApiClientError ? err.message : 'Registration failed. Please try again.',
        );
      });
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        <section
          aria-label="About joining Agapay"
          className="border border-border bg-surface p-8 shadow-card md:flex flex-col hidden"
        >
          <p className="text-lg font-semibold">Agapay</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Join Agapay</h1>
          <p className="mt-2 text-sm text-text-muted">
            Create an account to start your impactful journey. Choose your role and get started in
            minutes.
          </p>
          <div className="mt-6 aspect-[4/3] w-full overflow-hidden rounded-lg">
            <img
              src="/images/relief-distribution.png"
              alt="Volunteers packing donated relief goods"
              className="h-full w-full object-cover"
            />
          </div>
        </section>

        <section
          aria-label="Donor registration form"
          className="border border-border bg-surface p-8 shadow-card"
        >
          {done === null ? (
            <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
              <h2 className="font-display text-2xl font-bold tracking-tight">Get started</h2>
              <p className="mt-1 text-sm text-text-muted">
                Join Agapay to start your impactful journey.
              </p>

              <div
                role="group"
                aria-label="Choose a role"
                className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border p-1"
              >
                <span
                  aria-current="true"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-surface px-4 py-2 text-sm font-semibold shadow-sm"
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

              <Field control={control} name="name" label="Full Name" className="mt-4">
                {(field) => (
                  <Input
                    id={field.id}
                    autoComplete="name"
                    placeholder="Juan Dela Cruz"
                    value={typeof field.value === 'string' ? field.value : ''}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    aria-invalid={field.invalid}
                    aria-describedby={field.describedBy}
                    className=""
                  />
                )}
              </Field>

              <Field control={control} name="email" label="Email Address" className="mt-4">
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
                  />
                )}
              </Field>

              <Field
                control={control}
                name="phone"
                label="Contact Number"
                hint="Optional"
                className="mt-4"
              >
                {(field) => (
                  <Input
                    id={field.id}
                    type="tel"
                    autoComplete="tel"
                    placeholder="09171234567"
                    value={typeof field.value === 'string' ? field.value : ''}
                    onChange={(event) =>
                      field.onChange(event.target.value === '' ? undefined : event.target.value)
                    }
                    onBlur={field.onBlur}
                    aria-invalid={field.invalid}
                    aria-describedby={field.describedBy}
                  />
                )}
              </Field>

              <Field control={control} name="password" label="Password" className="mt-4">
                {(field) => (
                  <Input
                    id={field.id}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={typeof field.value === 'string' ? field.value : ''}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    aria-invalid={field.invalid}
                    aria-describedby={field.describedBy}
                  />
                )}
              </Field>
              <p className="mt-1 text-xs text-text-muted">
                At least {PASSWORD_MIN_LENGTH} characters. Avoid common passwords.
              </p>

              <div className="mt-4">
                <label htmlFor="confirmPassword" className="block text-sm font-medium">
                  Confirm Password
                </label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setConfirmError(null);
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                    className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {confirmError === null ? null : (
                  <p role="alert" className="mt-1 text-sm text-text-muted">
                    {confirmError}
                  </p>
                )}
              </div>

              {submitError === null ? null : (
                <p role="alert" className="mt-4 text-sm font-medium">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Signing up…' : 'Sign Up'}
              </button>
              <p className="mt-3 text-center text-sm text-text-muted">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-primary underline underline-offset-4">
                  Log In
                </Link>
              </p>
            </form>
          ) : (
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Check your inbox</h2>
              <p className="mt-1 text-sm text-text-muted">
                We sent a confirmation link to {done}. Confirm your email, then sign in to donate.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
              >
                Go to sign in
              </Link>
            </div>
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
