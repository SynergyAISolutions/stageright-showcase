import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStagingSession } from '@/lib/db/staging-sessions';
import {
  checkEligibility,
  countUserPending,
  createFlagReview,
  userAlreadyFlaggedSession,
} from '@/lib/db/flag-reviews';
import { sendAdminNewFlagEmail } from '@/lib/email/flag-emails';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sessionId, userNote } = body as {
    sessionId?: string; userNote?: string;
  };
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const stagingSession = await getStagingSession(sessionId);
  if (!stagingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

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
  if (!elig.eligible) return NextResponse.json({ error: 'Not eligible', reason: elig.reason }, { status: 400 });

  const stagedS3Key = stagingSession.turns
    .filter((t) => t.role === 'model' && t.imageS3Key)
    .pop()?.imageS3Key || '';

  const review = await createFlagReview({
    userId: session.user.id,
    userEmail: session.user.email,
    sessionId,
    originalS3Key: stagingSession.heroS3Key,
    stagedS3Key,
    style: stagingSession.style,
    roomTypes: stagingSession.roomTypes,
    userNote: userNote?.slice(0, 500),
  });

  await sendAdminNewFlagEmail(review).catch((err) => {
    console.error('sendAdminNewFlagEmail failed', { reviewId: review.id, err });
  });

  return NextResponse.json({ reviewId: review.id, status: review.status });
}
