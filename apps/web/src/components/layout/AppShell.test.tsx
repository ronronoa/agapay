import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import type { AuthUserDto } from '@agapay/shared';
import { clearSession, setSession } from '../../lib/session';
import { AppShell } from './AppShell';

function account(role: string): AuthUserDto {
  return {
    id: 'u-1',
    name: 'Sam Staff',
    email: 'staff@example.com',
    role,
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function renderShell(): ReturnType<typeof render> {
  const ui: ReactElement = <AppShell />;
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

afterEach(() => {
  clearSession();
});

describe('AppShell', () => {
  it('hides the ADMIN-only Users link from staff', () => {
    setSession('token', account('STAFF'));
    renderShell();
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Donations' })).toBeInTheDocument();
  });

  it('shows the Users link to admins', () => {
    setSession('token', account('ADMIN'));
    renderShell();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
  });

  it('shows no administration nav to visitors', () => {
    renderShell();
    expect(screen.queryByRole('navigation', { name: 'Administration' })).toBeNull();
  });
});
