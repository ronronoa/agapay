import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import type { AuthUserDto } from '@agapay/shared';
import { clearSession, setSession } from '../../lib/session';
import { DashboardShell, type DashboardNavItem } from './DashboardShell';

const ITEMS: readonly DashboardNavItem[] = [
  { to: '/donor', label: 'Dashboard', end: true },
  { to: '/donor/activity', label: 'Activity' },
];

const ROLE_ITEMS: readonly DashboardNavItem[] = [
  ...ITEMS,
  { to: '/admin/users', label: 'Donor', roles: ['ADMIN'] },
];

function staffer(): AuthUserDto {
  return {
    id: 'staff-1',
    name: 'Sam Staff',
    email: 'staff@example.com',
    role: 'STAFF',
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

afterEach(() => {
  clearSession();
});

function renderShell(
  handle?: { shellTitle: string },
  items: readonly DashboardNavItem[] = ITEMS,
): ReturnType<typeof render> {
  const ui: ReactElement = (
    <DashboardShell items={items}>
      <p>Child content</p>
    </DashboardShell>
  );
  // useMatches (the shell header title) needs a data router, not MemoryRouter.
  const router = createMemoryRouter(
    [
      {
        path: '/donor',
        element: ui,
        ...(handle === undefined ? {} : { handle }),
      },
    ],
    { initialEntries: ['/donor'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('DashboardShell', () => {
  it('renders nav, content, and logout', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
      'href',
      '/donor/activity',
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('labels the not-yet-built topbar controls instead of faking them', () => {
    renderShell();
    const search = screen.getByPlaceholderText('Search…');
    expect(search).toBeDisabled();
    expect(search).toHaveAttribute('title', 'Dashboard search arrives in a later release');
    expect(screen.getByRole('button', { name: 'Print report' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /alerts/i })).toBeDisabled();
  });

  it('marks the active section without colour alone', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a route-provided header title instead of the search cluster', () => {
    renderShell({ shellTitle: 'Dashboard' });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search…')).toBeNull();
  });

  it('hides role-restricted sections from unauthorized roles', () => {
    setSession('token', staffer());
    renderShell(undefined, ROLE_ITEMS);
    expect(screen.queryByRole('link', { name: 'Donor' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument();
  });

  it('shows role-restricted sections to authorized roles', () => {
    setSession('token', { ...staffer(), role: 'ADMIN' });
    renderShell(undefined, ROLE_ITEMS);
    expect(screen.getByRole('link', { name: 'Donor' })).toHaveAttribute('href', '/admin/users');
  });
});

describe('DashboardShell logout confirmation', () => {
  it('asks before ending the session', async () => {
    setSession('token', staffer());
    renderShell();
    expect(screen.queryByText('Log out?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
    expect(await screen.findByText('Log out?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    await waitFor(() => expect(screen.queryByText('Log out?')).toBeNull());
  });
});
