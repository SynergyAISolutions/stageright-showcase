import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://signed.example/image.jpg?expires=...'),
}));
vi.mock('@/lib/aws/s3', () => ({
  s3Client: {},
  BUCKET_NAME: 'stageright-images',
}));

import { getPublicImageUrl } from '@/lib/aws/image-urls';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

beforeEach(() => { vi.clearAllMocks(); });

describe('getPublicImageUrl', () => {
  it('returns a signed S3 URL with a long TTL for landing display', async () => {
    const url = await getPublicImageUrl('tenants/a/staged-modern.jpg');
    expect(url).toBe('https://signed.example/image.jpg?expires=...');
    const args = vi.mocked(getSignedUrl).mock.calls[0];
    // Third arg: { expiresIn: <seconds> }. Should be at least 7 days.
    const opts = args[2] as { expiresIn: number };
    expect(opts.expiresIn).toBeGreaterThanOrEqual(60 * 60 * 24 * 7);
  });

  it('returns null for an empty/undefined key', async () => {
    expect(await getPublicImageUrl(undefined)).toBeNull();
    expect(await getPublicImageUrl('')).toBeNull();
  });
});
