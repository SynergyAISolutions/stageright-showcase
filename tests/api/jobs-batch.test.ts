import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/batch-jobs', () => ({
  getBatchJob: vi.fn(),
  markSubJobError: vi.fn(async () => {}),
}));
vi.mock('@/lib/aws/s3', () => ({ getSignedDownloadUrl: vi.fn(async (k) => `signed://${k}`) }));
vi.mock('@/lib/db/first-stage', () => ({ markFirstStage: vi.fn(async () => false) }));
vi.mock('@/lib/credits/partial-refund', () => ({ applyPartialRefundsForBatch: vi.fn(async () => 0) }));
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright-test',
}));
vi.mock('@/lib/staging/cover-slot', () => ({ defaultCoverSlot: vi.fn(() => 1) }));

import { GET } from '@/app/api/jobs/batch/route';
import { getSession } from '@/lib/auth/session';
import { getBatchJob, markSubJobError } from '@/lib/db/batch-jobs';

const userSession = { user: { id: 'u1', email: 'x@x.com', name: 'N', plan: 'free', creditsRemaining: 0, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' } };

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/jobs/batch?id=${id}`);
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue(userSession as any); });

describe('GET /api/jobs/batch', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(401);
  });

  it('400 when id is missing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/jobs/batch'));
    expect(res.status).toBe(400);
  });

  it('404 when batch does not exist', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce(null);
    const res = await GET(makeReq('nope'));
    expect(res.status).toBe(404);
  });

  it('403 when batch belongs to another user', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'someone-else', total: 2, completed: 0, failed: 0,
      refundedCredits: 0, subJobs: [],
    } as any);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(403);
  });

  // The response is variant-nested (subJobs[i].variants[j].imageUrl/error) since
  // Three Takes. These two cases use legacy flat records (no variants[]) so they
  // also cover the route's synthesise-one-variant fallback.
  it('returns running status with signed URLs for done sub-jobs (legacy flat record)', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'u1', total: 3, completed: 1, failed: 0, refundedCredits: 0,
      heroS3Key: 'hero-key-1',
      subJobs: [
        { jobId: 'j1', style: 'Modern', status: 'done', stagedS3Key: 'k1', sessionId: 's1' },
        { jobId: 'j2', style: 'Coastal', status: 'running' },
        { jobId: 'j3', style: 'Hamptons', status: 'pending' },
      ],
    } as any);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.total).toBe(3);
    expect(body.completed).toBe(1);
    expect(body.heroImageUrl).toBe('signed://hero-key-1');
    expect(body.subJobs[0].variants).toHaveLength(1);
    expect(body.subJobs[0].variants[0]).toMatchObject({ slot: 1, status: 'done', imageUrl: 'signed://k1' });
    expect(body.subJobs[1].variants[0].imageUrl).toBeUndefined();
  });

  it('returns status done when completed + failed = total (legacy flat record)', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'u1', total: 2, completed: 1, failed: 1, refundedCredits: 1,
      heroS3Key: 'hero-key-1',
      subJobs: [
        { jobId: 'j1', style: 'Modern', status: 'done', stagedS3Key: 'k1', sessionId: 's1' },
        { jobId: 'j2', style: 'Coastal', status: 'error', error: 'gemini 500' },
      ],
    } as any);
    const res = await GET(makeReq('b1'));
    const body = await res.json();
    expect(body.status).toBe('done');
    expect(body.failed).toBe(1);
    expect(body.refundedCredits).toBe(1);
    expect(body.heroImageUrl).toBe('signed://hero-key-1');
    expect(body.subJobs[1].variants[0]).toMatchObject({ status: 'error', error: 'gemini 500' });
  });

  it('returns status error when failed = total (all sub-jobs failed)', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'u1', total: 2, completed: 0, failed: 2, refundedCredits: 2,
      subJobs: [
        { jobId: 'j1', style: 'Modern', status: 'error', error: 'a' },
        { jobId: 'j2', style: 'Coastal', status: 'error', error: 'b' },
      ],
    } as any);
    const res = await GET(makeReq('b1'));
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.heroImageUrl).toBeUndefined();
  });

  // Watchdog window is 7 min: it must exceed the worker Lambda's 300s timeout
  // plus fan-out lead, or it culls variants that are still rendering.
  it('marks pending variants as errored when batch is older than 7 minutes', async () => {
    const stale = new Date(Date.now() - 8 * 60 * 1000).toISOString(); // 8 min ago
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      pk: 'BATCH#b1', sk: 'META',
      batchId: 'b1', userId: 'u1', bundle: 'triple',
      heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
      roomAnalysis: '', subJobs: [
        { style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'done', stagedS3Key: 's1' },
          { slot: 2, jobId: 'j2', status: 'pending' },
          { slot: 3, jobId: 'j3', status: 'pending' },
        ]},
      ],
      total: 3, completed: 1, failed: 0, refundedCredits: 0,
      createdAt: stale,
    } as any);

    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    // Watchdog called markSubJobError for the two pending variants.
    expect(vi.mocked(markSubJobError)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(markSubJobError)).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'j2' }));
    expect(vi.mocked(markSubJobError)).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'j3' }));
  });

  it('does not cull in-flight variants inside the 7-minute window (e.g. 4 min old)', async () => {
    const inFlight = new Date(Date.now() - 4 * 60 * 1000).toISOString(); // 4 min ago
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      pk: 'BATCH#b1', sk: 'META',
      batchId: 'b1', userId: 'u1', bundle: 'triple',
      heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
      roomAnalysis: '', subJobs: [
        { style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'done', stagedS3Key: 's1' },
          { slot: 2, jobId: 'j2', status: 'running' },
          { slot: 3, jobId: 'j3', status: 'pending' },
        ]},
      ],
      total: 3, completed: 1, failed: 0, refundedCredits: 0,
      createdAt: inFlight,
    } as any);

    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    expect(vi.mocked(markSubJobError)).not.toHaveBeenCalled();
  });

  it('does not touch fresh batches with pending variants', async () => {
    const fresh = new Date().toISOString();
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      pk: 'BATCH#b1', sk: 'META',
      batchId: 'b1', userId: 'u1', bundle: 'triple',
      heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
      roomAnalysis: '', subJobs: [
        { style: 'Modern', status: 'pending', variants: [
          { slot: 1, jobId: 'j1', status: 'pending' },
        ]},
      ],
      total: 1, completed: 0, failed: 0, refundedCredits: 0,
      createdAt: fresh,
    } as any);

    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    expect(vi.mocked(markSubJobError)).not.toHaveBeenCalled();
  });

  it('does not touch stale batches that are already terminal', async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      pk: 'BATCH#b1', sk: 'META',
      batchId: 'b1', userId: 'u1', bundle: 'triple',
      heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
      roomAnalysis: '', subJobs: [
        { style: 'Modern', status: 'done', variants: [
          { slot: 1, jobId: 'j1', status: 'done', stagedS3Key: 's1' },
        ]},
      ],
      total: 1, completed: 1, failed: 0, refundedCredits: 0,
      createdAt: stale,
    } as any);

    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    expect(vi.mocked(markSubJobError)).not.toHaveBeenCalled();
  });
});
