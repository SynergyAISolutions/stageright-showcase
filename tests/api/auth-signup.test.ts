import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/aws/cognito', () => ({
  signUp: vi.fn(async () => ({})),
}));

import { POST } from '@/app/api/auth/signup/route';
import { signUp } from '@/lib/aws/cognito';

const RAW_COGNITO_TEXT = 'An account with the given email already exists. leaked@example.com';
const VALID = { email: 'a@b.com', password: 'Passw0rd', name: 'Ann' };

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function cognitoError(name: string): Error {
  const err = new Error(RAW_COGNITO_TEXT);
  err.name = name;
  return err;
}

let errSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
});

describe('POST /api/auth/signup', () => {
  it('400 on invalid input', async () => {
    const res = await POST(makeReq({ ...VALID, password: 'short' }));
    expect(res.status).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('200 on success', async () => {
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    expect(signUp).toHaveBeenCalledWith('a@b.com', 'Passw0rd', 'Ann');
  });

  it('keeps 409 for an existing email (the onboarding screen branches on it)', async () => {
    vi.mocked(signUp).mockRejectedValueOnce(cognitoError('UsernameExistsException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This email already has an account.');
  });

  it.each([
    ['InvalidPasswordException', 400, 'invalid_password'],
    ['InvalidParameterException', 400, 'invalid_input'],
    ['CodeDeliveryFailureException', 502, 'code_delivery_failed'],
    ['TooManyRequestsException', 429, 'rate_limited'],
    ['InternalErrorException', 500, 'server_error'],
  ])('maps %s to %i', async (name, status, code) => {
    vi.mocked(signUp).mockRejectedValueOnce(cognitoError(name));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(RAW_COGNITO_TEXT);
  });

  it('logs only the error name', async () => {
    vi.mocked(signUp).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    await POST(makeReq(VALID));
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).toContain('InternalErrorException');
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
    expect(logged).not.toContain('a@b.com');
  });
});
