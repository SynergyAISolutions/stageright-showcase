import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { NextRequest } from 'next/server';
import type { InitiateAuthCommandOutput } from '@aws-sdk/client-cognito-identity-provider';

vi.mock('@/lib/aws/cognito', () => ({
  signIn: vi.fn(async () => ({
    AuthenticationResult: {
      AccessToken: 'at', IdToken: 'idt', RefreshToken: 'rt', ExpiresIn: 3600,
    },
  })),
}));

import { POST } from '@/app/api/auth/login/route';
import { signIn } from '@/lib/aws/cognito';

const RAW_COGNITO_TEXT = 'User does not exist. leaked@example.com';
const VALID = { email: 'a@b.com', password: 'Passw0rd' };

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
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

describe('POST /api/auth/login', () => {
  it('400 on invalid input', async () => {
    const res = await POST(makeReq({ email: 'nope', password: 'x' }));
    expect(res.status).toBe(400);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('400 on a malformed JSON body', async () => {
    const res = await POST(makeReq('{not json'));
    expect(res.status).toBe(400);
  });

  it('sets all three auth cookies with the expected options on success', async () => {
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(200);
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'Passw0rd');
    const cookies = res.headers.getSetCookie?.() ?? [];
    const access = cookies.find((c) => c.startsWith('sr_access_token='));
    const refresh = cookies.find((c) => c.startsWith('sr_refresh_token='));
    expect(access).toMatch(/Max-Age=3600/);
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/Secure/);
    expect(access).toMatch(/SameSite=lax/i);
    expect(access).toMatch(/Path=\//);
    expect(cookies.some((c) => c.startsWith('sr_id_token='))).toBe(true);
    expect(refresh).toMatch(/Max-Age=2592000/);
  });

  it('gives a wrong password and an unknown email the identical response', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('NotAuthorizedException'));
    const wrongPassword = await POST(makeReq(VALID));
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('UserNotFoundException'));
    const unknownUser = await POST(makeReq(VALID));

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    const a = await wrongPassword.json();
    const b = await unknownUser.json();
    expect(a).toEqual(b);
    expect(a.error).toBe('Incorrect email or password.');
  });

  it('keeps a distinct message for an unconfirmed account', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('UserNotConfirmedException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('user_not_confirmed');
    expect(body.error).toMatch(/not been confirmed/);
  });

  it('points a user whose password must be reset to Forgot password', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('PasswordResetRequiredException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('password_reset_required');
    expect(body.error).toMatch(/Forgot password/);
  });

  it('maps rate limiting to 429', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('TooManyRequestsException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(429);
  });

  it('never returns raw Cognito text, and logs only the error name', async () => {
    for (const name of ['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException', 'InternalErrorException']) {
      vi.mocked(signIn).mockRejectedValueOnce(cognitoError(name));
      const res = await POST(makeReq(VALID));
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain(RAW_COGNITO_TEXT);
      expect(text).not.toContain('leaked@example.com');
    }
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).not.toContain(RAW_COGNITO_TEXT);
    expect(logged).not.toContain('a@b.com');
    expect(logged).toContain('InternalErrorException');
  });

  it('500 with generic copy on an unexpected Cognito error', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(cognitoError('InternalErrorException'));
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('server_error');
  });

  it('401 without cookies when Cognito returns a challenge instead of tokens', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      $metadata: {},
    } as InitiateAuthCommandOutput);
    const res = await POST(makeReq(VALID));
    expect(res.status).toBe(401);
    expect((res.headers.getSetCookie?.() ?? []).length).toBe(0);
  });
});
