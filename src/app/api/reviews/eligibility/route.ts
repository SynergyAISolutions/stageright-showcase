import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStagingSession } from '@/lib/db/staging-sessions';
import {
  checkEligibility,
  countUserPending,
  userAlreadyFlaggedSession,
} from '@/lib/db/flag-reviews';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const stagingSession = await getStagingSession(sessionId);
  if (!stagingSession) return NextResponse.json({ eligible: false, reason: 'not-found' });

  const secondsSinceResult = Math.floor(
    (Date.now() - new Date(stagingSession.createdAt).getTime()) / 1000
  );

  const [pending, dup] = await Promise.all([
    countUserPending(session.user.id),
    userAlreadyFlaggedSession(session.user.id, sessionId),
  ]);
  const elig = checkEligibility({
    sessionId,
    userId: session.user.id,
    session: stagingSession,
    userPendingCount: pending,
    duplicateExists: dup,
    secondsSinceResult,
  });
  return NextResponse.json(elig);
}
