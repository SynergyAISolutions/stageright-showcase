import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/landing-picks', () => ({
  upsertLandingPick: vi.fn(),
  deleteLandingPick: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({ Items: [] })) },
  TABLE_NAME: 'stageright',
}));
vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return { ...actual, ADMIN_EMAILS: ['admin@example.com'] };
});

import { POST, DELETE } from '@/app/api/admin/landing-picks/route';
import { getSession } from '@/lib/auth/session';
import { upsertLandingPick, deleteLandingPick } from '@/lib/db/landing-picks';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

function makeReq(body: unknown) {
  return new Request('http://x/api/admin/landing-picks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/admin/landing-picks', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const res = await POST(makeReq({ roomSlug: 'bedroom', enabled: true }));
    expect(res.status).toBe(403);
    expect(upsertLandingPick).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid roomSlug', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await POST(makeReq({ roomSlug: 'garage', enabled: true }));
    expect(res.status).toBe(400);
  });

  it('upserts at the requested setIndex and revalidates', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const { dynamodb } = await import('@/lib/aws/dynamodb');
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [{ stagedS3Key: 'tenants/a/m.jpg', heroS3Key: 'tenants/a/h.jpg' }],
    } as never);

    const res = await POST(makeReq({
      roomSlug: 'bedroom',
      setIndex: 2,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
    }));
    expect(res.status).toBe(200);
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', 2, {
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      heroByStyle: { Modern: 'tenants/a/h.jpg' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('defaults setIndex to 0 when omitted (legacy clients)', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    // picks: {} causes resolveHeroByStyle to return early — no dynamodb.send call needed.
    await POST(makeReq({
      roomSlug: 'bedroom', enabled: true, picks: {},
    }));
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', 0, expect.anything());
  });

  it('returns 400 when setIndex is out of range', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await POST(makeReq({
      roomSlug: 'bedroom', setIndex: 99, enabled: true,
    }));
    expect(res.status).toBe(400);
    expect(upsertLandingPick).not.toHaveBeenCalled();
  });

  it('ignores client-sent heroByStyle and uses server-resolved values', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const { dynamodb } = await import('@/lib/aws/dynamodb');
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [{ stagedS3Key: 'tenants/a/m.jpg', heroS3Key: 'tenants/a/REAL-hero.jpg' }],
    } as never);

    await POST(makeReq({
      roomSlug: 'bedroom',
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      // Client-sent heroByStyle (potentially stale) is ignored.
      heroByStyle: { Modern: 'tenants/a/STALE-hero.jpg' },
    }));
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', 0, {
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      heroByStyle: { Modern: 'tenants/a/REAL-hero.jpg' },
    });
  });
});

describe('DELETE /api/admin/landing-picks', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom&setIndex=1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
    expect(deleteLandingPick).not.toHaveBeenCalled();
  });

  it('deletes by roomSlug + setIndex and revalidates /', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom&setIndex=1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(deleteLandingPick).toHaveBeenCalledWith('bedroom', 1);
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns 400 when roomSlug is missing', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?setIndex=1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when setIndex is missing', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when setIndex is out of range', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom&setIndex=99', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    expect(deleteLandingPick).not.toHaveBeenCalled();
  });
});
