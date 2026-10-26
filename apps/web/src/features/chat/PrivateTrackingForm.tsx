import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  trackRequestSchema,
  type TrackRequestInput,
  type TrackRequestResponse,
} from '@agapay/shared';
import { toast } from 'sonner';
import { trackAssistanceRequest } from '../../lib/public-api';
import { Field, FieldGroup } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/Button';

/** This state is deliberately separate from useChat and never becomes a tool result. */
export function PrivateTrackingForm() {
  const [result, setResult] = useState<TrackRequestResponse['data'] | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TrackRequestInput>({
    resolver: zodResolver(trackRequestSchema),
    defaultValues: { code: '', email: '' },
  });
  async function submit(input: TrackRequestInput) {
    setResult(null);
    try {
      setResult(await trackAssistanceRequest(input));
    } catch {
      toast.error('No request could be shown. Check both details, or wait and try again.');
    }
  }
  return (
    <section
      aria-label="Private request tracking"
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <h3 className="font-medium">Private request tracking</h3>
      <p className="text-sm text-text-muted">
        These details and the result go only to Agapay, never to the AI provider.
      </p>
      <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
        <fieldset disabled={isSubmitting}>
          <FieldGroup>
            <Field
              id="assistant-track-code"
              control={control}
              name="code"
              label="Request or tracking code"
            >
              {(field) => (
                <Input
                  id={field.id}
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                  maxLength={30}
                />
              )}
            </Field>
            <Field id="assistant-track-email" control={control} name="email" label="Request email">
              {(field) => (
                <Input
                  id={field.id}
                  type="email"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={field.invalid}
                  aria-describedby={field.describedBy}
                  maxLength={254}
                />
              )}
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Checking…' : 'Check request'}
            </Button>
          </FieldGroup>
        </fieldset>
      </form>
      {result && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p className="font-medium">
            {result.campaign.name} · {result.status.replaceAll('_', ' ')}
          </p>
          <p>{result.statusMessage}</p>
          {result.distribution && (
            <p>
              {new Date(result.distribution.startAt).toLocaleString('en-PH', {
                timeZone: 'Asia/Manila',
              })}{' '}
              · {result.distribution.location}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
