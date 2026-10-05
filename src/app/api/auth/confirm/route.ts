import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmSignUp, signIn } from '@/lib/aws/cognito';
import { setAuthCookies } from '@/lib/auth/cookies';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  password: z.string().min(1).optional(),
});

interface MappedError {
  status: number;
  error: string;
  code: string;
}

const CODE_MISMATCH: MappedError = {
  status: 400,
  error: 'That code is not right. Check the email and try again.',
  code: 'code_mismatch',
};
const RATE_LIMITED: MappedError = {
  status: 429,
  error: 'Too many attempts. Wait a little while and try again.',
  code: 'rate_limited',
};

// Keyed by Cognito error name. UserNotFoundException deliberately shares the
// code-mismatch response so unknown emails are not revealed.
const COGNITO_ERRORS: Record<string, MappedError> = {
  CodeMismatchException: CODE_MISMATCH,
  UserNotFoundException: CODE_MISMATCH,
  ExpiredCodeException: {
    status: 400,
    error: 'That code has expired. Request a new code and try again.',
    code: 'code_expired',
  },
  // Cognito raises this when the account is already confirmed.
  NotAuthorizedException: {
    status: 400,
    error: 'This email is already confirmed. Log in to continue.',
    code: 'already_confirmed',
  },
  LimitExceededException: RATE_LIMITED,
  TooManyFailedAttemptsException: RATE_LIMITED,
  TooManyRequestsException: RATE_LIMITED,
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { email, code, password } = parsed.data;

  try {
    await confirmSignUp(email, code);
  } catch (err: unknown) {
    const name = errorName(err);
    const mapped = Object.prototype.hasOwnProperty.call(COGNITO_ERRORS, name)
      ? COGNITO_ERRORS[name]
      : undefined;
    if (mapped) {
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
    }
    console.error('[confirm] confirmSignUp failed:', name);
    return NextResponse.json(
      { error: 'Something went wrong. Try again shortly.', code: 'server_error' },
      { status: 500 },
    );
  }

  // Confirmation has succeeded from here on. Sign-in is a convenience: if it
  // fails, the user is told to log in, never that confirmation failed.
  const loggedOutSuccess = { message: 'Email confirmed. You can now log in.' };

  if (!password) {
    return NextResponse.json(loggedOutSuccess);
  }

  try {
    const result = await signIn(email, password);
    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
      // Can happen if the user pool gets MFA / password-change challenges
      // enabled. Log so it surfaces instead of silently degrading to the
      // fallback card.
      console.error('[confirm] signIn returned incomplete tokens', {
        challenge: result.ChallengeName ?? null,
        hasAccess: !!auth?.AccessToken,
        hasId: !!auth?.IdToken,
        hasRefresh: !!auth?.RefreshToken,
      });
      return NextResponse.json(loggedOutSuccess);
    }

    const response = NextResponse.json({
      message: 'Email confirmed',
      redirectTo: '/onboarding',
    });
    setAuthCookies(response, {
      AccessToken: auth.AccessToken,
      IdToken: auth.IdToken,
      RefreshToken: auth.RefreshToken,
      ExpiresIn: auth.ExpiresIn,
    });
    return response;
  } catch (err: unknown) {
    console.error('[confirm] signIn after confirm failed:', errorName(err));
    return NextResponse.json(loggedOutSuccess);
  }
}
