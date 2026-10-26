import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from '@agapay/shared';
import { ArrowRight, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ApiClientError } from '../../lib/api-client';
import { register } from '../../lib/auth-api';
import { Field, FieldGroup, FieldLayout } from '../../components/ui/field';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Button, buttonVariants } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/spinner';
import { AuthLayout } from './AuthLayout';
import { PasswordInput } from './PasswordInput';
import { VerificationResend } from './VerificationResend';

export function RegisterPage() {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inFlight = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  useEffect(() => {
    if (confirmError && !isSubmitting) document.getElementById('confirmPassword')?.focus();
  }, [confirmError, isSubmitting]);

  async function onSubmit(values: RegisterInput): Promise<void> {
    if (inFlight.current) return;
    if (values.password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      return;
    }
    setConfirmError(null);
    inFlight.current = true;
    try {
      const response = await register(values);
      setDone(response.email);
      toast.success('Account created.');
    } catch (err) {
      toast.error(
        err instanceof ApiClientError && err.status === 429
          ? 'Too many registration attempts. Please wait and try again.'
          : 'Registration could not be completed. Try again, or sign in if you already have an account.',
      );
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <AuthLayout>
      {done === null ? (
        <>
          <h1
            id="register-heading"
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl"
          >
            Get started
          </h1>
          <p className="mt-3 text-base text-text-muted">
            Create a donor account to pledge relief goods and follow your donations.
          </p>
          <form
            aria-labelledby="register-heading"
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="mt-8"
            noValidate
            aria-busy={isSubmitting}
          >
            <fieldset disabled={isSubmitting}>
              <FieldGroup className="gap-4">
                <Field control={control} name="name" label="Full Name">
                  {(field) => (
                    <Input
                      id={field.id}
                      autoComplete="name"
                      placeholder="Your full name"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>
                <Field control={control} name="email" label="Email Address">
                  {(field) => (
                    <Input
                      id={field.id}
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                    />
                  )}
                </Field>
                <Field control={control} name="phone" label="Contact Number" hint="Optional">
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
                <Field
                  control={control}
                  name="password"
                  label="Password"
                  hint={`At least ${PASSWORD_MIN_LENGTH} characters. Avoid common passwords.`}
                >
                  {(field) => (
                    <PasswordInput
                      id={field.id}
                      autoComplete="new-password"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                      disabled={isSubmitting}
                    />
                  )}
                </Field>
                <FieldLayout data-invalid={confirmError !== null || undefined}>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <PasswordInput
                    id="confirmPassword"
                    revealLabel="password confirmation"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setConfirmError(null);
                    }}
                    aria-invalid={confirmError !== null}
                    aria-describedby={confirmError ? 'confirm-password-error' : undefined}
                    disabled={isSubmitting}
                  />
                  {confirmError && (
                    <p id="confirm-password-error" role="alert" className="text-sm text-error-text">
                      {confirmError}
                    </p>
                  )}
                </FieldLayout>
                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 w-full justify-between"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  <span>{isSubmitting ? 'Signing up…' : 'Sign Up'}</span>
                  {isSubmitting ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : (
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  )}
                </Button>
              </FieldGroup>
            </fieldset>
          </form>
          <p className="mt-7 text-sm text-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary underline underline-offset-4">
              Log In
            </Link>
          </p>
        </>
      ) : (
        <div>
          <MailCheck className="mb-6 size-10 text-primary" aria-hidden="true" />
          <h1 className="font-display text-4xl font-bold tracking-tight">Check your inbox</h1>
          <p className="mt-4 text-base leading-relaxed text-text-muted">
            Check <span className="break-all font-semibold text-text">{done}</span> for your
            confirmation link. Confirm your email before donating.
          </p>
          <VerificationResend email={done} />
          <Link
            to="/login"
            className={buttonVariants({ size: 'lg', className: 'mt-8 w-full justify-between' })}
          >
            Go to sign in
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
