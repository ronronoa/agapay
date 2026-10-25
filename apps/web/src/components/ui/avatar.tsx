import type { ComponentProps } from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

const fallbackVariants = cva(
  'flex size-full items-center justify-center rounded-full text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-primary-subtle text-surface',
        sidebar: 'bg-white/15 text-surface',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function AvatarFallback({
  className,
  variant,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback> & VariantProps<typeof fallbackVariants>) {
  return (
    <AvatarPrimitive.Fallback className={cn(fallbackVariants({ variant }), className)} {...props} />
  );
}
