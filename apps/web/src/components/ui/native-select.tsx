import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          'min-h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-surface py-2 pl-3 pr-9 text-sm text-text disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-error-text',
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
