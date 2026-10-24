import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-error-text',
        className,
      )}
      {...props}
    />
  );
}
