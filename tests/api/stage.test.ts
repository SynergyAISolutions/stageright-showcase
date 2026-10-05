import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  deductCredits: vi.fn(async () => ({ success: true, creditsCharged: 1, creditsRemaining: 0 })),
}));
vi.mock('@/lib/aws/lambda', () => ({
  invokeStagingWorker: vi.fn(async () => ({ StatusCode: 202 })),
}));
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright-test',
}));
vi.mock('@/lib/db/listings', () => ({
  getListingById: vi.fn(),
}));
vi.mock('@/lib/auth/s3-ownership', () => ({
  assertKeysAccessible: vi.fn(() => ({ ok: true })),
}));

import { POST } from '@/app/api/stage/route';
import { getSession } from '@/lib/auth/session';
import { invokeStagingWorker } from '@/lib/aws/lambda';

const adminSession = {
  user: {
    id: 'u1',
    email: 'a@x.com',
    name: 'A',
    plan: 'admin',
    creditsRemaining: 9999,
    creditsUsedAllTime: 0,
    pk: 'USER#u1',
    sk: 'PROFILE',
  },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/stage', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(adminSession as any);
});

describe('POST /api/stage', () => {
  const goodBody = {
    imageS3Key: 'tenants/u1/hero.jpg',
    referenceS3Keys: [],
    style: 'Modern',
    roomTypes: ['Living Room'],
    notes: '',
  };

  it('400 when listingId is non-empty and does not belong to user', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ ...goodBody, listingId: 'nope' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/listing/i);
  });

  it('forwards listingId to Lambda invocation when valid', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any);
    const res = await POST(makeReq({ ...goodBody, listingId: 'l1' }));
    expect(res.status).toBe(200);
    expect(invokeStagingWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ listingId: 'l1' }),
      }),
    );
  });

  it('treats listingId === "unsorted" as no listing', async () => {
    const res = await POST(makeReq({ ...goodBody, listingId: 'unsorted' }));
    expect(res.status).toBe(200);
    const call = vi.mocked(invokeStagingWorker).mock.calls.at(-1)![0];
    expect((call.params as { listingId?: string }).listingId).toBeUndefined();
  });
});
