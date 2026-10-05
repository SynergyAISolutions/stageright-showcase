import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/aws/cognito', () => ({
  forgotPassword: vi.fn(async () => ({})),
}));

import { POST } from '@/app/api/auth/forgot-password/route';
import { forgotPassword } from '@/lib/aws/cognito';

const GENERIC_OK = { message: 'If an account exists for that email, a code is on its way.' };
const RAW_COGNITO_TEXT = 'Username/client id combination not found for leaked@example.com';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
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

describe('POST /api/auth/forgot-password', () => {
  it('200 with the generic message on success', async () => {
    const res = await POST(makeReq({ email: '  a@b.com ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(GENERIC_OK);
    expect(forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it.each([
    'UserNotFoundException',
    'InvalidParameterException',
    'NotAuthorizedException',
    'LimitExceededException',
    'TooManyRequestsException',
    'CodeDeliveryFailureException',
  ])('%s returns a response identical to success (no enumeration)', async (name) => {
    const okRes = await POST(makeReq({ email: 'a@b.com' }));
    const okBody = await okRes.text();

    vi.mocked(forgotPassword).mockRejectedValueOnce(cognitoError(name));
    const res = await POST(makeReq({ email: 'a@b.com' }));
    const body = await res.text();

    expect(res.status).toBe(okRes.status);
    expect(body).toBe(okBody);
    expect(JSON.parse(body)).toEqual(GENERIC_OK);
    expect(body).not.toContain(RAW_COGNITO_TEXT);
  });

  it('logs only the error name, never the email or raw message', async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(cognitoError('UserNotFoundException'));
    await POST(makeReq({ email: 'secret@example.com' }));
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.flat().map((v) => String(v)).join(' ');
    expect(logged).toContain('UserNotFoundException');
    expect(logged).not.toContain('secret@example.com');
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
  });

  it('500 with a generic message on an unexpected error', async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: 'Something went wrong. Try again shortly.' });
    expect(body).not.toContain(RAW_COGNITO_TEXT);
  });

  it('500 when a non-Error value is thrown', async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce('boom');
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(500);
  });

  it('400 on a malformed email and does not call Cognito', async () => {
    const res = await POST(makeReq({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter a valid email address.' });
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('400 on a missing body field and does not call Cognito', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('400 on a non-JSON body and does not call Cognito', async () => {
    const req = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(forgotPassword).not.toHaveBeenCalled();
  });
});
