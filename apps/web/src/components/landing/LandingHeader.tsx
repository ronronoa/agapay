import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { getUser, subscribe } from '../../lib/session';
import { donateTarget } from '../../lib/donate-target';
import { logout } from '../../lib/auth-api';
import { Dialog, DialogTitle } from '../ui/dialog';

interface MenuItem {
  to?: string | undefined;
  href?: string | undefined;
  label: string;
}

const menuLinkClass =
  'inline-flex min-h-[44px] w-full items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const desktopLinkClass =
  'text-sm font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

function MenuLink({
  item,
  onNavigate,
  className = menuLinkClass,
}: {
  item: MenuItem;
  onNavigate?: () => void;
  className?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  // Plain hash anchors jump instantly and die on other pages, so section
  // links scroll visibly instead — going home first when coming from /track.
  function onAnchorClick(hash: string): (event: ReactMouseEvent<HTMLAnchorElement>) => void {
    return (event) => {
      event.preventDefault();
      onNavigate?.();
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (location.pathname !== '/') {
        void navigate(`/${hash}`);
        return;
      }
      document
        .querySelector(hash)
        ?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
  }

  if (item.href !== undefined) {
    const hash = item.href;
    return (
      <a href={hash} onClick={onAnchorClick(hash)} className={className}>
        {item.label}
      </a>
    );
  }
  return (
    <Link to={item.to ?? '/'} onClick={onNavigate} className={className}>
      {item.label}
    </Link>
  );
}

export function LandingHeader() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const isStaff = user !== null && (user.role === 'ADMIN' || user.role === 'STAFF');
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);

  const donateTo = donateTarget(user);
  const menuItems: MenuItem[] = [
    { to: '/', label: 'Home' },
    { href: '#impact', label: 'Impact' },
    { href: '#about', label: 'About Us' },
    { to: donateTo, label: 'Donate Goods' },
    { to: '/request-assistance', label: 'Request Aid' },
    { to: '/campaigns', label: 'Campaigns' },
    { to: '/track', label: 'Track Assistance' },
    ...(user === null ? [{ to: '/register', label: 'Sign Up' }] : []),
  ];
  const actionItems = menuItems.filter((item) =>
    ['Donate Goods', 'Request Aid', 'Campaigns', 'Track Assistance'].includes(item.label),
  );

  // Past a small scroll offset the solid bar turns translucent and blurred,
  // so it stays readable without hiding the page behind a heavy block.
  useEffect(() => {
    function onScroll(): void {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The dropdown is the only overlay on this header: close it on outside
  // tap or Escape so keyboard and touch users never get stuck behind it.
  useEffect(() => {
    if (!actionsOpen) return;
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        actionsRef.current !== null &&
        !actionsRef.current.contains(target)
      ) {
        setActionsOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [actionsOpen]);

  function onActionsKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      setActionsOpen(false);
      actionsButtonRef.current?.focus();
    }
  }

  return (
    <header
      className={`sticky top-0 z-40 w-full text-white transition-[background-color,box-shadow] duration-200 ${
        scrolled ? 'bg-pine-dark/90 shadow-lg backdrop-blur-md' : 'bg-pine-dark'
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <Link
            to="/"
            className="font-display text-xl font-semibold tracking-tight text-white hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Agapay
          </Link>
        </div>

        <div className="flex space-x-10">
          <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
            <MenuLink item={{ to: '/', label: 'Home' }} className={desktopLinkClass} />
            <MenuLink item={{ href: '#impact', label: 'Impact' }} className={desktopLinkClass} />
            <MenuLink item={{ href: '#about', label: 'About Us' }} className={desktopLinkClass} />
            <div ref={actionsRef} className="relative" onKeyDown={onActionsKeyDown}>
              <button
                ref={actionsButtonRef}
                type="button"
                aria-expanded={actionsOpen}
                aria-haspopup="true"
                onClick={() => setActionsOpen((open) => !open)}
                className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Take Action
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${actionsOpen ? 'rotate-180' : ''}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {actionsOpen ? (
                <div
                  role="menu"
                  aria-label="Take action"
                  className="absolute left-0 top-full z-50 mt-2 w-56 rounded-md border border-border bg-surface py-1 text-text shadow-lg"
                >
                  {actionItems.map((item) => (
                    <div key={item.label} role="none" className="px-1">
                      <MenuLink item={item} onNavigate={() => setActionsOpen(false)} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {isStaff ? (
              <Link
                to="/admin/campaigns"
                className="text-sm font-medium text-emerald-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Admin Dashboard
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            {user === null ? (
              <>
                <Link
                  to="/login"
                  className="hidden items-center justify-center px-5 py-2 bg-white text-sm font-medium text-black hover:bg-gray-200 rounded-xs sm:inline-block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Sign in
                </Link>
                {/* <Link
                  to="/register"
                  className="inline-flex min-h-11 items-center justify-center rounded-xs bg-white px-5 py-2 text-sm font-semibold text-pine-dark shadow-sm transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Sign Up
                </Link> */}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/90">{user.name}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {menuItems.map((item) => (
            <MenuLink
              key={(item.to ?? item.href ?? '') + item.label}
              item={item}
              onNavigate={() => setMenuOpen(false)}
            />
          ))}
        </nav>
      </Dialog>
    </header>
  );
}
