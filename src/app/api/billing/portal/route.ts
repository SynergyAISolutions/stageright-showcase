import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { getStripe } from '@/lib/stripe/server';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!user.stripeCustomerId) {
    // The user-menu disables the link in this case, but server-side check
    // remains as defence-in-depth.
    return NextResponse.json({ error: 'no_customer' }, { status: 400 });
  }

  const stripe = getStripe();
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe portal session failed';
    console.error('[billing-portal] Stripe error', { userId: user.id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
