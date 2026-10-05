import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getSession = vi.fn();
vi.mock('@/lib/auth/session', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

const addCredits = vi.fn();
vi.mock('@/lib/db/users', () => ({
  addCredits: (...args: unknown[]) => addCredits(...args),
}));

vi.mock('@/types', () => ({
  ADMIN_EMAILS: ['admin@example.com'],
}));

import { POST } from '@/app/api/admin/users/[userId]/credits/route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/u1/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  addCredits.mockReset();
});

describe('POST /api/admin/users/[userId]/credits', () => {
  it('401 when no session', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(401);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('403 when session user is not an admin', async () => {
    getSession.mockResolvedValue({ user: { id: 'x', email: 'someone@example.com' } });
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(403);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when amount is missing', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when reason is too short', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ amount: 50, reason: 'no' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when amount is not a positive integer', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ amount: -5, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('200 happy path — calls addCredits and returns success', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    addCredits.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalledWith('u1', 50);
  });

  it('email check is case-insensitive', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'ADMIN@example.com' } });
    addCredits.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalled();
  });
});
