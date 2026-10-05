import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/migrations/legacy-uploads', () => ({
  migrateUnsortedToLegacy: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/listings', () => ({
  createListing: vi.fn(async (i) => ({
    pk: `USER#${i.userId}`,
    sk: 'LISTING#x',
    id: 'l1',
    userId: i.userId,
    name: i.name,
    address: i.address,
    createdAt: '2026-04-27T00:00:00Z',
    updatedAt: '2026-04-27T00:00:00Z',
  })),
  getUserListings: vi.fn(async () => [
    {
      pk: 'USER#u1', sk: 'LISTING#a', id: 'l1', userId: 'u1', name: 'L1',
      createdAt: '2026-04-26T00:00:00Z', updatedAt: '2026-04-26T00:00:00Z',
    },
  ]),
}));
vi.mock('@/lib/db/stagings', () => ({
  getUserStagings: vi.fn(async () => [
    { id: 's1', heroS3Key: 'h1', listingId: 'l1', createdAt: '2026-04-26T01:00:00Z' },
    { id: 's2', heroS3Key: 'h1', listingId: 'l1', createdAt: '2026-04-26T02:00:00Z' },
    { id: 's3', heroS3Key: 'h2', listingId: 'l1', createdAt: '2026-04-26T03:00:00Z' },
    { id: 's4', heroS3Key: 'h3' /* no listingId — Unsorted */, createdAt: '2026-04-26T04:00:00Z' },
  ]),
}));
vi.mock('@/lib/aws/s3', () => ({
  getSignedDownloadUrl: vi.fn(async (k: string) => `https://signed/${k}`),
}));

import { GET, POST } from '@/app/api/listings/route';
import { getSession } from '@/lib/auth/session';

const session = { user: { id: 'u1', email: 'a@b.c' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session as any);
});

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/listings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/listings', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ name: 'A' }));
    expect(res.status).toBe(401);
  });

  it('400 when name missing or empty', async () => {
    expect((await POST(makeReq({}))).status).toBe(400);
    expect((await POST(makeReq({ name: '' }))).status).toBe(400);
    expect((await POST(makeReq({ name: '   ' }))).status).toBe(400);
  });

  it('201 with the new listing on success', async () => {
    const res = await POST(makeReq({ name: '12 Smith St', address: 'Brisbane' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.listing.id).toBe('l1');
    expect(data.listing.name).toBe('12 Smith St');
  });
});

describe('GET /api/listings', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns listings + per-listing counts derived from stagings', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0].id).toBe('l1');
    expect(data.listings[0].imageCount).toBe(3);
    expect(data.listings[0].sourceCount).toBe(2);
    expect(data.listings[0].lastActivityAt).toBe('2026-04-26T03:00:00Z');
  });
});
