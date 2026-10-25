import type { ComponentProps } from 'react';
import { MessageScroller as Primitive } from '@shadcn/react/message-scroller';
import { ArrowDown } from 'lucide-react';
import { buttonVariants } from './Button';
import { cn } from '../../lib/utils';

export const MessageScrollerProvider = Primitive.Provider;
export const MessageScrollerItem = Primitive.Item;
export { useMessageScrollerScrollable } from '@shadcn/react/message-scroller';
export function MessageScroller({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn('relative flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  );
}
export function MessageScrollerViewport({
  className,
  ...props
}: ComponentProps<typeof Primitive.Viewport>) {
  return (
    <Primitive.Viewport
      className={cn(
        'size-full min-h-0 overflow-y-auto overscroll-contain rounded-md p-2 focus-visible:outline-2 focus-visible:outline-primary',
        className,
      )}
      {...props}
    />
  );
}
export function MessageScrollerContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content className={cn('flex min-h-full flex-col gap-5', className)} {...props} />
  );
}
export function MessageScrollerButton() {
  return (
    <Primitive.Button
      aria-label="Jump to latest message"
      className={cn(
        buttonVariants({ variant: 'outline', size: 'icon' }),
        'absolute bottom-2 left-1/2 -translate-x-1/2 data-[active=false]:hidden',
      )}
    >
      <ArrowDown aria-hidden="true" />
    </Primitive.Button>
  );
}
