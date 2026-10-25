import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Message({
  align = 'start',
  className,
  ...props
}: ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        'group/message flex items-end gap-2 data-[align=end]:flex-row-reverse',
        className,
      )}
      {...props}
    />
  );
}
export function MessageContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-content"
      className={cn('flex min-w-0 max-w-[85%] flex-col gap-2 sm:max-w-[75%]', className)}
      {...props}
    />
  );
}
export function MessageHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="message-header" className={cn('text-sm font-semibold', className)} {...props} />
  );
}
export function MessageFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="message-footer"
      className={cn('text-xs text-text-muted group-data-[align=end]/message:text-right', className)}
      {...props}
    />
  );
}
