import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Bubble({
  align = 'start',
  className,
  ...props
}: ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return (
    <div
      data-slot="bubble"
      data-align={align}
      className={cn(
        'rounded-xl bg-bg p-4 data-[align=start]:rounded-bl-sm data-[align=end]:rounded-br-sm data-[align=end]:bg-surface-alt',
        className,
      )}
      {...props}
    />
  );
}
export function BubbleContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="bubble-content"
      className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere]', className)}
      {...props}
    />
  );
}
