import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  updateOnboardingFields: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/onboarding/progress/route';
import { getSession } from '@/lib/auth/session';
import { updateOnboardingFields } from '@/lib/db/users';

const userSession = {
  user: { id: 'u1', email: 'u@x.com', name: 'U', plan: 'free', creditsRemaining: 15, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding/progress', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(userSession as any);
});

describe('POST /api/onboarding/progress', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ role: 'solo-agent' }));
    expect(res.status).toBe(401);
  });

  it('400 on invalid role', async () => {
    const res = await POST(makeReq({ role: 'wizard' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid listingsPerMonth', async () => {
    const res = await POST(makeReq({ listingsPerMonth: 'many' }));
    expect(res.status).toBe(400);
  });

  it('400 on empty body (neither field provided)', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('200 on role-only', async () => {
    const res = await POST(makeReq({ role: 'agency' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { role: 'agency' });
  });

  it('200 on volume-only', async () => {
    const res = await POST(makeReq({ listingsPerMonth: '6-10' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { listingsPerMonth: '6-10' });
  });

  it('200 on both at once', async () => {
    const res = await POST(makeReq({ role: 'photographer', listingsPerMonth: '11+' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { role: 'photographer', listingsPerMonth: '11+' });
  });
});
