import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { listPendingReviews } from '@/lib/db/flag-reviews';

export async function GET() {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const reviews = await listPendingReviews();
  return NextResponse.json({ reviews });
}
