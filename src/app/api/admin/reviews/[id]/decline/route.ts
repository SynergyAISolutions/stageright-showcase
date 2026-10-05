import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getFlagReview, updateReviewStatus, isConditionalFailure } from '@/lib/db/flag-reviews';
import { sendUserDeclinedEmail } from '@/lib/email/flag-emails';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const review = await getFlagReview(params.id);
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { adminNote } = body as { adminNote?: string };
  const trimmedNote = adminNote?.slice(0, 500);

  let updated;
  try {
    updated = await updateReviewStatus(params.id, {
      status: 'declined',
      adminNote: trimmedNote,
      resolvedBy: session.user.email.toLowerCase(),
      creditRefunded: false,
    });
  } catch (err) {
    if (isConditionalFailure(err)) {
      return NextResponse.json({ error: 'Already resolved' }, { status: 409 });
    }
    throw err;
  }

  sendUserDeclinedEmail(review.userEmail, trimmedNote).catch((err) => {
    console.error('sendUserDeclinedEmail failed', { reviewId: review.id, err });
  });

  return NextResponse.json({ review: updated });
}
