import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/lib/db/staging-sessions', () => ({
  getStagingSession: vi.fn(),
}));
vi.mock('@/lib/db/flag-reviews', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/flag-reviews')>('@/lib/db/flag-reviews');
  return {
    ...actual,
    createFlagReview: vi.fn(async (d) => ({ id: 'rev-1', ...d, status: 'pending' })),
    countUserPending: vi.fn(async () => 0),
    userAlreadyFlaggedSession: vi.fn(async () => false),
  };
});
vi.mock('@/lib/email/flag-emails', () => ({
  sendAdminNewFlagEmail: vi.fn(async () => {}),
}));

import { POST } from '@/app/api/reviews/route';
import { getSession } from '@/lib/auth/session';
import { getStagingSession } from '@/lib/db/staging-sessions';
import { createFlagReview } from '@/lib/db/flag-reviews';
import { sendAdminNewFlagEmail } from '@/lib/email/flag-emails';

function mockUserSession() {
  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: 'u1',
      email: 'u@test.com',
      name: 'Test',
      plan: 'free',
      creditsRemaining: 5,
      creditsUsedAllTime: 0,
      pk: 'USER#u1',
      sk: 'PROFILE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  } as never);
}

describe('POST /api/reviews', () => {
  beforeEach(() => {
    mockUserSession();
  });

  it('rejects unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null as never);
    const res = await POST(new NextRequest('http://x/api/reviews', { method: 'POST', body: JSON.stringify({ sessionId: 's1' }) }));
    expect(res.status).toBe(401);
  });

  it('rejects when session used references', async () => {
    vi.mocked(getStagingSession).mockResolvedValueOnce({
      sessionId: 's1', referenceS3Keys: ['k1'], createdAt: new Date().toISOString(),
      heroS3Key: 'h', style: 'Modern', model: 'nano-banana-pro', roomTypes: ['Bedroom'], roomAnalysis: '',
      turns: [{ role: 'model', imageS3Key: 'staged' }],
    } as never);
    const res = await POST(new NextRequest('http://x/api/reviews', {
      method: 'POST', body: JSON.stringify({ sessionId: 's1' }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('references-used');
  });

  it('creates a review on happy path', async () => {
    vi.mocked(getStagingSession).mockResolvedValueOnce({
      sessionId: 's1', referenceS3Keys: [], createdAt: new Date(Date.now() - 120_000).toISOString(),
      heroS3Key: 'h', style: 'Modern', model: 'nano-banana-pro', roomTypes: ['Bedroom'], roomAnalysis: '',
      turns: [{ role: 'model', imageS3Key: 'staged' }],
    } as never);
    const res = await POST(new NextRequest('http://x/api/reviews', {
      method: 'POST', body: JSON.stringify({ sessionId: 's1', userNote: 'walls moved' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviewId).toBe('rev-1');
    expect(body.status).toBe('pending');
    expect(createFlagReview).toHaveBeenCalledWith(expect.objectContaining({
      stagedS3Key: 'staged',
      userNote: 'walls moved',
      originalS3Key: 'h',
      style: 'Modern',
      userEmail: 'u@test.com',
    }));
    expect(sendAdminNewFlagEmail).toHaveBeenCalledTimes(1);
  });
});
