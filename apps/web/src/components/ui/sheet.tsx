import type { ComponentProps } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const sheetVariants = cva(
  'fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[90vw] flex-col border-r shadow-lg',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-text',
        navigation: 'border-primary-subtle bg-primary-subtle text-surface',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function SheetContent({
  className,
  children,
  variant,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-text/40" />
      <DialogPrimitive.Content className={cn(sheetVariants({ variant }), className)} {...props}>
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            variant={variant === 'navigation' ? 'sidebar' : 'ghost'}
            size="icon"
            className="absolute right-2 top-2"
            aria-label="Close menu"
          >
            <X aria-hidden="true" data-icon="inline-start" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
