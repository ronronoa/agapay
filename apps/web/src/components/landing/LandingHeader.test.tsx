import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LandingHeader } from './LandingHeader';

function renderHeader(): ReturnType<typeof render> {
  const ui: ReactElement = <LandingHeader />;
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('LandingHeader mobile menu', () => {
  it('opens a dialog with navigation links', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Request Assistance' })).toHaveAttribute(
      'href',
      '/request-assistance',
    );
  });

  it('closes on Escape and returns to the menu button', async () => {
    renderHeader();
    const opener = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(opener);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes when a destination is chosen', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('link', { name: 'Track Assistance' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
