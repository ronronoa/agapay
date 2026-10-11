import { describe, expect, it } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { renderEmail } from './render.js';

describe('renderEmail', () => {
  it('renders the verification email with an encoded link and escaped name', () => {
    const rendered = renderEmail(
      'DONOR_VERIFY_EMAIL',
      { name: 'Ana <Reyes>', token: 'abc+123' },
      'http://localhost:5173',
    );
    expect(rendered.subject).toBe('Confirm your Agapay email address');
    expect(rendered.html).toContain('http://localhost:5173/verify-email?token=abc%2B123');
    expect(rendered.html).toContain('Ana &lt;Reyes&gt;');
    expect(rendered.text).toContain('abc%2B123');
  });

  it('rejects malformed template data without echoing it', () => {
    expect(() =>
      renderEmail('DONOR_VERIFY_EMAIL', { name: 'Ana' }, 'http://localhost:5173'),
    ).toThrow(AppError);
  });

  it('fails loudly for types whose module has not landed yet', () => {
    expect(() => renderEmail('REQUEST_APPROVED', {}, 'http://localhost:5173')).toThrow(
      /not implemented/,
    );
  });
});
