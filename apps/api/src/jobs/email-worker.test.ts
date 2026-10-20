import { describe, expect, it } from 'vitest';
import { shouldSkip } from './email-worker.js';

// The limits come from env.ts defaults (90/day, 60/hour).
describe('shouldSkip', () => {
  it('sends while both budgets have room', () => {
    expect(shouldSkip(2, 89, 59)).toBe(false);
  });

  it('skips non-critical mail once the daily budget is spent', () => {
    expect(shouldSkip(2, 90, 0)).toBe(true);
  });

  it('skips non-critical mail once the hourly budget is spent', () => {
    expect(shouldSkip(2, 0, 60)).toBe(true);
  });

  it('never skips critical mail, whatever the budgets say', () => {
    expect(shouldSkip(1, 500, 500)).toBe(false);
  });
});
