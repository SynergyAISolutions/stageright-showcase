import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmForgotPassword, signIn } from '@/lib/aws/cognito';
import { setAuthCookies } from '@/lib/auth/cookies';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const PASSWORD_POLICY_MESSAGE =
  'Use at least 8 characters with an uppercase letter, a lowercase letter and a number.';
const GENERIC_ERROR = 'Something went wrong. Try again shortly.';

// Field order matters: the first failing field decides the message.
const schema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  // Mirrors the live Cognito pool policy: min 8, upper, lower, digit; no
  // symbol requirement.
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/\d/),
});

type Field = 'email' | 'code' | 'password';

const FIELD_ERRORS: Record<Field, { error: string; code: string }> = {
  email: { error: 'Enter a valid email address.', code: 'invalid_input' },
  code: { error: 'Enter the 6-digit code from the email.', code: 'invalid_code_format' },
  password: { error: PASSWORD_POLICY_MESSAGE, code: 'invalid_password' },
};

const FIELD_ORDER: Field[] = ['email', 'code', 'password'];

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
    error: 'That code has expired. Send a new one and try again.',
    code: 'code_expired',
  },
  InvalidPasswordException: { status: 400, error: PASSWORD_POLICY_MESSAGE, code: 'invalid_password' },
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
    const failing = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    // A non-object body has no field paths; treat it as an email failure.
    const field = FIELD_ORDER.find((f) => failing.has(f)) ?? 'email';
    return NextResponse.json(FIELD_ERRORS[field], { status: 400 });
  }

  const { email, code, password } = parsed.data;

  try {
    await confirmForgotPassword(email, code, password);
  } catch (err: unknown) {
    const name = errorName(err);
    const mapped = Object.prototype.hasOwnProperty.call(COGNITO_ERRORS, name)
      ? COGNITO_ERRORS[name]
      : undefined;
    if (mapped) {
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
    }
    console.error('[reset-password] confirmForgotPassword failed:', name);
    return NextResponse.json({ error: GENERIC_ERROR, code: 'server_error' }, { status: 500 });
  }

  // The reset has succeeded from here on. Sign-in is a convenience: if it
  // fails, the user is told to log in, never that the reset failed.
  const loggedOutSuccess = { message: 'Password updated. You can now log in.' };

  try {
    const result = await signIn(email, password);
    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth.IdToken || !auth.RefreshToken) {
      console.error('[reset-password] signIn returned incomplete tokens', {
        challenge: result.ChallengeName ?? null,
        hasAccess: !!auth?.AccessToken,
        hasId: !!auth?.IdToken,
        hasRefresh: !!auth?.RefreshToken,
      });
      return NextResponse.json(loggedOutSuccess);
    }

    const response = NextResponse.json({ message: 'Password updated', redirectTo: '/dashboard' });
    setAuthCookies(response, {
      AccessToken: auth.AccessToken,
      IdToken: auth.IdToken,
      RefreshToken: auth.RefreshToken,
      ExpiresIn: auth.ExpiresIn,
    });
    return response;
  } catch (err: unknown) {
    console.error('[reset-password] signIn after reset failed:', errorName(err));
    return NextResponse.json(loggedOutSuccess);
  }
}
