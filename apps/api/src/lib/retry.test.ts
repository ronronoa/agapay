import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry.js';

const writeConflict = () => Object.assign(new Error('write conflict'), { code: 'P2034' });

describe('withRetry', () => {
  it('returns the value on the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable write conflict and then succeeds (DB-12)', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(writeConflict())
      .mockRejectedValueOnce(writeConflict())
      .mockResolvedValue('ok');

    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const deterministic = Object.assign(new Error('unique violation'), { code: 'P2002' });
    const fn = vi.fn().mockRejectedValue(deterministic);

    await expect(withRetry(fn)).rejects.toThrow('unique violation');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry an error with no code at all', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withRetry(fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempt budget and rethrows the last error', async () => {
    const fn = vi.fn().mockRejectedValue(writeConflict());
    await expect(withRetry(fn, 2)).rejects.toThrow('write conflict');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
