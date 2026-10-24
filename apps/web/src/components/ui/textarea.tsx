import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={1}
      placeholder="Type your message..."
      className={cn(
        'w-full min-h-10 max-h-48 field-sizing-content resize-none',
        'rounded-md border border-input bg-surface',
        'px-3 py-2.5 text-sm leading-5 text-text',
        'placeholder:text-text-muted',
        'overflow-y-auto',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-error-text',
        className,
      )}
      {...props}
    />
  );
}
