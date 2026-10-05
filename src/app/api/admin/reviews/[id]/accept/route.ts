import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getFlagReview, updateReviewStatus, isConditionalFailure } from '@/lib/db/flag-reviews';
import { addCredits } from '@/lib/db/users';
import { sendUserAcceptedEmail } from '@/lib/email/flag-emails';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const review = await getFlagReview(params.id);
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 400 });

  let updated;
  try {
    updated = await updateReviewStatus(params.id, {
      status: 'accepted',
      resolvedBy: session.user.email.toLowerCase(),
      creditRefunded: true,
    });
  } catch (err) {
    if (isConditionalFailure(err)) {
      return NextResponse.json({ error: 'Already resolved' }, { status: 409 });
    }
    throw err;
  }

  await addCredits(review.userId, 1);

  sendUserAcceptedEmail(review.userEmail).catch((err) => {
    console.error('sendUserAcceptedEmail failed', { reviewId: review.id, err });
  });

  return NextResponse.json({ review: updated });
}
