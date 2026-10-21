import type { ComponentProps, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';

export function Dialog({
  open,
  onOpenChange,
  children,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  // Wide dialogs hold multi-column forms; default stays the compact dialog
  // every existing caller already uses.
  size?: 'md' | 'xl';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-text/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content forceMount asChild>
              <motion.div
                className={cn(
                  'fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-sm border border-border bg-surface p-6 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  size === 'xl' ? 'max-w-xl' : 'max-w-md',
                )}
                initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-50%' }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export function DialogTitle({ className, ...rest }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-lg font-semibold', className)}
      {...rest}
    />
  );
}

export function DialogDescription({
  className,
  ...rest
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-1 text-sm text-text-muted', className)}
      {...rest}
    />
  );
}

export function DialogFooter({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('mt-6 flex justify-end gap-3', className)} {...rest} />;
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}
