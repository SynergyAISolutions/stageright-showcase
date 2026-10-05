import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { forgotPassword } from '@/lib/aws/cognito';
import { errorName } from '@/lib/auth/error-name';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().email(),
});

const GENERIC_OK = { message: 'If an account exists for that email, a code is on its way.' };

// Cognito errors that must look identical to success, so the response never
// reveals whether an account exists (or is unverified, or is rate limited).
const SILENT_ERRORS = new Set([
  'UserNotFoundException',
  'InvalidParameterException',
  'NotAuthorizedException',
  'LimitExceededException',
  'TooManyRequestsException',
  'CodeDeliveryFailureException',
]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  try {
    await forgotPassword(parsed.data.email);
    return NextResponse.json(GENERIC_OK);
  } catch (err: unknown) {
    const name = errorName(err);
    console.error('[forgot-password] Cognito error:', name);
    if (SILENT_ERRORS.has(name)) {
      return NextResponse.json(GENERIC_OK);
    }
    return NextResponse.json({ error: 'Something went wrong. Try again shortly.' }, { status: 500 });
  }
}
