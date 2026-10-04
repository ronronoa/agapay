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
  it('leads with the three primary actions (design.md §4.1)', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /donate goods/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request assistance/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track assistance/i })).toBeInTheDocument();
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
    for (const banned of ['trusted by', 'partner', 'testimonial', 'lives impacted']) {
      expect(text).not.toContain(banned);
    }
  });
});
