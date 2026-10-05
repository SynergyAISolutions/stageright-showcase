import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { markOnboardingComplete } from '@/lib/db/users';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await markOnboardingComplete(session.user.id);
  return NextResponse.json({ success: true });
}
