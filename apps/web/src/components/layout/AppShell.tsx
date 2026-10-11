import { NavLink, Outlet } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';

const NAV_ITEMS = [
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/track', label: 'Track Assistance' },
] as const;

// Shown only to signed-in staff, so the public header stays unchanged for
// visitors and donors.
const ADMIN_NAV_ITEMS = [
  { to: '/admin/campaigns', label: 'Campaigns' },
  { to: '/admin/item-types', label: 'Item Types' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/audit-logs', label: 'Audit Log' },
] as const;

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'font-medium text-primary underline underline-offset-4'
    : 'text-text hover:text-primary';
}

export function AppShell() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const isStaff = user !== null && (user.role === 'ADMIN' || user.role === 'STAFF');

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

          {isStaff ? (
            <nav
              aria-label="Administration"
              className="flex flex-wrap items-center gap-x-5 gap-y-2"
            >
              {ADMIN_NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={navLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {user === null ? (
              <>
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
                <NavLink
                  to="/login"
                  className="inline-flex items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
                >
                  Sign in
                </NavLink>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-muted">{user.name}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex items-center justify-center rounded-md border border-border-strong px-4 py-2 text-sm font-medium hover:bg-surface-alt"
                >
                  Sign out
                </button>
              </div>
            )}
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
