import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/aws/lambda', () => ({ invokeStagingWorker: vi.fn(async () => undefined) }));
vi.mock('@/lib/aws/dynamodb', () => ({
  TABLE_NAME: 'stageright-test',
  dynamodb: { send: vi.fn(async () => ({})) },
}));
vi.mock('@/lib/auth/s3-ownership', () => ({
  assertKeysAccessible: vi.fn(() => ({ ok: true })),
}));
vi.mock('@/lib/ai/run-analysis', () => ({
  runAnalysis: vi.fn(async () => ({ analysis: 'analysis text' })),
}));
vi.mock('@/lib/db/compare-runs', () => ({
  createCompareRun: vi.fn(async () => undefined),
}));
vi.mock('ulid', () => ({
  ulid: vi
    .fn()
    .mockReturnValueOnce('run-1')
    .mockReturnValueOnce('job-gemini-full')
    .mockReturnValueOnce('job-openai-full-low')
    .mockReturnValueOnce('job-openai-full-medium')
    .mockReturnValueOnce('job-openai-full-high')
    .mockReturnValueOnce('job-openai-lean-medium')
    .mockReturnValueOnce('job-openai-lean-high'),
}));

import { POST } from '@/app/api/admin/compare/route';
import { getSession } from '@/lib/auth/session';
import { invokeStagingWorker } from '@/lib/aws/lambda';
import { dynamodb } from '@/lib/aws/dynamodb';
import { assertKeysAccessible } from '@/lib/auth/s3-ownership';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { createCompareRun } from '@/lib/db/compare-runs';

const adminSession = {
  user: {
    id: 'admin-user',
    email: 'tara@aiwave.com.au',
    name: 'Tara',
    plan: 'admin',
    creditsRemaining: 999999,
    creditsUsedAllTime: 0,
    pk: 'USER#admin-user',
    sk: 'PROFILE',
  },
};

const userSession = {
  user: {
    id: 'normal-user',
    email: 'agent@example.com',
    name: 'Agent',
    plan: 'free',
    creditsRemaining: 15,
    creditsUsedAllTime: 0,
    pk: 'USER#normal-user',
    sk: 'PROFILE',
  },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/compare', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const goodBody = {
  heroS3Key: 'tenants/admin-user/hero.jpg',
  referenceS3Keys: ['tenants/admin-user/ref.jpg'],
  roomTypes: ['Living Room'],
  styles: ['Modern'],
  notes: 'Use a low sofa.',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(adminSession as any);
});

describe('POST /api/admin/compare', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(401);
  });

  it('403 for non-admin users', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(userSession as any);
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(403);
    expect(invokeStagingWorker).not.toHaveBeenCalled();
  });

  it('400 when style is invalid', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: ['Fake Style'] }));
    expect(res.status).toBe(400);
  });

  it('403 when the hero key is not accessible', async () => {
    vi.mocked(assertKeysAccessible).mockReturnValueOnce({ ok: false } as any);
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(403);
  });

  it('creates six comparison jobs and skips separate analysis for lean OpenAI variants', async () => {
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe('run-1');
    expect(body.jobs).toHaveLength(6);
    expect(body.jobs.find((job: { jobId: string }) => job.jobId === 'job-openai-lean-medium')).toEqual(expect.objectContaining({
      promptMode: 'spatial-ref',
      label: 'GPT Image 2 · Lean Ref Medium',
    }));
    expect(body.jobs.map((job: { jobId: string }) => job.jobId)).toEqual([
      'job-gemini-full',
      'job-openai-full-low',
      'job-openai-full-medium',
      'job-openai-full-high',
      'job-openai-lean-medium',
      'job-openai-lean-high',
    ]);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
    expect(dynamodb.send).toHaveBeenCalledTimes(6);
    expect(invokeStagingWorker).toHaveBeenCalledTimes(6);
    expect(createCompareRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      jobIds: [
        'job-gemini-full',
        'job-openai-full-low',
        'job-openai-full-medium',
        'job-openai-full-high',
        'job-openai-lean-medium',
        'job-openai-lean-high',
      ],
    }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-gemini-full',
      action: 'stage',
      params: expect.objectContaining({
        comparisonVariantId: 'gemini-full',
        provider: 'gemini',
        model: 'nano-banana-pro',
        comparisonId: 'run-1',
        analysisMode: 'full',
        roomAnalysis: 'analysis text',
        style: 'Modern',
      }),
    }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-openai-full-high',
      action: 'stage',
      params: expect.objectContaining({
        comparisonVariantId: 'openai-full-high',
        provider: 'openai',
        model: 'gpt-image-2',
        comparisonId: 'run-1',
        analysisMode: 'full',
        quality: 'high',
        roomAnalysis: 'analysis text',
        style: 'Modern',
      }),
    }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-openai-lean-medium',
      action: 'stage',
      params: expect.objectContaining({
        comparisonVariantId: 'openai-lean-medium',
        provider: 'openai',
        model: 'gpt-image-2',
        comparisonId: 'run-1',
        analysisMode: 'lean-direct',
        promptMode: 'spatial-ref',
        quality: 'medium',
        roomAnalysis: '',
        style: 'Modern',
      }),
    }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-openai-lean-high',
      action: 'stage',
      params: expect.objectContaining({
        comparisonVariantId: 'openai-lean-high',
        provider: 'openai',
        model: 'gpt-image-2',
        comparisonId: 'run-1',
        analysisMode: 'lean-direct',
        promptMode: 'spatial-ref',
        quality: 'high',
        roomAnalysis: '',
        style: 'Modern',
      }),
    }));
  });

  it('marks lean jobs hero-only when no reference images are provided', async () => {
    const res = await POST(makeReq({ ...goodBody, referenceS3Keys: [] }));
    expect(res.status).toBe(200);
    expect(invokeStagingWorker).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        analysisMode: 'lean-direct',
        comparisonVariantId: 'openai-lean-medium',
        promptMode: 'hero-only',
        roomAnalysis: '',
      }),
    }));
  });
});
