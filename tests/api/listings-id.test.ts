import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/listings', () => ({
  getListingById: vi.fn(),
  updateListing: vi.fn(async () => {}),
  deleteListing: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/stagings', () => ({
  clearListingIdOnStagings: vi.fn(async () => {}),
}));

import { GET, PATCH, DELETE } from '@/app/api/listings/[id]/route';
import { getSession } from '@/lib/auth/session';
import { getListingById, updateListing, deleteListing } from '@/lib/db/listings';
import { clearListingIdOnStagings } from '@/lib/db/stagings';

const session = { user: { id: 'u1' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session as any);
});

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/listings/l1', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}
const ctx = (id: string) => ({ params: { id } });

describe('GET /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await GET(req('GET'), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await GET(req('GET'), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('200 with listing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1', name: 'A' } as any);
    const res = await GET(req('GET'), ctx('l1'));
    expect(res.status).toBe(200);
    expect((await res.json()).listing.id).toBe('l1');
  });
});

describe('PATCH /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await PATCH(req('PATCH', { name: 'X' }), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when listing missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await PATCH(req('PATCH', { name: 'X' }), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('200 + updateListing called', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1', name: 'Old' } as any);
    const res = await PATCH(req('PATCH', { name: 'New' }), ctx('l1'));
    expect(res.status).toBe(200);
    expect(updateListing).toHaveBeenCalledWith('u1', 'l1', { name: 'New' });
  });
});

describe('DELETE /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await DELETE(req('DELETE'), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await DELETE(req('DELETE'), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('clears listingId on stagings then deletes', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any);
    const res = await DELETE(req('DELETE'), ctx('l1'));
    expect(res.status).toBe(200);
    expect(clearListingIdOnStagings).toHaveBeenCalledWith('u1', 'l1');
    expect(deleteListing).toHaveBeenCalledWith('u1', 'l1');
    // Order matters: clear first so a failure doesn't leave orphans pointing at a dead id
    const clearOrder = vi.mocked(clearListingIdOnStagings).mock.invocationCallOrder[0];
    const delOrder = vi.mocked(deleteListing).mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(delOrder);
  });
});
