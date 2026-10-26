import type { ReactNode } from 'react';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { LandingFooter } from '../../components/landing/LandingFooter';

/** Short recovery states still keep the footer at the bottom of the viewport. */
export function RecoveryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LandingHeader />
      <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">{children}</div>
      </main>
      <LandingFooter />
    </div>
  );
}
