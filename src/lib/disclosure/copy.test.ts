import { describe, it, expect } from 'vitest';
import { LISTING_COPY_VARIANTS, COPY_LAST_UPDATED } from './copy';

describe('LISTING_COPY_VARIANTS', () => {
  it('exposes three variants with stable ids', () => {
    expect(LISTING_COPY_VARIANTS.map((v) => v.id)).toEqual(['standard', 'short', 'eu']);
  });

  it('every variant has non-empty label and text', () => {
    for (const v of LISTING_COPY_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.text.length).toBeGreaterThan(0);
    }
  });

  it('every variant text contains "AI" so the disclosure is unambiguous', () => {
    for (const v of LISTING_COPY_VARIANTS) {
      expect(v.text).toMatch(/AI/);
    }
  });
});

describe('COPY_LAST_UPDATED', () => {
  it('is a valid ISO date string', () => {
    expect(() => new Date(COPY_LAST_UPDATED).toISOString()).not.toThrow();
  });
});
