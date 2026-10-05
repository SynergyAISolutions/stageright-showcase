import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { getStripe } from '@/lib/stripe/server';
import { getPack } from '@/lib/stripe/products';
import { getPackPriceId } from '@/lib/stripe/products-server';
import { isWebPaymentAllowedServer } from '@/lib/billing/host-gate-server';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

const schema = z.object({
  packId: z.string().min(1),
  returnTo: z.string().startsWith('/').optional(),
});

export async function POST(request: NextRequest) {
  try {
  if (!isWebPaymentAllowedServer()) {
    return NextResponse.json({ error: 'Web payment unavailable' }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const pack = getPack(parsed.data.packId);
  if (!pack) {
    return NextResponse.json({ error: 'Unknown pack' }, { status: 400 });
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const returnTo = parsed.data.returnTo ?? '/dashboard';
  const origin = env.NEXT_PUBLIC_APP_URL;

  const stripe = getStripe();
  let checkoutSession;
  try {
    checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
      // Force Stripe to create a Customer for every one-time purchase. Default
      // ('if_required') skips customer creation for plain card payments, which
      // means session.customer is null in our webhook and we never persist
      // stripeCustomerId — breaking the Customer Portal for that user.
      customer_creation: 'always',
      // Auto-create a Stripe Invoice for each one-time purchase. Without this
      // the portal's "Invoice history" tab is empty for pack buyers — Stripe
      // only auto-generates Invoices for subscriptions; one-time Charges don't
      // show up unless we opt in here. The customer gets a downloadable PDF
      // invoice email, and the portal lists every past purchase.
      invoice_creation: { enabled: true },
      line_items: [{ price: getPackPriceId(pack.id), quantity: 1 }],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        packId: pack.id,
        credits: String(pack.credits),
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&return_to=${encodeURIComponent(returnTo)}`,
      cancel_url: `${origin}${returnTo}`,
      // No payment_method_types — Stripe auto-enables card + Apple Pay + Google
      // Pay + Link based on the account config. Pinning to ['card'] suppresses
      // the wallets and hurts mobile conversion.
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe checkout creation failed';
    console.error('[create-session] Stripe error', { packId: pack.id, userId: user.id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!checkoutSession.url) {
    return NextResponse.json({ error: 'Stripe did not return a URL' }, { status: 502 });
  }

  return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[create-session] unhandled error', { message });
    return NextResponse.json({ error: `unhandled: ${message}` }, { status: 500 });
  }
}
