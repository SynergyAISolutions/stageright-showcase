import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/aws/cognito', () => ({
  resendConfirmationCode: vi.fn(async () => ({})),
}));

import { POST } from '@/app/api/auth/resend-code/route';
import { resendConfirmationCode } from '@/lib/aws/cognito';

const RAW_COGNITO_TEXT = 'Username/client id combination not found. leaked@example.com';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/resend-code', {
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

describe('POST /api/auth/resend-code', () => {
  it('400 on invalid input', async () => {
    const res = await POST(makeReq({ email: 'nope' }));
    expect(res.status).toBe(400);
    expect(resendConfirmationCode).not.toHaveBeenCalled();
  });

  it('200 on success', async () => {
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(resendConfirmationCode).toHaveBeenCalledWith('a@b.com');
  });

  it('answers an unknown email exactly like a success', async () => {
    const ok = await (await POST(makeReq({ email: 'a@b.com' }))).json();
    vi.mocked(resendConfirmationCode).mockRejectedValueOnce(cognitoError('UserNotFoundException'));
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ok);
  });

  it.each([
    ['InvalidParameterException', 400, 'already_confirmed'],
    ['CodeDeliveryFailureException', 502, 'code_delivery_failed'],
    ['LimitExceededException', 429, 'rate_limited'],
    ['InternalErrorException', 500, 'server_error'],
  ])('maps %s to %i', async (name, status, code) => {
    vi.mocked(resendConfirmationCode).mockRejectedValueOnce(cognitoError(name));
    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(RAW_COGNITO_TEXT);
  });

  it('logs only the error name', async () => {
    vi.mocked(resendConfirmationCode).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    await POST(makeReq({ email: 'a@b.com' }));
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).toContain('InternalErrorException');
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
    expect(logged).not.toContain('a@b.com');
  });
});
