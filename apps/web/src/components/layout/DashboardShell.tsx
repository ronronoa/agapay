import { NavLink, Outlet } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';

export interface DashboardNavItem {
  to: string;
  label: string;
  end?: boolean;
}

interface DashboardShellProps {
  items: readonly DashboardNavItem[];
  children?: ReactNode;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function DashboardShell({ items, children }: DashboardShellProps) {
  const user = useSyncExternalStore(subscribe, getUser, getUser);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
      >
        Skip to content
      </a>

      <aside className="flex w-56 shrink-0 flex-col bg-primary-subtle text-surface">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold"
          >
            {user === null ? 'A' : initialsOf(user.name)}
          </span>
          <div>
            <p className="text-base font-semibold leading-tight">Agapay</p>
            <p className="text-xs text-white/70">
              {user === null ? '' : user.role === 'DONOR' ? 'Donor' : 'Admin'}
            </p>
          </div>
        </div>

        <nav aria-label="Dashboard" className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              {...(item.end === true ? { end: true as const } : {})}
              className={({ isActive }) =>
                isActive
                  ? 'rounded-md bg-white/15 px-4 py-2.5 text-sm font-medium'
                  : 'rounded-md px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/20"
          >
            Log Out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
            <div className="flex min-w-52 flex-1 items-center gap-2">
              <input
                type="search"
                placeholder="Search…"
                disabled
                aria-disabled="true"
                title="Dashboard search arrives in a later release"
                className="w-full max-w-md rounded-md border border-border-strong bg-surface px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Printing arrives in a later release"
                className="hidden rounded-md border border-border-strong px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
              >
                Print report
              </button>
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Updates arrive by email for now"
                aria-label="Alerts, updates arrive by email for now"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
              </button>
            </div>
            {user === null ? null : (
              <div className="ml-auto flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-surface"
                >
                  {initialsOf(user.name)}
                </span>
                <div>
                  <p className="text-sm font-medium leading-tight">{user.name}</p>
                  <p className="text-xs text-text-muted">
                    {user.role === 'DONOR'
                      ? user.emailVerified
                        ? 'Verified Donor'
                        : 'Donor'
                      : 'Operations'}
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className="mx-auto w-full max-w-6xl px-4 pb-2 text-xs text-text-muted">
            Dashboard search, alerts, and printing arrive in a later release.
          </p>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
