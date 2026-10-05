import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { NextRequest } from 'next/server';
import type { InitiateAuthCommandOutput } from '@aws-sdk/client-cognito-identity-provider';

vi.mock('@/lib/aws/cognito', () => ({
  confirmForgotPassword: vi.fn(async () => ({})),
  signIn: vi.fn(async () => ({
    AuthenticationResult: {
      AccessToken: 'at', IdToken: 'idt', RefreshToken: 'rt', ExpiresIn: 3600,
    },
  })),
}));

import { POST } from '@/app/api/auth/reset-password/route';
import { confirmForgotPassword, signIn } from '@/lib/aws/cognito';

const RAW_COGNITO_TEXT = 'Invalid verification code provided, please try again. leaked@example.com';
const POLICY_MSG = 'Use at least 8 characters with an uppercase letter, a lowercase letter and a number.';
const VALID = { email: 'a@b.com', code: '123456', password: 'NewPassw0rd' };

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/reset-password', {
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

function cookieNames(res: Response): string[] {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split('=')[0]);
}

let errSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errSpy.mockRestore();
});

describe('POST /api/auth/reset-password: validation', () => {
  it.each([
    [{ ...VALID, email: 'nope' }, 'Enter a valid email address.', 'invalid_input'],
    [{ ...VALID, email: undefined }, 'Enter a valid email address.', 'invalid_input'],
    [{ ...VALID, code: '12345' }, 'Enter the 6-digit code from the email.', 'invalid_code_format'],
    [{ ...VALID, code: '12a456' }, 'Enter the 6-digit code from the email.', 'invalid_code_format'],
    [{ ...VALID, code: '1234567' }, 'Enter the 6-digit code from the email.', 'invalid_code_format'],
    [{ ...VALID, password: 'Short1' }, POLICY_MSG, 'invalid_password'],
    [{ ...VALID, password: 'alllowercase1' }, POLICY_MSG, 'invalid_password'],
    [{ ...VALID, password: 'ALLUPPERCASE1' }, POLICY_MSG, 'invalid_password'],
    [{ ...VALID, password: 'NoDigitsHere' }, POLICY_MSG, 'invalid_password'],
  ])('400 for %j', async (body, error, code) => {
    const res = await POST(makeReq(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error, code });
    expect(confirmForgotPassword).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('reports the email error first when several fields fail', async () => {
    const res = await POST(makeReq({ email: 'x', code: 'x', password: 'x' }));
    expect(await res.json()).toEqual({ error: 'Enter a valid email address.', code: 'invalid_input' });
  });

  it('trims the email and code before calling Cognito', async () => {
    const res = await POST(makeReq({ email: ' a@b.com ', code: ' 123456 ', password: 'NewPassw0rd' }));
    expect(res.status).toBe(200);
    expect(confirmForgotPassword).toHaveBeenCalledWith('a@b.com', '123456', 'NewPassw0rd');
  });

  it('400 on a non-JSON body and does not call Cognito', async () => {
    const req = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(confirmForgotPassword).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/reset-password: Cognito error mapping', () => {
  it.each([
    ['CodeMismatchException', 400, 'That code is not right. Check the email and try again.', 'code_mismatch'],
    ['UserNotFoundException', 400, 'That code is not right. Check the email and try again.', 'code_mismatch'],
    ['ExpiredCodeException', 400, 'That code has expired. Send a new one and try again.', 'code_expired'],
    ['InvalidPasswordException', 400, POLICY_MSG, 'invalid_password'],
    ['LimitExceededException', 429, 'Too many attempts. Wait a little while and try again.', 'rate_limited'],
    ['TooManyFailedAttemptsException', 429, 'Too many attempts. Wait a little while and try again.', 'rate_limited'],
    ['TooManyRequestsException', 429, 'Too many attempts. Wait a little while and try again.', 'rate_limited'],
    ['InternalErrorException', 500, 'Something went wrong. Try again shortly.', 'server_error'],
  ])('%s maps to %i', async (name, status, error, code) => {
    vi.mocked(confirmForgotPassword).mockRejectedValueOnce(cognitoError(name));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(status);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error, code });
    expect(text).not.toContain(RAW_COGNITO_TEXT);
    expect(signIn).not.toHaveBeenCalled();
    expect(cookieNames(res)).toEqual([]);
  });

  it('UserNotFoundException and CodeMismatchException produce identical responses', async () => {
    vi.mocked(confirmForgotPassword).mockRejectedValueOnce(cognitoError('CodeMismatchException'));
    const a = await POST(makeReq(VALID));
    vi.mocked(confirmForgotPassword).mockRejectedValueOnce(cognitoError('UserNotFoundException'));
    const b = await POST(makeReq(VALID));
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });

  it('logs the name of an unexpected error and not the raw message', async () => {
    vi.mocked(confirmForgotPassword).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    await POST(makeReq(VALID));
    const logged = errSpy.mock.calls.flat().map((v) => String(v)).join(' ');
    expect(logged).toContain('InternalErrorException');
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
  });

  it('500 server_error when a non-Error value is thrown', async () => {
    vi.mocked(confirmForgotPassword).mockRejectedValueOnce('boom');
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('server_error');
  });
});

describe('POST /api/auth/reset-password: success and sign-in', () => {
  it('signs in, sets all three cookies and redirects to /dashboard', async () => {
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    expect(confirmForgotPassword).toHaveBeenCalledWith('a@b.com', '123456', 'NewPassw0rd');
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'NewPassw0rd');
    expect(await res.json()).toEqual({ message: 'Password updated', redirectTo: '/dashboard' });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const access = setCookies.find((c) => c.startsWith('sr_access_token='));
    const id = setCookies.find((c) => c.startsWith('sr_id_token='));
    const refresh = setCookies.find((c) => c.startsWith('sr_refresh_token='));
    expect(access).toBeDefined();
    expect(id).toBeDefined();
    expect(refresh).toBeDefined();
    for (const c of [access, id, refresh]) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/Secure/i);
      expect(c).toMatch(/SameSite=lax/i);
      expect(c).toMatch(/Path=\//);
    }
    expect(access).toMatch(/Max-Age=3600/);
    expect(refresh).toMatch(/Max-Age=2592000/);
  });

  it('defaults the access cookie max-age to 3600 when ExpiresIn is missing', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      AuthenticationResult: { AccessToken: 'at', IdToken: 'idt', RefreshToken: 'rt' },
      $metadata: {},
    } satisfies InitiateAuthCommandOutput);
    const res = await POST(makeReq(VALID));
    const access = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('sr_access_token='));
    expect(access).toMatch(/Max-Age=3600/);
  });

  it('still reports success (no redirect, no cookies) when signIn throws', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('NotAuthorizedException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Password updated. You can now log in.' });
    expect(body.redirectTo).toBeUndefined();
    expect(cookieNames(res)).toEqual([]);
    const logged = errSpy.mock.calls.flat().map((v) => String(v)).join(' ');
    expect(logged).toContain('NotAuthorizedException');
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
  });

  it('still reports success (no redirect, no cookies) when signIn returns incomplete tokens', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      AuthenticationResult: { AccessToken: 'at', ExpiresIn: 3600 },
      $metadata: {},
    } satisfies InitiateAuthCommandOutput);
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'Password updated. You can now log in.' });
    expect(cookieNames(res)).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });

  it('still reports success when signIn returns a challenge and no AuthenticationResult', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      $metadata: {},
    } satisfies InitiateAuthCommandOutput);
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    expect((await res.json()).redirectTo).toBeUndefined();
    expect(cookieNames(res)).toEqual([]);
  });
});
