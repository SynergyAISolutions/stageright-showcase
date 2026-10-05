import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/aws/cognito';
import { getUserById, createUser } from '@/lib/db/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('sr_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ user: null, reason: 'no_cookie' }, { status: 401 });
    }

    // Step 1: Get Cognito user
    let cognitoUser;
    try {
      cognitoUser = await getCurrentUser(accessToken);
    } catch (err) {
      return NextResponse.json({
        user: null,
        reason: 'cognito_failed',
        error: err instanceof Error ? err.message : 'Unknown',
      }, { status: 401 });
    }

    const attrs = cognitoUser.UserAttributes || [];
    const sub = attrs.find((a) => a.Name === 'sub')?.Value;
    const email = attrs.find((a) => a.Name === 'email')?.Value;
    const name = attrs.find((a) => a.Name === 'name')?.Value;

    if (!sub || !email) {
      return NextResponse.json({ user: null, reason: 'missing_attrs', sub: !!sub, email: !!email }, { status: 401 });
    }

    // Step 2: Get or create DynamoDB user
    let user;
    try {
      user = await getUserById(sub);
      if (!user) {
        user = await createUser({ email, name: name || email, cognitoSub: sub });
      }
    } catch (err) {
      return NextResponse.json({
        user: null,
        reason: 'dynamodb_failed',
        error: err instanceof Error ? err.message : 'Unknown',
      }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        sub: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        creditsRemaining: user.creditsRemaining,
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        hasStripeCustomer: !!user.stripeCustomerId,
      },
    });
  } catch (err) {
    return NextResponse.json({
      user: null,
      reason: 'unexpected',
      error: err instanceof Error ? err.message : 'Unknown',
    }, { status: 500 });
  }
}
