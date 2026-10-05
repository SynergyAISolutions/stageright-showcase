import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  markOnboardingComplete: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/onboarding/complete/route';
import { getSession } from '@/lib/auth/session';
import { markOnboardingComplete } from '@/lib/db/users';

const userSession = {
  user: { id: 'u1', email: 'u@x.com', name: 'U', plan: 'free', creditsRemaining: 14, creditsUsedAllTime: 1, pk: 'USER#u1', sk: 'PROFILE' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(userSession as any);
});

function makeReq() {
  return new NextRequest('http://localhost/api/onboarding/complete', { method: 'POST' });
}

describe('POST /api/onboarding/complete', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('200 on success and calls markOnboardingComplete', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalledWith('u1');
  });
});
