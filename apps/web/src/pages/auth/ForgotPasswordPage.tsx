import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@agapay/shared';
import { toast } from 'sonner';
import { forgotPassword } from '../../lib/auth-api';
import { Button } from '../../components/ui/Button';
import { Field, FieldGroup } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { RecoveryLayout } from './RecoveryLayout';

export function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  async function submit(values: ForgotPasswordInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await forgotPassword(values.email);
      setDone(true);
    } catch {
      toast.error('Could not request a reset link. Wait and try again.');
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <RecoveryLayout>
      <h1 className="font-display text-2xl font-bold tracking-tight">Forgot password</h1>
      {done ? (
        <div className="mt-4 flex flex-col gap-3">
          <p role="status">
            If an eligible account uses that address, a reset link is on its way. Check your inbox
            and Spam folder.
          </p>
          <p className="text-sm text-text-muted">
            Delivery may be delayed. If this is a personnel invitation, ask an administrator to
            regenerate the link or QR code.
          </p>
        </div>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => void handleSubmit(submit)(event)}
          noValidate
          aria-busy={isSubmitting}
        >
          <fieldset disabled={isSubmitting}>
            <FieldGroup>
              <Field control={control} name="email" label="Email Address">
                {(field) => (
                  <Input
                    id={field.id}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={typeof field.value === 'string' ? field.value : ''}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    aria-invalid={field.invalid}
                    aria-describedby={field.describedBy}
                  />
                )}
              </Field>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </FieldGroup>
          </fieldset>
        </form>
      )}
      <p className="mt-6 text-sm text-text-muted">
        Remembered it?{' '}
        <Link to="/login" className="text-primary underline underline-offset-4">
          Log In
        </Link>
      </p>
    </RecoveryLayout>
  );
}
