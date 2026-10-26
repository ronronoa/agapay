import { Outlet } from 'react-router-dom';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';

export function PublicCampaignLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:rounded-md focus:bg-surface focus:p-3 focus:text-primary"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  );
}
