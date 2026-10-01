import { NavLink, Outlet } from 'react-router-dom';

// Every entry resolves to a real route; unbuilt ones render NotImplementedPage
// rather than a dead 404 (hard rule 11).
const NAV_ITEMS = [
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/track', label: 'Track Assistance' },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'font-medium text-primary underline underline-offset-4'
    : 'text-text hover:text-primary';
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <NavLink to="/" className="text-lg font-semibold text-primary">
            Agapay
          </NavLink>

          <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <NavLink
              to="/request-assistance"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Request Assistance
            </NavLink>
            <NavLink
              to="/donate"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-text hover:bg-accent-hover"
            >
              Donate
            </NavLink>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-text-muted">
          <p>Agapay — calamity relief donation and distribution.</p>
          {/* TODO(owner): add the real privacy notice and legal text. Nothing
              unverifiable is published here on purpose (hard rule 12). */}
        </div>
      </footer>
    </div>
  );
}
