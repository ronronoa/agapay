import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DashboardShell, type DashboardNavItem } from './DashboardShell';

const ITEMS: readonly DashboardNavItem[] = [
  { to: '/donor', label: 'Dashboard', end: true },
  { to: '/donor/activity', label: 'Activity' },
];

function renderShell(): ReturnType<typeof render> {
  const ui: ReactElement = (
    <DashboardShell items={ITEMS}>
      <p>Child content</p>
    </DashboardShell>
  );
  return render(<MemoryRouter initialEntries={['/donor']}>{ui}</MemoryRouter>);
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
});
