import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Label } from './label';

interface FieldProps<T extends FieldValues> {
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
  control,
  name,
  label,
  hint,
  error,
  children,
  className,
}: FieldProps<T>) {
  const id = `field-${name}`;
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
              <p id={errorId} role="alert" className="mt-1 text-sm text-text-muted">
                {message}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
