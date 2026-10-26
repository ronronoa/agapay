import type { ComponentProps, ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Label } from './label';
import { cn } from '../../lib/utils';

export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />;
}

// Keep the existing controlled Field API intact while supporting composed forms.
export function FieldLayout({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col gap-2', className)} {...props} />;
}

export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return (
    <fieldset
      className={cn('flex min-w-0 flex-col gap-4 rounded-md border border-border p-4', className)}
      {...props}
    />
  );
}

export function FieldLegend({ className, ...props }: ComponentProps<'legend'>) {
  return <legend className={cn('px-1 text-sm font-medium', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-xs text-text-muted', className)} {...props} />;
}

interface FieldProps<T extends FieldValues> {
  id?: string;
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  error?: string;
  children: (field: {
    id: string;
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    invalid: boolean;
    describedBy: string | undefined;
  }) => ReactNode;
  className?: string;
}

export function Field<T extends FieldValues>({
  id: suppliedId,
  control,
  name,
  label,
  hint,
  error,
  children,
  className,
}: FieldProps<T>) {
  const id = suppliedId ?? `field-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const message = error ?? fieldState.error?.message;
        const describedBy =
          [message !== undefined ? errorId : null, hint === undefined ? null : hintId]
            .filter((part) => part !== null)
            .join(' ') || undefined;
        return (
          <div className={className}>
            <Label htmlFor={id}>{label}</Label>
            <div className="mt-1">
              {children({
                id,
                value: field.value,
                onChange: (value: unknown) => field.onChange(value),
                onBlur: field.onBlur,
                invalid: message !== undefined,
                describedBy,
              })}
            </div>
            {hint === undefined ? null : (
              <p id={hintId} className="mt-1 text-xs text-text-muted">
                {hint}
              </p>
            )}
            {message === undefined ? null : (
              <p id={errorId} role="alert" className="mt-1 text-sm text-error-text">
                {message}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
