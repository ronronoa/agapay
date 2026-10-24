import { Link, NavLink, Outlet, useMatches, useLocation, matchPath } from 'react-router-dom';
import { useSyncExternalStore, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChartNoAxesCombined,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { NotificationBell } from '../../features/support/NotificationBell';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Button, buttonVariants } from '../ui/Button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '../ui/sheet';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

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
  loggingOut?: boolean;
}

function SidebarBody({
  items,
  user,
  onNavigate,
  onLogoutRequest,
  loggingOut = false,
}: SidebarBodyProps) {
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
        <Avatar aria-hidden="true" className="size-10">
          <AvatarFallback variant="sidebar">
            {user === null ? 'A' : initialsOf(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">Agapay</p>
          <p className="truncate text-xs text-white/70">
            {user === null ? '' : roleLabel(user.role, user.emailVerified)}
          </p>
        </div>
      </div>

      <nav
        aria-label="Dashboard"
        className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-3"
      >
        {[...groups].map(([section, group]) => {
          const links = (
            <div className="flex flex-col gap-1">
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
        <Button
          variant="sidebar"
          className="w-full"
          disabled={loggingOut}
          onClick={onLogoutRequest}
        >
          <LogOut data-icon="inline-start" aria-hidden="true" />
          Log Out
        </Button>
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
  const [loggingOut, setLoggingOut] = useState(false);
  const { pathname } = useLocation();
  const messagesLayout = ['/admin/messages', '/donor/messages'].some(
    (path) => matchPath({ path, end: true }, pathname) !== null,
  );
  const personnel = user?.role === 'ADMIN' || user?.role === 'STAFF';
  const section =
    items
      .toSorted((a, b) => b.to.length - a.to.length)
      .find(
        (item) =>
          (item.roles === undefined || (user !== null && item.roles.includes(user.role))) &&
          matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null,
      )?.label ?? (pathname === '/donate' ? 'Donate goods' : 'Agapay');
  const requestLogout = () => {
    setMenuOpen(false);
    setConfirmingLogout(true);
  };
  async function confirmLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out on this device.');
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  }

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <div className={cn('flex min-h-dvh bg-bg', messagesLayout && 'h-dvh overflow-hidden')}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-primary"
        >
          Skip to content
        </a>

        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-primary-subtle text-surface md:flex">
          <SidebarBody
            items={items}
            user={user}
            onLogoutRequest={requestLogout}
            loggingOut={loggingOut}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border bg-surface">
            <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Open menu"
                  aria-expanded={menuOpen}
                  className="md:hidden"
                >
                  <Menu data-icon="inline-start" aria-hidden="true" />
                </Button>
              </SheetTrigger>

              {title === undefined ? (
                <p
                  className="min-w-0 flex-1 truncate font-display text-sm font-semibold"
                  title={section}
                >
                  {section}
                </p>
              ) : (
                <h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold tracking-tight">
                  {title}
                </h1>
              )}

              {personnel && (
                <Link
                  to="/admin/reports"
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'hidden rounded-full sm:inline-flex',
                  )}
                >
                  <ChartNoAxesCombined data-icon="inline-start" aria-hidden="true" />
                  Reports
                </Link>
              )}

              <NotificationBell />

              {user === null ? null : (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="min-w-11 rounded-full px-1 sm:pr-3"
                      aria-label={`Account menu for ${user.name}`}
                    >
                      <Avatar aria-hidden="true">
                        <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="hidden max-w-36 truncate sm:block">{user.name}</span>
                      <ChevronDown
                        className="hidden sm:block"
                        aria-hidden="true"
                        data-icon="inline-end"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    onCloseAutoFocus={(event) => {
                      if (confirmingLogout) event.preventDefault();
                    }}
                  >
                    <DropdownMenuLabel>
                      <p className="max-w-56 truncate font-medium">{user.name}</p>
                      <p className="text-xs text-text-muted">
                        {roleLabel(user.role, user.emailVerified)}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link to={personnel ? '/admin' : '/donor'}>
                          <LayoutDashboard aria-hidden="true" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      {user.role !== 'STAFF' && (
                        <DropdownMenuItem asChild>
                          <Link to={user.role === 'DONOR' ? '/donor/settings' : '/admin/settings'}>
                            <Settings aria-hidden="true" />
                            Settings
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {personnel && (
                        <DropdownMenuItem asChild>
                          <Link to="/admin/reports">
                            <ChartNoAxesCombined aria-hidden="true" />
                            Reports
                          </Link>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem disabled={loggingOut} onSelect={requestLogout}>
                        <LogOut aria-hidden="true" />
                        Log out
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          <main
            id="main"
            className={cn(
              messagesLayout
                ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6',
            )}
          >
            {children ?? <Outlet />}
          </main>
        </div>

        <SheetContent
          variant="navigation"
          onCloseAutoFocus={(event) => {
            if (confirmingLogout) event.preventDefault();
          }}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate your Agapay dashboard.</SheetDescription>
          <SidebarBody
            items={items}
            user={user}
            onNavigate={() => setMenuOpen(false)}
            onLogoutRequest={requestLogout}
            loggingOut={loggingOut}
          />
        </SheetContent>

        <ConfirmDialog
          open={confirmingLogout}
          title="Log out?"
          description="You will need to sign in again to reach your dashboard."
          confirmLabel="Log out"
          cancelLabel="Stay signed in"
          pending={loggingOut}
          pendingLabel="Logging out…"
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => void confirmLogout()}
        />
      </div>
    </Sheet>
  );
}
