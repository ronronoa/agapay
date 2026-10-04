import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'accent';
type Size = 'md' | 'lg';

// Accent uses charcoal text: white on #F97352 is 2.76:1 and fails WCAG AA.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-surface hover:bg-primary-dark',
  accent: 'bg-accent text-text hover:bg-accent-hover',
};

const SIZES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
