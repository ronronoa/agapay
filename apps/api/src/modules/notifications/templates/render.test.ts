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
    expect(() => renderEmail('REQUEST_STATUS_UPDATED', {}, 'http://localhost:5173')).toThrow(
      /not implemented/,
    );
  });

  it('renders the approval mail in the branded layout with details and track button', () => {
    const rendered = renderEmail(
      'REQUEST_APPROVED',
      {
        name: 'Juan',
        referenceNumber: 'REQ-2026-004281',
        trackingNumber: 'TRK-82K4-19Q7',
        campaignName: 'Typhoon Amihan Relief Drive',
        items: [
          { name: 'Food Packs', quantity: 2 },
          { name: 'Drinking Water', quantity: 1 },
        ],
      },
      'http://localhost:5173',
    );
    expect(rendered.subject).toBe('Your assistance request was approved');
    expect(rendered.html).toContain('AGAPAY');
    expect(rendered.html).toContain('Relief Today. Stronger Tomorrow.');
    expect(rendered.html).toContain('TRK-82K4-19Q7');
    expect(rendered.html).toContain('Typhoon Amihan Relief Drive');
    expect(rendered.html).toContain('Food Packs x2');
    expect(rendered.html).toContain('http://localhost:5173/track');
    expect(rendered.text).toContain('TRK-82K4-19Q7');
  });

  it('rejects malformed goods lists without echoing them', () => {
    expect(() =>
      renderEmail(
        'REQUEST_APPROVED',
        {
          name: 'Juan',
          referenceNumber: 'REQ-2026-004281',
          trackingNumber: 'TRK-82K4-19Q7',
          campaignName: 'Drive',
          items: [{ name: 'Food Packs', quantity: 0 }],
        },
        'http://localhost:5173',
      ),
    ).toThrow(AppError);
  });
});
