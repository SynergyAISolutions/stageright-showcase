import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resendConfirmationCode } from '@/lib/aws/cognito';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
});

const RESENT = { message: 'Confirmation code resent.' };

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

// Keyed by Cognito error name. UserNotFoundException is answered like a
// success (see POST) so unknown emails are not revealed.
const COGNITO_ERRORS: Record<string, MappedError> = {
  // Cognito raises this when the account is already confirmed.
  InvalidParameterException: {
    status: 400,
    error: 'This email is already confirmed. Log in to continue.',
    code: 'already_confirmed',
  },
  CodeDeliveryFailureException: {
    status: 502,
    error: 'We could not send the code. Check the address and try again.',
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
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  try {
    await resendConfirmationCode(parsed.data.email);
    return NextResponse.json(RESENT);
  } catch (err: unknown) {
    const name = errorName(err);
    if (name === 'UserNotFoundException') {
      return NextResponse.json(RESENT);
    }
    const mapped = Object.prototype.hasOwnProperty.call(COGNITO_ERRORS, name)
      ? COGNITO_ERRORS[name]
      : undefined;
    if (mapped) {
      return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
    }
    console.error('[resend-code] resendConfirmationCode failed:', name);
    return NextResponse.json(
      { error: 'Something went wrong. Try again shortly.', code: 'server_error' },
      { status: 500 },
    );
  }
}
