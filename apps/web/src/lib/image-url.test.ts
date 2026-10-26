import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageUrl } from './image-url';

afterEach(() => vi.unstubAllEnvs());

describe('uploaded image URLs', () => {
  it('uses the same origin when the API is proxied', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(imageUrl('/uploads/campaigns/cover.png')).toBe('/uploads/campaigns/cover.png');
  });

  it('resolves campaign and inventory photos against a separate API without double slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/');
    expect(imageUrl('/uploads/campaigns/cover.png')).toBe(
      'https://api.example.com/uploads/campaigns/cover.png',
    );
    expect(imageUrl('/uploads/inventory/item.png')).toBe(
      'https://api.example.com/uploads/inventory/item.png',
    );
  });

  it('preserves complete external URLs and frontend assets', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
    expect(imageUrl('https://images.example.com/cover.png')).toBe(
      'https://images.example.com/cover.png',
    );
    expect(imageUrl('/images/cover.png')).toBe('/images/cover.png');
  });
});
