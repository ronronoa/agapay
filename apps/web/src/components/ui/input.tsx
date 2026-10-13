import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'w-full rounded-md border border-input bg-surface px-3 py-2 text-sm',
        className,
      )}
      {...rest}
    />
  );
}
