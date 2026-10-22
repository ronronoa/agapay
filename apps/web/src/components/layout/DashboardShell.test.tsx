import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  cleanup();
  clearSession();
});

function renderShell(
  handle?: { shellTitle: string },
  items: readonly DashboardNavItem[] = ITEMS,
  initialPath = '/donor',
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
        path: '*',
        element: ui,
        ...(handle === undefined ? {} : { handle }),
      },
    ],
    { initialEntries: [initialPath] },
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

const GROUPED_ITEMS: readonly DashboardNavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true, section: 'Overview' },
  { to: '/admin/campaigns', label: 'Campaigns', section: 'Relief operations' },
  { to: '/admin/requests', label: 'Requests', section: 'Relief operations', badge: 4 },
  { to: '/admin/messages', label: 'Messages', section: 'Support' },
  { to: '/admin/users', label: 'Users', section: 'Administration', roles: ['ADMIN'] },
  { to: '/admin/settings', label: 'Settings', section: 'Administration', roles: ['ADMIN'] },
];

describe('Dashboard menu groups', () => {
  it('groups operational links and uses a native administration disclosure', () => {
    setSession('token', { ...staffer(), role: 'ADMIN' });
    const { container } = renderShell(undefined, GROUPED_ITEMS, '/admin');
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Relief operations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Support' })).toBeInTheDocument();
    const summary = screen.getByText('Administration');
    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Requests 4' })).toHaveAttribute(
      'href',
      '/admin/requests',
    );
  });

  it('opens administration on direct and nested route entry', () => {
    setSession('token', { ...staffer(), role: 'ADMIN' });
    const { container } = renderShell(undefined, GROUPED_ITEMS, '/admin/users/example');
    expect(container.querySelector('details')).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
  });

  it('reopens administration when navigating to one of its pages', async () => {
    setSession('token', { ...staffer(), role: 'ADMIN' });
    const { container } = renderShell(undefined, GROUPED_ITEMS, '/admin');
    fireEvent.click(screen.getByText('Administration'));
    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page'),
    );
    expect(container.querySelector('details')).toHaveAttribute('open');
  });

  it('omits headings for sections hidden by permissions', () => {
    setSession('token', staffer());
    renderShell(undefined, GROUPED_ITEMS, '/admin');
    expect(screen.queryByText('Administration')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Relief operations' })).toBeInTheDocument();
  });

  it('shows donor groups and closes the mobile menu after navigation', async () => {
    setSession('token', { ...staffer(), role: 'DONOR' });
    renderShell(undefined, [
      { to: '/donor', label: 'Dashboard', end: true, section: 'My donations' },
      { to: '/donor/activity', label: 'Donation activity', section: 'My donations' },
      { to: '/donor/messages', label: 'Messages', section: 'Account' },
    ]);
    expect(screen.getByRole('heading', { name: 'My donations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(dialog).getByRole('heading', { name: 'My donations' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Donation activity' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Donation activity' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
