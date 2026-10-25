import { hasRole } from '@agapay/shared';
import { NavLink, Outlet } from 'react-router-dom';
import { useState, useSyncExternalStore } from 'react';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const NAV_ITEMS = [
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/track', label: 'Track Assistance' },
] as const;

// Shown only to signed-in staff, so the public header stays unchanged for
// visitors and donors. Items with roles stay invisible to roles that may not
// open them (Users is ADMIN-only), matching the sidebar behaviour.
interface AdminNavItem {
  to: string;
  label: string;
  roles?: readonly string[] | undefined;
}

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/admin/campaigns', label: 'Campaigns' },
  { to: '/admin/donations', label: 'Donations' },
  { to: '/admin/requests', label: 'Requests' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/item-types', label: 'Item Types' },
  { to: '/admin/users', label: 'Users', roles: ['ADMIN'] },
  { to: '/admin/audit-logs', label: 'Audit Log' },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'font-medium text-primary underline underline-offset-4'
    : 'text-text hover:text-primary';
}

export function AppShell() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const isStaff = user !== null && hasRole(user.role, ['ADMIN', 'STAFF']);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

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
              {ADMIN_NAV_ITEMS.filter(
                (item) =>
                  item.roles === undefined || (user !== null && hasRole(user.role, item.roles)),
              ).map((item) => (
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
                  to="/campaigns"
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
                  onClick={() => setConfirmingLogout(true)}
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

      <ConfirmDialog
        open={confirmingLogout}
        title="Sign out?"
        description="You will need to sign in again to continue."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() => {
          setConfirmingLogout(false);
          void logout();
        }}
      />
    </div>
  );
}
