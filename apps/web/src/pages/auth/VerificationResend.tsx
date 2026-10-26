import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resendVerificationSchema, type ResendVerificationInput } from '@agapay/shared';
import { toast } from 'sonner';
import { resendVerification } from '../../lib/auth-api';
import { Field, FieldGroup } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/Button';

export function VerificationResend({ email = '' }: { email?: string }) {
  const inFlight = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email },
  });
  async function submit(input: ResendVerificationInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await resendVerification(input.email);
      toast.success('If the account still needs verification, a new email is queued.');
    } catch {
      toast.error('Could not request another email. Wait and try again.');
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <form
      className="mt-6"
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      aria-busy={isSubmitting}
    >
      <fieldset disabled={isSubmitting}>
        <FieldGroup>
          <p className="text-sm text-text-muted">
            Check your email address and Spam folder. Delivery may be delayed; you can request
            another confirmation link.
          </p>
          <Field control={control} name="email" label="Email address for verification">
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
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {isSubmitting ? 'Requesting…' : 'Resend verification'}
          </Button>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
