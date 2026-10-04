import { describe, expect, it } from 'vitest';
import { FixedClock } from './clock.js';

describe('FixedClock', () => {
  it('returns the time it was constructed with', () => {
    const at = new Date('2026-09-30T08:00:00.000Z');
    expect(new FixedClock(at).now().toISOString()).toBe('2026-09-30T08:00:00.000Z');
  });

  it('hands out a copy, so callers cannot mutate internal state (TS-23)', () => {
    const clock = new FixedClock(new Date('2026-09-30T08:00:00.000Z'));
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-09-30T08:00:00.000Z');
  });

  it('advances without waiting on real time (TEST-06)', () => {
    const clock = new FixedClock(new Date('2026-09-30T08:00:00.000Z'));
    clock.advance(90 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-09-30T09:30:00.000Z');
  });
});
