import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn() },
  TABLE_NAME: 'stageright',
}));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return { ...actual, ADMIN_EMAILS: ['admin@example.com'] };
});

import { GET } from '@/app/api/admin/landing-picks/candidates/route';
import { getSession } from '@/lib/auth/session';
import { dynamodb } from '@/lib/aws/dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

function makeReq(url: string) {
  return new Request(url);
}

describe('GET /api/admin/landing-picks/candidates', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const res = await GET(makeReq('http://x/?room=bedroom'));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid room slug', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await GET(makeReq('http://x/?room=garage'));
    expect(res.status).toBe(400);
  });

  it('queries admin stagings filtered to room and returns grouped heroes + stagings', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { heroS3Key: 'h1', stagedS3Key: 's1m', style: 'Modern', roomTypes: ['Bedroom'], createdAt: '2026-04-29T01:00:00Z' },
        { heroS3Key: 'h1', stagedS3Key: 's1c', style: 'Coastal', roomTypes: ['Bedroom'], createdAt: '2026-04-29T02:00:00Z' },
        { heroS3Key: 'h2', stagedS3Key: 's2m', style: 'Modern', roomTypes: ['Bedroom'], createdAt: '2026-04-29T03:00:00Z' },
      ],
    } as never);

    const res = await GET(makeReq('http://x/?room=bedroom'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroes).toHaveLength(2);
    // latest-first ordering
    expect(body.heroes[0].s3Key).toBe('h2');
    expect(body.heroes[1].s3Key).toBe('h1');
    expect(body.stagings).toHaveLength(3);
    expect(body.stagings[0]).toMatchObject({ heroS3Key: 'h2', style: 'Modern', stagedS3Key: 's2m' });
  });
});
