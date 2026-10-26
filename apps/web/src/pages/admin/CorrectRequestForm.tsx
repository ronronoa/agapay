import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  correctRequestSchema,
  type CorrectRequestInput,
  type AssistanceRequestDto,
} from '@agapay/shared';
import { Button } from '../../components/ui/Button';
import { DialogFooter } from '../../components/ui/dialog';
import { Field, FieldGroup } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';

export function CorrectRequestForm({
  request,
  pending,
  onSave,
  onBack,
}: {
  request: AssistanceRequestDto;
  pending: boolean;
  onSave: (input: CorrectRequestInput) => void;
  onBack: () => void;
}) {
  const { control, handleSubmit, formState } = useForm<CorrectRequestInput>({
    resolver: zodResolver(correctRequestSchema),
    defaultValues: {
      fullName: request.fullName,
      contactNumber: request.contactNumber,
      barangay: request.barangay,
      city: request.city,
      province: request.province,
      householdSize: request.householdSize,
      expectedUpdatedAt: request.updatedAt ?? '',
      reason: '',
    },
  });
  return (
    <form
      className="mt-4"
      onSubmit={(event) => {
        void handleSubmit(onSave)(event);
      }}
    >
      <p className="mb-4 text-sm text-text-muted">
        Confirm these corrections with the beneficiary. Email, campaign, and requested goods stay
        fixed. Location and household limits will be checked again. The reason is visible to
        personnel only.
      </p>
      <FieldGroup>
        {(
          [
            ['fullName', 'Full name'],
            ['contactNumber', 'Contact number'],
            ['barangay', 'Barangay'],
            ['city', 'City / municipality'],
            ['province', 'Province'],
          ] as const
        ).map(([name, label]) => (
          <Field key={name} control={control} name={name} label={label}>
            {(field) => (
              <Input
                id={field.id}
                value={typeof field.value === 'string' ? field.value : ''}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                aria-invalid={field.invalid}
                aria-describedby={field.describedBy}
                disabled={pending}
                type={name === 'contactNumber' ? 'tel' : 'text'}
                maxLength={name === 'contactNumber' ? 11 : 120}
              />
            )}
          </Field>
        ))}
        <Field
          control={control}
          name="householdSize"
          label="Household size"
          hint="Leave blank if unknown; limits then use one household member."
        >
          {(field) => (
            <Input
              id={field.id}
              type="number"
              min={1}
              max={30}
              value={typeof field.value === 'number' ? field.value : ''}
              onChange={(event) =>
                field.onChange(event.target.value === '' ? null : event.target.valueAsNumber)
              }
              onBlur={field.onBlur}
              aria-invalid={field.invalid}
              aria-describedby={field.describedBy}
              disabled={pending}
            />
          )}
        </Field>
        <Field control={control} name="reason" label="Reason for correction">
          {(field) => (
            <Textarea
              id={field.id}
              value={typeof field.value === 'string' ? field.value : ''}
              onChange={(event) => field.onChange(event.target.value)}
              onBlur={field.onBlur}
              aria-invalid={field.invalid}
              aria-describedby={field.describedBy}
              maxLength={1000}
              disabled={pending}
            />
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="accent" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button
          type="submit"
          disabled={pending || formState.isSubmitting || !formState.isDirty || !request.updatedAt}
        >
          {pending ? 'Saving corrections…' : 'Save corrections'}
        </Button>
      </DialogFooter>
    </form>
  );
}
