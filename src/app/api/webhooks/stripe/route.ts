import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { env } from '@/env';
import { addCreditsForStripeEvent, getUserById, updateUser } from '@/lib/db/users';
import { getPack } from '@/lib/stripe/products';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const creditsRaw = session.metadata?.credits;
  const packId = session.metadata?.packId;

  if (!userId || !creditsRaw || !packId) {
    console.error('[stripe-webhook] missing metadata', { userId, creditsRaw, packId, eventId: event.id });
    return NextResponse.json({ error: 'Invalid session metadata' }, { status: 400 });
  }

  const credits = Number(creditsRaw);
  if (!Number.isFinite(credits) || credits <= 0) {
    console.error('[stripe-webhook] invalid credits in metadata', { creditsRaw, eventId: event.id });
    return NextResponse.json({ error: 'Invalid credits' }, { status: 400 });
  }

  // Defence-in-depth: cross-validate metadata.credits against the catalog. The
  // signature attests the metadata wasn't tampered in transit, but anyone with
  // Stripe API access could plant a Checkout Session with arbitrary credits.
  // The pack catalog is the only authority for what each pack is worth.
  const pack = getPack(packId);
  if (!pack || pack.credits !== credits) {
    console.error('[stripe-webhook] credits/packId mismatch', { packId, credits, expected: pack?.credits, eventId: event.id });
    return NextResponse.json({ error: 'Credits do not match pack catalog' }, { status: 400 });
  }

  let alreadyProcessed = false;
  try {
    const result = await addCreditsForStripeEvent({
      userId,
      amount: credits,
      stripeEventId: event.id,
    });
    alreadyProcessed = result.alreadyProcessed;
  } catch (err) {
    console.error('[stripe-webhook] credit grant failed', { eventId: event.id, userId, credits, err });
    throw err; // re-throw so Next.js returns 500 and Stripe retries
  }

  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduped: true });
  }

  // Persist stripeCustomerId on first purchase so subsequent checkouts reuse it.
  // Runs only on the winning grant (we already returned for dedup hits above).
  // Failure here is non-fatal — credit was granted, customer ID is just an
  // optimisation for future checkouts.
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;
  if (customerId) {
    try {
      const user = await getUserById(userId);
      if (user && !user.stripeCustomerId) {
        await updateUser(userId, { stripeCustomerId: customerId });
      }
    } catch (err) {
      console.error('[stripe-webhook] stripeCustomerId persist failed (non-fatal)', { eventId: event.id, userId, err });
    }
  }

  return NextResponse.json({ received: true, credits });
}
