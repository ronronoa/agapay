import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

const toastStyle: CSSProperties & Record<string, string> = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-text)',
  '--normal-border': 'var(--color-border)',
};

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      className="font-sans"
      style={toastStyle}
    />
  );
}
