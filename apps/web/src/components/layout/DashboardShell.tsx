import { NavLink, Outlet, useMatches, useLocation, matchPath } from 'react-router-dom';
import { useSyncExternalStore, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, ChevronDown, LogOut, Menu, Printer, Search, type LucideIcon } from 'lucide-react';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';
import { Dialog, DialogTitle } from '../ui/dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export interface DashboardNavItem {
  to: string;
  label: string;
  icon?: LucideIcon | undefined;
  end?: boolean | undefined;
  badge?: number | undefined;
  section?: string | undefined;
  // Omitted = every signed-in role. Set to hide sections a role may not open,
  // so the nav never offers a link that ends at the forbidden page.
  roles?: readonly string[] | undefined;
}

interface DashboardShellProps {
  items: readonly DashboardNavItem[];
  children?: ReactNode;
}

// A route can put a title in the shell header through its `handle`.
interface ShellHandle {
  shellTitle?: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function roleLabel(role: string, emailVerified: boolean): string {
  if (role === 'DONOR') return emailVerified ? 'Verified Donor' : 'Donor';
  if (role === 'ADMIN') return 'Admin';
  return 'Operations';
}

function navClass(isActive: boolean): string {
  return isActive
    ? 'flex min-h-[44px] items-center gap-3 rounded-md bg-white/15 px-3 py-2.5 text-sm font-medium'
    : 'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white';
}

interface SidebarBodyProps {
  items: readonly DashboardNavItem[];
  user: ReturnType<typeof getUser>;
  onNavigate?: (() => void) | undefined;
  onLogoutRequest: () => void;
}

function SidebarBody({ items, user, onNavigate, onLogoutRequest }: SidebarBodyProps) {
  const { pathname } = useLocation();
  const closeProps = onNavigate === undefined ? {} : { onClick: onNavigate };
  const groups = new Map<string, DashboardNavItem[]>();
  for (const item of items) {
    if (item.roles !== undefined && (user === null || !item.roles.includes(user.role))) continue;
    const section = item.section ?? '';
    const group = groups.get(section) ?? [];
    group.push(item);
    groups.set(section, group);
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-5 py-5">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold"
        >
          {user === null ? 'A' : initialsOf(user.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">Agapay</p>
          <p className="truncate text-xs text-white/70">
            {user === null ? '' : roleLabel(user.role, user.emailVerified)}
          </p>
        </div>
      </div>

      <nav
        aria-label="Dashboard"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-3"
      >
        {[...groups].map(([section, group]) => {
          const links = (
            <div className="space-y-1">
              {group.map((item) => {
                const Icon: LucideIcon | undefined = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    {...(item.end === true ? { end: true as const } : {})}
                    {...closeProps}
                    className={({ isActive }) => navClass(isActive)}
                  >
                    {Icon === undefined ? null : (
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{item.label}</span>
                    {item.badge === undefined ? null : (
                      <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
          if (section === 'Administration') {
            const active = group.some(
              (item) => matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null,
            );
            // Reopen on route changes even if the native disclosure was manually closed.
            return (
              <details
                key={active ? `${section}:${pathname}` : section}
                open={active || undefined}
                className="group"
              >
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-semibold text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden">
                  {section}
                  <ChevronDown className="h-4 w-4 group-open:rotate-180" aria-hidden="true" />
                </summary>
                {links}
              </details>
            );
          }
          return (
            <div key={section}>
              {section && (
                <h2 className="mb-1 px-3 text-xs font-semibold text-white/90">{section}</h2>
              )}
              {links}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onLogoutRequest}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/20"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log Out
        </button>
      </div>
    </>
  );
}

function shellTitle(): string | undefined {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const handle: ShellHandle | undefined =
    last === undefined || last.handle === undefined ? undefined : (last.handle as ShellHandle);
  return handle?.shellTitle;
}

export function DashboardShell({ items, children }: DashboardShellProps) {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const title = shellTitle();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-primary-subtle text-surface md:flex">
        <SidebarBody items={items} user={user} onLogoutRequest={() => setConfirmingLogout(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-text hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            {title === undefined ? (
              <div className="relative hidden w-full max-w-md sm:block">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  placeholder="Search…"
                  disabled
                  aria-disabled="true"
                  title="Dashboard search arrives in a later release"
                  className="w-full rounded-full border border-border-strong bg-surface py-2 pl-9 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            ) : (
              <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold tracking-tight">
                {title}
              </h1>
            )}

            {title === undefined ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Printing arrives in a later release"
                className="hidden h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print report
              </button>
            ) : null}

            <button
              type="button"
              disabled
              aria-disabled="true"
              title="Updates arrive by email for now"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              Alerts
            </button>

            {user === null ? null : (
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-4">
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-surface"
                >
                  {initialsOf(user.name)}
                </span>
                <p className="hidden text-sm font-medium sm:block">
                  {user.name} <span className="font-normal text-text-muted">·</span>{' '}
                  <span className="text-text-muted">
                    {roleLabel(user.role, user.emailVerified)}
                  </span>
                </p>
              </div>
            )}
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {children ?? <Outlet />}
        </main>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <div className="-mx-2 flex h-[65dvh] max-h-[40rem] min-h-0 flex-col rounded-md bg-primary-subtle text-surface">
          <SidebarBody
            items={items}
            user={user}
            onNavigate={() => setMenuOpen(false)}
            onLogoutRequest={() => setConfirmingLogout(true)}
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmingLogout}
        title="Log out?"
        description="You will need to sign in again to reach your dashboard."
        confirmLabel="Log out"
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
