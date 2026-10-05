import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { addCredits } from '@/lib/db/users';
import { ADMIN_EMAILS } from '@/types';

export const dynamic = 'force-dynamic';

const schema = z.object({
  amount: z.number().int().positive().max(10000),
  reason: z.string().min(3).max(200),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { userId } = params;
  const { amount, reason } = parsed.data;

  try {
    await addCredits(userId, amount);
  } catch (err) {
    if (err instanceof Error && err.message === 'User not found') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw err;
  }

  // Audit log line — CloudWatch prepends timestamp.
  console.log('[admin-credits-grant]', {
    adminEmail: session.user.email,
    targetUserId: userId,
    amount,
    reason,
  });

  return NextResponse.json({ success: true });
}
