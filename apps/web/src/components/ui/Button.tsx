import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-surface hover:bg-primary-dark',
        accent: 'border border-border-strong bg-surface text-text hover:bg-surface-alt',
        outline: 'border border-border-strong bg-surface text-text hover:bg-surface-alt',
        ghost: 'text-text hover:bg-surface-alt',
        secondary: 'bg-surface-alt text-text hover:bg-border',
        sidebar: 'bg-white/10 text-surface hover:bg-white/20 focus-visible:outline-white',
      },
      size: {
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
        sm: 'px-3 py-2 text-sm',
        icon: 'size-11 p-0',
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
