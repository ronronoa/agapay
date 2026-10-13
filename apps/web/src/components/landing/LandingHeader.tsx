import { Link } from 'react-router-dom';
import { useState, useSyncExternalStore } from 'react';
import { getUser, subscribe } from '../../lib/session';
import { logout } from '../../lib/auth-api';
import { Dialog, DialogClose, DialogTitle } from '../ui/dialog';

export function LandingHeader() {
  const user = useSyncExternalStore(subscribe, getUser, getUser);
  const isStaff = user !== null && (user.role === 'ADMIN' || user.role === 'STAFF');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="w-full bg-pine-dark text-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="font-display text-xl font-semibold tracking-tight text-white hover:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Agapay
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          <Link
            to="/"
            className="text-sm font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Home
          </Link>
          <a
            href="#impact"
            className="text-sm font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Impact
          </a>
          <a
            href="#about"
            className="text-sm font-medium text-white/90 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            About Us
          </a>
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
                className="hidden text-sm font-medium text-white/90 hover:text-white sm:inline-block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-pine-dark shadow-sm transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/90">{user.name}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <nav aria-label="Mobile" className="flex flex-col gap-1">
          {(
            [
              { to: '/', label: 'Home' },
              { to: '/campaigns', label: 'Campaigns' },
              { to: '/request-assistance', label: 'Request Assistance' },
              { to: '/track', label: 'Track Assistance' },
              { to: '/register', label: 'Sign Up' },
            ] as const
          ).map((item) => (
            <DialogClose key={item.to + item.label} asChild>
              <Link
                to={item.to}
                className="inline-flex min-h-[44px] items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {item.label}
              </Link>
            </DialogClose>
          ))}
        </nav>
      </Dialog>
    </header>
  );
}
