import type { ComponentProps } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'end',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-50 w-96 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-surface text-text shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
