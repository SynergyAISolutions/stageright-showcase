import { describe, it, expect } from 'vitest';
import { hashHeroKey, findHeroByHash } from '@/lib/utils/hero-key-hash';

describe('hashHeroKey', () => {
  it('returns a 16-char base64url string', () => {
    const h = hashHeroKey('tenants/u1/hero/abc.jpg');
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is stable for the same input', () => {
    const a = hashHeroKey('tenants/u1/hero/abc.jpg');
    const b = hashHeroKey('tenants/u1/hero/abc.jpg');
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    expect(hashHeroKey('a')).not.toBe(hashHeroKey('b'));
  });
});

describe('findHeroByHash', () => {
  it('returns the heroS3Key whose hash matches', () => {
    const keys = ['tenants/u1/a.jpg', 'tenants/u1/b.jpg'];
    const hash = hashHeroKey(keys[1]);
    expect(findHeroByHash(keys, hash)).toBe(keys[1]);
  });

  it('returns null when nothing matches', () => {
    expect(findHeroByHash(['x', 'y'], 'nope')).toBeNull();
  });
});
