import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/aws/cognito', () => ({
  confirmSignUp: vi.fn(async () => undefined),
  signIn: vi.fn(async () => ({
    AuthenticationResult: {
      AccessToken: 'at', IdToken: 'idt', RefreshToken: 'rt', ExpiresIn: 3600,
    },
  })),
}));

import { POST } from '@/app/api/auth/confirm/route';
import { confirmSignUp, signIn } from '@/lib/aws/cognito';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const RAW_COGNITO_TEXT = 'Invalid verification code provided. leaked@example.com';

function cognitoError(name: string): Error {
  const err = new Error(RAW_COGNITO_TEXT);
  err.name = name;
  return err;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/auth/confirm', () => {
  it('400 on invalid input', async () => {
    const res = await POST(makeReq({ email: 'not-email' }));
    expect(res.status).toBe(400);
  });

  it('confirms then signs in when password is provided', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456', password: 'SuperSecret1!' }));
    expect(res.status).toBe(200);
    expect(confirmSignUp).toHaveBeenCalledWith('a@b.com', '123456');
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'SuperSecret1!');
    const body = await res.json();
    expect(body.redirectTo).toBe('/onboarding');
    const setCookies = res.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((c) => c.startsWith('sr_access_token='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sr_id_token='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sr_refresh_token='))).toBe(true);
  });

  it('200 without auto-login when password is omitted (fallback)', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456' }));
    expect(res.status).toBe(200);
    expect(confirmSignUp).toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.redirectTo).toBeUndefined();
  });

  it('falls back when sign-in returns incomplete tokens', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(signIn).mockResolvedValueOnce({
      AuthenticationResult: { AccessToken: 'at', ExpiresIn: 3600 },
    } as any);
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456', password: 'SuperSecret1!' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBeUndefined();
    const setCookies = res.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((c) => c.startsWith('sr_access_token='))).toBe(false);
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('a@b.com');
    errSpy.mockRestore();
  });

  it('treats a sign-in failure after a successful confirm as confirmed, not as an error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456', password: 'SuperSecret1!' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(RAW_COGNITO_TEXT);
    errSpy.mockRestore();
  });

  it.each([
    ['CodeMismatchException', 400, 'code_mismatch'],
    ['ExpiredCodeException', 400, 'code_expired'],
    ['NotAuthorizedException', 400, 'already_confirmed'],
    ['TooManyFailedAttemptsException', 429, 'rate_limited'],
    ['InternalErrorException', 500, 'server_error'],
  ])('maps confirmSignUp %s to %i without raw Cognito text', async (name, status, code) => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(confirmSignUp).mockRejectedValueOnce(cognitoError(name));
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456', password: 'SuperSecret1!' }));
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(RAW_COGNITO_TEXT);
    expect(signIn).not.toHaveBeenCalled();
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
    expect(logged).not.toContain('a@b.com');
    errSpy.mockRestore();
  });

  it('gives an unknown email the same response as a wrong code', async () => {
    vi.mocked(confirmSignUp).mockRejectedValueOnce(cognitoError('CodeMismatchException'));
    const wrongCode = await (await POST(makeReq({ email: 'a@b.com', code: '123456' }))).json();
    vi.mocked(confirmSignUp).mockRejectedValueOnce(cognitoError('UserNotFoundException'));
    const unknown = await (await POST(makeReq({ email: 'a@b.com', code: '123456' }))).json();
    expect(unknown).toEqual(wrongCode);
  });
});
