import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { listAllUsers } from '@/lib/db/users';
import { ADMIN_EMAILS } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await listAllUsers();
  // Project only what the admin page needs — drop verbose internal fields.
  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    creditsRemaining: u.creditsRemaining,
    creditsUsedAllTime: u.creditsUsedAllTime,
    updatedAt: u.updatedAt,
    stripeCustomerId: u.stripeCustomerId ?? null,
  }));
  // Most-recently-active first.
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ users: rows });
}
