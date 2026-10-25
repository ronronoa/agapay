import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Marker({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="marker"
      className={cn(
        'flex items-center gap-3 py-2 text-center text-xs font-medium text-text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border',
        className,
      )}
      {...props}
    />
  );
}
export function MarkerContent(props: ComponentProps<'span'>) {
  return <span data-slot="marker-content" {...props} />;
}
