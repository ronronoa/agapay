import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPlaces } from './psgc';

afterEach(() => vi.unstubAllGlobals());
describe('PSGC reference requests', () => {
  it('validates responses and sends no credentials or referrer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ code: '0102800000', name: 'Ilocos Norte' }])),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPlaces('/provinces')).toEqual([{ code: '0102800000', name: 'Ilocos Norte' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://psgc.cloud/api/provinces',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' }),
    );
    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ name: 'Missing code' }])));
    await expect(fetchPlaces('/provinces')).rejects.toThrow();
    await expect(fetchPlaces('/arbitrary')).rejects.toThrow('Invalid geographic lookup');
  });
  it('rejects provider failures for the manual fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchPlaces('/provinces')).rejects.toThrow('unavailable');
  });
});
