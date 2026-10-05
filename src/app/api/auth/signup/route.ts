import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signUp } from '@/lib/aws/cognito';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

interface MappedError {
  status: number;
  error: string;
  code: string;
}

const RATE_LIMITED: MappedError = {
  status: 429,
  error: 'Too many attempts. Wait a little while and try again.',
  code: 'rate_limited',
};

// Keyed by Cognito error name. The 409 status for an existing email is what
// the onboarding signup screen branches on; keep it.
const COGNITO_ERRORS: Record<string, MappedError> = {
  UsernameExistsException: {
    status: 409,
    error: 'This email already has an account.',
    code: 'email_exists',
  },
  InvalidPasswordException: {
    status: 400,
    error: 'Use at least 8 characters with an uppercase letter, a lowercase letter and a number.',
    code: 'invalid_password',
  },
  InvalidParameterException: {
    status: 400,
    error: 'Check your details and try again.',
    code: 'invalid_input',
  },
  CodeDeliveryFailureException: {
    status: 502,
    error: 'We could not send the confirmation email. Check the address and try again.',
    code: 'code_delivery_failed',
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
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  try {
    await signUp(email, password, name);
    return NextResponse.json({ message: 'Check your email for a confirmation code.' });
  } catch (err: unknown) {
    const errName = errorName(err);
    const mapped = Object.prototype.hasOwnProperty.call(COGNITO_ERRORS, errName)
      ? COGNITO_ERRORS[errName]
      : undefined;
    if (mapped) {
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
    }
    console.error('[signup] signUp failed:', errName);
    return NextResponse.json(
      { error: 'Something went wrong. Try again shortly.', code: 'server_error' },
      { status: 500 },
    );
  }
}
