import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  deductCredits: vi.fn(async () => ({ success: true, creditsCharged: 2, creditsRemaining: 0 })),
}));
// Regression guard: the route used to call runAnalysis synchronously, which
// caused cold-start timeouts. The mock + the assertions below ensure no one
// accidentally re-introduces an import + call to runAnalysis into the route.
vi.mock('@/lib/ai/run-analysis', () => ({
  runAnalysis: vi.fn(async () => ({ analysis: 'analysis text' })),
}));
vi.mock('@/lib/db/batch-jobs', () => ({
  createBatchJob: vi.fn(async (i) => ({
    batchId: 'b-1',
    subJobs: i.styles.map((s: string, idx: number) => ({
      style: s,
      status: 'pending',
      variants:
        i.bundle === 'triple'
          ? [
              { slot: 1, jobId: `j-${idx}-1`, status: 'pending' },
              { slot: 2, jobId: `j-${idx}-2`, status: 'pending' },
              { slot: 3, jobId: `j-${idx}-3`, status: 'pending' },
            ]
          : [{ slot: 1, jobId: `j-${idx}-1`, status: 'pending' }],
    })),
    total: i.bundle === 'triple' ? i.styles.length * 3 : i.styles.length,
  })),
}));
vi.mock('@/lib/aws/lambda', () => ({
  invokeStagingWorker: vi.fn(async () => ({ StatusCode: 202 })),
}));
vi.mock('@/lib/db/listings', () => ({
  getListingById: vi.fn(),
}));

import { POST } from '@/app/api/stage/batch/route';
import { getSession } from '@/lib/auth/session';
import { deductCredits } from '@/lib/db/users';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { createBatchJob } from '@/lib/db/batch-jobs';
import { invokeStagingWorker } from '@/lib/aws/lambda';

const adminSession = {
  user: { id: 'u1', email: 'a@x.com', name: 'A', plan: 'admin', creditsRemaining: 9999, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/stage/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue(adminSession as any); });

describe('POST /api/stage/batch', () => {
  const goodBody = {
    heroS3Key: 'tenants/u1/hero.jpg', referenceS3Keys: [], roomTypes: ['Living Room'],
    styles: ['Modern', 'Coastal'], notes: '', quality: 'standard',
  };

  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(401);
  });

  // goodBody omits `bundle`, so the route defaults to 'triple' (Three Takes),
  // whose cap is 3 styles. Single Take keeps the 10-style cap.
  it('400 when styles is empty (default triple bundle: cap 3)', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/1 to 3/);
  });

  it('400 when styles length > 3 in triple mode', async () => {
    const styles = ['Modern','Scandinavian','Coastal','Hamptons'];
    const res = await POST(makeReq({ ...goodBody, styles }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/1 to 3/);
  });

  it('400 when styles length > 10 in single mode', async () => {
    const styles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi'];
    const res = await POST(makeReq({ ...goodBody, bundle: 'single', styles }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/1 to 10/);
  });

  it('400 on duplicate styles', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: ['Modern','Modern'] }));
    expect(res.status).toBe(400);
  });

  it('400 on unknown style', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: ['NotARealStyle'] }));
    expect(res.status).toBe(400);
  });

  it('202 on triple happy path: deducts N credits, invokes only slot-1 leaders, no in-route analysis', async () => {
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(202);
    expect(deductCredits).toHaveBeenCalledWith('u1', expect.anything(), 4); // triple = 2 credits/style * 2 styles
    expect(runAnalysis).not.toHaveBeenCalled(); // analysis no longer in API route at all
    expect(createBatchJob).toHaveBeenCalledOnce();
    // 2 styles, 1 leader each — NOT 6 invocations.
    expect(invokeStagingWorker).toHaveBeenCalledTimes(2);
    // Every invocation must carry isLeader: true and variantSlot: 1.
    for (const call of vi.mocked(invokeStagingWorker).mock.calls) {
      expect(call[0].params).toMatchObject({ isLeader: true, variantSlot: 1 });
    }
    const body = await res.json();
    expect(body.batchId).toBe('b-1');
    expect(body.subJobs).toHaveLength(2);
  });

  it('202 on single-mode: invokes 1 Lambda per style, no isLeader flag', async () => {
    const res = await POST(makeReq({ ...goodBody, bundle: 'single' }));
    expect(res.status).toBe(202);
    expect(deductCredits).toHaveBeenCalledWith('u1', expect.anything(), 2); // single = 1 credit/style * 2 styles
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(invokeStagingWorker).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(invokeStagingWorker).mock.calls) {
      expect(call[0].params.isLeader).toBeUndefined();
      expect(call[0].params.variantSlot).toBe(1);
    }
  });

  it('402 when credits insufficient', async () => {
    vi.mocked(deductCredits).mockResolvedValueOnce({
      success: false, creditsCharged: 0, creditsRemaining: 0,
    });
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.error).toMatch(/insufficient/i);
  });

  it('400 when listingId is non-empty and does not belong to user', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ ...goodBody, listingId: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('forwards listingId to createBatchJob and Lambda invocations when valid', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any);
    const res = await POST(makeReq({ ...goodBody, listingId: 'l1' }));
    expect(res.status).toBe(202);
    expect(createBatchJob).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'l1' }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ listingId: 'l1' }) }),
    );
  });

  it('treats listingId === "unsorted" as no listing', async () => {
    const res = await POST(makeReq({ ...goodBody, listingId: 'unsorted' }));
    expect(res.status).toBe(202);
    const call = vi.mocked(createBatchJob).mock.calls.at(-1)![0];
    expect(call.listingId).toBeUndefined();
  });
});
