import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const alertVariants = cva('flex flex-col gap-1 rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-surface text-text',
      destructive: 'border-error-text bg-error-bg text-error-text',
      success: 'border-success-text bg-success-bg text-success-text',
      warning: 'border-warning-text bg-warning-bg text-warning-text',
      info: 'border-primary-subtle bg-info-bg text-primary-dark',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Alert({
  className,
  variant,
  role = 'alert',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role={role} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('font-medium', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-sm', className)} {...props} />;
}
