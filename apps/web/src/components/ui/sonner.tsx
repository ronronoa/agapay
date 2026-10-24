import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

const toastStyle: CSSProperties & Record<string, string> = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-text)',
  '--normal-border': 'var(--color-border)',
  '--success-bg': 'var(--color-success-bg)',
  '--success-text': 'var(--color-success-text)',
  '--success-border': 'var(--color-success-text)',
  '--error-bg': 'var(--color-error-bg)',
  '--error-text': 'var(--color-error-text)',
  '--error-border': 'var(--color-error-text)',
  '--warning-bg': 'var(--color-warning-bg)',
  '--warning-text': 'var(--color-warning-text)',
  '--warning-border': 'var(--color-warning-text)',
  '--info-bg': 'var(--color-info-bg)',
  '--info-text': 'var(--color-primary-dark)',
  '--info-border': 'var(--color-primary-subtle)',
};

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      richColors
      className="font-sans"
      style={toastStyle}
    />
  );
}
