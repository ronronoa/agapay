import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-surface hover:bg-primary-dark',
        accent: 'border border-gray-500 hover:bg-primary-dark hover:text-surface',
      },
      size: {
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  );
}
