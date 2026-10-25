import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@agapay/shared';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { ApiClientError } from '../../lib/api-client';
import { login } from '../../lib/auth-api';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/Button';
import { Field, FieldGroup } from '../../components/ui/field';
import { Spinner } from '../../components/ui/spinner';
import { AuthLayout } from './AuthLayout';
import { PasswordInput } from './PasswordInput';

export function LoginPage() {
  const navigate = useNavigate();
  const inFlight = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginInput): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const user = await login(values.email, values.password);
      toast.success('Signed in.');
      await navigate(user.role === 'DONOR' ? '/donor' : '/admin', { replace: true });
    } catch (err) {
      toast.error(
        err instanceof ApiClientError && err.status === 401
          ? 'Email or password is incorrect.'
          : err instanceof ApiClientError && err.status === 429
            ? 'Too many sign-in attempts. Please wait and try again.'
            : 'We could not sign you in. Please try again.',
      );
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <AuthLayout>
      <h1 id="login-heading" className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Log in
      </h1>
      <p className="mt-3 text-base text-text-muted">
        Welcome back. Continue to your Agapay dashboard.
      </p>
      <form
        aria-labelledby="login-heading"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="mt-8"
        noValidate
        aria-busy={isSubmitting}
      >
        <fieldset disabled={isSubmitting}>
          <FieldGroup className="gap-5">
            <Field control={control} name="email" label="Email address">
              {(field) => (
                <Input
                  id={field.id}
                  type="email"
                  autoComplete="username"
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
            <Field control={control} name="password" label="Password">
              {(field) => (
                <PasswordInput
                  id={field.id}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                  disabled={isSubmitting}
                />
              )}
            </Field>
            <Link
              to="/forgot-password"
              className="inline-flex min-h-11 w-fit items-center justify-self-end text-sm text-primary underline underline-offset-4"
            >
              Forgot password?
            </Link>
            <Button
              type="submit"
              size="lg"
              className="w-full justify-between"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              <span>{isSubmitting ? 'Signing in…' : 'Log In'}</span>
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
        New to Agapay?{' '}
        <Link to="/register" className="font-semibold text-primary underline underline-offset-4">
          Create an account
        </Link>
      </p>
      <p className="mt-3 text-sm text-text-muted">Donors and personnel use the same sign-in.</p>
    </AuthLayout>
  );
}
