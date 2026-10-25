import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'fake-key';

const require = createRequire(import.meta.url);
const { photoUrl } = require('../utils/storage');

describe('photoUrl', () => {
  it('returns null for a missing photo', () => {
    expect(photoUrl(null)).toBeNull();
    expect(photoUrl('')).toBeNull();
  });

  it('expands a bare filename to a public URL', () => {
    expect(photoUrl('b9b05a50-d921-4b11-b24d-27b0789594b0.jpeg'))
      .toMatch(/\/storage\/v1\/object\/public\/item-photos\/b9b05a50-d921-4b11-b24d-27b0789594b0\.jpeg$/);
  });

  it('leaves an existing public URL unchanged', () => {
    const url = 'https://example.supabase.co/storage/v1/object/public/item-photos/photo.jpeg';
    expect(photoUrl(url)).toBe(url);
  });
});
