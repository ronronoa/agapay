import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { passwordSchema, resetPasswordSchema } from '@agapay/shared';
import { toast } from 'sonner';
import { ApiClientError } from '../../lib/api-client';
import { resetPassword } from '../../lib/auth-api';
import { Button, buttonVariants } from '../../components/ui/Button';
import { Field, FieldGroup } from '../../components/ui/field';
import { PasswordInput } from './PasswordInput';
import { RecoveryLayout } from './RecoveryLayout';

const formSchema = resetPasswordSchema
  .extend({ confirmPassword: passwordSchema })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const completeLink = resetPasswordSchema.shape.token.safeParse(token).success;
  const [done, setDone] = useState(false);
  const [unusable, setUnusable] = useState(false);
  const inFlight = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });
  async function submit(values: FormValues) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await resetPassword(values.token, values.password);
      setDone(true);
      toast.success('Password changed.');
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 409)) {
        setUnusable(true);
        toast.error('This password link is expired, already used, or no longer valid.');
      } else {
        toast.error('Could not change your password. Your entries are kept; please try again.');
      }
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <RecoveryLayout>
      <h1 className="font-display text-2xl font-bold tracking-tight">Set a new password</h1>
      {done ? (
        <div className="mt-4 flex flex-col items-start gap-4">
          <p role="status">Password changed. Sign in with your new password.</p>
          <Link className={buttonVariants()} to="/login">
            Go to sign in
          </Link>
        </div>
      ) : !completeLink || unusable ? (
        <div className="mt-4 flex flex-col items-start gap-4">
          <p>
            {!completeLink
              ? 'This reset link is incomplete.'
              : 'This password link cannot be used. Request a fresh reset link.'}
          </p>
          <Link className={buttonVariants({ variant: 'outline' })} to="/forgot-password">
            Request a new reset link
          </Link>
          <p className="text-sm text-text-muted">
            For a personnel invitation, ask an administrator to regenerate and share your invitation
            link or QR code.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-text-muted">
            Choose your password for account recovery or your personnel invitation.
          </p>
          <form
            className="mt-6"
            onSubmit={(event) => void handleSubmit(submit)(event)}
            noValidate
            aria-busy={isSubmitting}
          >
            <fieldset disabled={isSubmitting}>
              <FieldGroup>
                <Field
                  control={control}
                  name="password"
                  label="New Password"
                  hint="Use 10–128 characters. Avoid common passwords."
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
                      maxLength={128}
                    />
                  )}
                </Field>
                <Field control={control} name="confirmPassword" label="Confirm Password">
                  {(field) => (
                    <PasswordInput
                      id={field.id}
                      revealLabel="confirmation password"
                      autoComplete="new-password"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      aria-invalid={field.invalid}
                      aria-describedby={field.describedBy}
                      disabled={isSubmitting}
                      maxLength={128}
                    />
                  )}
                </Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Change password'}
                </Button>
              </FieldGroup>
            </fieldset>
          </form>
        </>
      )}
    </RecoveryLayout>
  );
}
