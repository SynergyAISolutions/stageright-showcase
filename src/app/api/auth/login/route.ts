import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signIn } from '@/lib/aws/cognito';
import { setAuthCookies } from '@/lib/auth/cookies';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface MappedError {
  status: number;
  error: string;
  code: string;
}

const INCORRECT: MappedError = {
  status: 401,
  error: 'Incorrect email or password.',
  code: 'incorrect_credentials',
};
const RATE_LIMITED: MappedError = {
  status: 429,
  error: 'Too many attempts. Wait a little while and try again.',
  code: 'rate_limited',
};

// Keyed by Cognito error name. UserNotFoundException deliberately shares the
// wrong-password response so the login form never reveals whether an account
// exists.
const COGNITO_ERRORS: Record<string, MappedError> = {
  NotAuthorizedException: INCORRECT,
  UserNotFoundException: INCORRECT,
  UserNotConfirmedException: {
    status: 403,
    error: 'This email has not been confirmed yet. Use the code we emailed you when you signed up.',
    code: 'user_not_confirmed',
  },
  PasswordResetRequiredException: {
    status: 403,
    error: 'Your password needs to be reset. Use "Forgot password?" to set a new one.',
    code: 'password_reset_required',
  },
  LimitExceededException: RATE_LIMITED,
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

  const { email, password } = parsed.data;

  try {
    const result = await signIn(email, password);
    const auth = result.AuthenticationResult;

    if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
      console.error('[login] signIn returned incomplete tokens', {
        challenge: result.ChallengeName ?? null,
      });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const response = NextResponse.json({ message: 'Logged in' });
    setAuthCookies(response, {
      AccessToken: auth.AccessToken,
      IdToken: auth.IdToken,
      RefreshToken: auth.RefreshToken,
      ExpiresIn: auth.ExpiresIn,
    });
    return response;
  } catch (err: unknown) {
    const name = errorName(err);
    const mapped = Object.prototype.hasOwnProperty.call(COGNITO_ERRORS, name)
      ? COGNITO_ERRORS[name]
      : undefined;
    if (mapped) {
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
    }
    console.error('[login] signIn failed:', name);
    return NextResponse.json(
      { error: 'Something went wrong. Try again shortly.', code: 'server_error' },
      { status: 500 },
    );
  }
}
