import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('renders the hero heading', () => {
    renderHome();
    expect(
      screen.getByRole('heading', { name: /connecting donors with communities hit by calamity/i }),
    ).toBeInTheDocument();
  });

  it('provides CTAs to request assistance and donate goods', () => {
    renderHome();
    const requestLink = screen.getByRole('link', { name: /request aid now/i });
    const donateLink = screen.getByRole('link', { name: /donate goods/i });
    expect(requestLink).toHaveAttribute('href', '/request-assistance');
    expect(donateLink).toHaveAttribute('href', '/donate');
  });

  it('renders the "What Agapay responds to" section with three cards', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: /what agapay responds to/i })).toBeInTheDocument();
    expect(screen.getByText(/Spirit of Kapit-Bisig/)).toBeInTheDocument();
    expect(screen.getByText(/Filipinos Take Care of Their Own/)).toBeInTheDocument();
    expect(screen.getByText(/Spirit of Bayanihan/)).toBeInTheDocument();
  });

  it('renders the affected areas section with location cards', () => {
    renderHome();
    expect(
      screen.getByRole('heading', { name: /affected areas of the philippines/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/St. Bernard, Southern Leyte/)).toBeInTheDocument();
    expect(screen.getByText(/Malabon City, Metro Manila/)).toBeInTheDocument();
    expect(screen.getByText(/Camalig City, Bicol Philippines/)).toBeInTheDocument();
  });

  it('renders the mission section', () => {
    renderHome();
    expect(
      screen.getByRole('heading', {
        name: /connecting those who can help with those who need it most/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/verified needs/i)).toBeInTheDocument();
    expect(screen.getByText(/real-time tracking/i)).toBeInTheDocument();
  });

  it('renders the footer with newsletter form', () => {
    renderHome();
    expect(screen.getByLabelText(/work email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();
  });

  it('shows a loading state when told data is in flight', () => {
    render(
      <MemoryRouter>
        <HomePage isLoading />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('publishes no unverifiable claims (hard rule 12)', () => {
    const { container } = renderHome();
    const text = container.textContent?.toLowerCase() ?? '';
    for (const banned of ['trusted by', 'testimonial', 'lives impacted']) {
      expect(text).not.toContain(banned);
    }
  });
});
