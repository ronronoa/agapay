import { describe, expect, it } from 'vitest';
import { renderScheduleEmail } from './schedule-email.js';
const payload = {
  name: '<Recipient>',
  title: 'Relief; supplies, event',
  location: 'Hall\nMain room',
  startAt: '2026-11-01T01:00:00.000Z',
  endAt: '2026-11-01T04:00:00.000Z',
  schedule: {
    kind: 'distribution',
    id: 'allocation-1',
    revision: 3,
    mode: 'schedule',
    eventId: 'event-1',
    eventRevision: 2,
  },
};
describe('schedule calendar emails', () => {
  it('escapes recipient text and serializes UTC dates, stable UID, and sequence', () => {
    const mail = renderScheduleEmail(payload);
    expect(mail?.html).toContain('&lt;Recipient&gt;');
    expect(mail?.attachments[0]?.content).toContain('UID:distribution-allocation-1@agapay');
    expect(mail?.attachments[0]?.content).toContain('SEQUENCE:3');
    expect(mail?.attachments[0]?.content).toContain('DTSTART:20261101T010000Z');
    expect(mail?.text).toContain('Philippine time');
  });
  it('keeps the UID and increments sequence on cancellation', () => {
    const mail = renderScheduleEmail({
      ...payload,
      schedule: { ...payload.schedule, mode: 'cancel', revision: 4 },
    });
    expect(mail?.subject).toContain('cancelled');
    expect(mail?.attachments[0]?.content).toContain('STATUS:CANCELLED');
    expect(mail?.attachments[0]?.content).toContain('SEQUENCE:4');
  });
  it('does not render ordinary email data as a schedule', () => {
    expect(renderScheduleEmail({ name: 'Name' })).toBeNull();
  });
});
