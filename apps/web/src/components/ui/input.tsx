import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'min-h-11 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-error-text',
        className,
      )}
      {...rest}
    />
  );
}
