import { describe, expect, it } from 'vitest';
import { googleEventId, mirrorBody } from './calendar-sync.js';
const event: Parameters<typeof mirrorBody>[0] = {
  id: '11111111-2222-4333-8444-555555555555',
  type: 'DISTRIBUTION',
  title: 'Relief event',
  description: 'Private operational notes',
  campaignId: 'campaign',
  startAt: new Date('2026-11-01T01:00:00Z'),
  endAt: new Date('2026-11-01T03:00:00Z'),
  location: 'Test hall',
  capacity: 20,
  status: 'SCHEDULED',
  externalProvider: 'google',
  externalEventId: null,
  syncStatus: 'NOT_SYNCED',
  syncError: null,
  revision: 1,
  syncAttempts: 0,
  syncNextAt: new Date('2026-10-21T00:00:00Z'),
  syncLeaseUntil: null,
  createdById: null,
  createdAt: new Date('2026-10-21T00:00:00Z'),
  updatedAt: new Date('2026-10-21T00:00:00Z'),
  campaign: { name: 'Test campaign' },
};
describe('Google calendar mirror', () => {
  it('uses a deterministic provider-compatible identifier', () => {
    expect(googleEventId(event.id)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleEventId(event.id)).toBe(googleEventId(event.id));
  });
  it('includes operations fields and a protected link, excluding free-text notes', () => {
    const body = mirrorBody(event);
    expect(body.description).toContain(`/admin/calendar?event=${event.id}`);
    expect(body.description).toContain('Test campaign');
    expect(JSON.stringify(body)).not.toContain('Private operational notes');
    expect(body.start.timeZone).toBe('Asia/Manila');
  });
  it('marks cancellations and completed events explicitly', () => {
    expect(mirrorBody({ ...event, status: 'CANCELLED' }).status).toBe('cancelled');
    expect(mirrorBody({ ...event, status: 'COMPLETED' }).summary).toContain('[Completed]');
  });
});
