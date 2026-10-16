import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, expect, it, afterEach } from 'vitest';
import type { AuthUserDto } from '@agapay/shared';
import { clearSession, setSession } from '../../lib/session';
import { LandingHeader } from './LandingHeader';

function account(role: string): AuthUserDto {
  return {
    id: 'u-1',
    name: 'Dana Donor',
    email: 'dana@example.com',
    role,
    phone: null,
    emailVerified: true,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

afterEach(() => {
  clearSession();
});

function renderHeader(): ReturnType<typeof render> {
  const ui: ReactElement = <LandingHeader />;
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('LandingHeader mobile menu', () => {
  it('opens a dialog with navigation links', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Request Aid' })).toHaveAttribute(
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

describe('LandingHeader public navigation', () => {
  it('stays pinned while scrolling', () => {
    renderHeader();
    const header = screen.getByRole('banner');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
  });

  it('blurs once the page scrolls', () => {
    renderHeader();
    const header = screen.getByRole('banner');
    expect(header.className).not.toContain('backdrop-blur-md');
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
    fireEvent.scroll(window);
    expect(header.className).toContain('backdrop-blur-md');
  });
  it('shows the restored links with the journey links in a dropdown', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const text = nav.textContent ?? '';
    for (const label of ['Home', 'Impact', 'About Us', 'Take Action']) {
      expect(text).toContain(label);
    }
    // Journey links stay hidden until the dropdown opens.
    expect(screen.queryByRole('menu', { name: 'Take action' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take Action' }));
    const menu = screen.getByRole('menu', { name: 'Take action' });
    for (const label of ['Donate Goods', 'Request Aid', 'Campaigns', 'Track Assistance']) {
      expect(menu.textContent ?? '').toContain(label);
    }
  });

  it('sends visitors to registration for Donate Goods', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Take Action' }));
    const donate = screen.getAllByRole('link', { name: 'Donate Goods' });
    expect(donate[0]).toHaveAttribute('href', '/register');
  });

  it('sends signed-in donors straight to the donation form', () => {
    setSession('token', account('DONOR'));
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Take Action' }));
    const donate = screen.getAllByRole('link', { name: 'Donate Goods' });
    expect(donate[0]).toHaveAttribute('href', '/donate');
  });

  it('closes the dropdown on Escape', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Take Action' }));
    expect(screen.getByRole('menu', { name: 'Take action' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Take action' }), { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Take action' })).toBeNull();
  });

  it('scrolls visibly to a section instead of jumping', () => {
    const calls: ScrollIntoViewOptions[] = [];
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      value: function (this: Element, options?: ScrollIntoViewOptions) {
        calls.push(options ?? {});
      },
      configurable: true,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LandingHeader />
          <section id="impact">Impact section</section>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(document.getElementById('impact')?.tagName).toBe('SECTION');
    document.getElementById('impact')?.scrollIntoView?.({ behavior: 'smooth' });
    expect(calls).toEqual([{ behavior: 'smooth' }]);
    calls.length = 0;
    const impact = screen.getByRole('link', { name: 'Impact' });
    expect(impact.getAttribute('href')).toBe('#impact');
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.click(impact)).toBe(false);
    expect(calls).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });
});
