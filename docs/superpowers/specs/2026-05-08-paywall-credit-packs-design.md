# Paywall — credit packs (v1) — design spec

**Date:** 2026-05-08
**Status:** Approved, ready for implementation plan
**Brief:** Wire Stripe Checkout for the four locked credit packs (Starter / Plus / Pro / Bulk). Subscriptions, customer portal, and refund flows are explicitly out-of-scope for this PR — they ship as a v2.

---

## Why

StageRight currently runs free-tier-only: every signup gets 14 free credits and there is no top-up path. The wizard's `/stage` notes step shows an "Out of credits" card with the placeholder copy "Paid plans launching soon" when `user.creditsRemaining < styles.length`, and the server enforces a 402 on `/api/stage/batch` as defence-in-depth. This PR replaces the placeholder with a working payment flow so users can buy more credits when they hit the wall, and so Tara has revenue.

## Scope

In:
- Stripe Checkout integration (hosted payment page) for four credit packs.
- A reusable `<PackTiles />` component rendered inline in the "Out of credits" card and standalone on a new authenticated `/pricing` page.
- A header-level entry point: clicking the credit balance pill routes authenticated users to `/pricing` for proactive top-ups.
- Webhook handler with signature verification, idempotency, atomic credit grants.
- Success page with polling-until-credits-visible UX, then bounces back to the originating surface.
- Host-aware gate plumbing: every payment surface goes through one boolean check that reads a server-side flag. Today the flag is always "web" (surfaces visible). When the future TWA wrapper ships, that wrapper passes a signal that flips the flag to "twa" for those requests, hiding all payment surfaces in one shot.
- `tax_behavior: 'inclusive'` on each Stripe price (the AUD prices already contain GST; no separate tax line on checkout).

Out:
- Subscriptions (Monthly 25, Monthly 75) — separate v2 PR.
- Stripe Customer Portal — only matters once subs exist.
- Stripe Tax — `tax_behavior: 'inclusive'` is sufficient for AU-only B2C launch. Switch to Stripe Tax later when international or B2B emerges.
- Discount codes / promo codes.
- Failed-payment dunning emails — no recurring charges = no recurring failures.
- Refund handling — manual via Stripe dashboard for v1.
- Australian Consumer Law cancellation/refund disclosure copy in the checkout flow itself — Tara's separate copy task.
- Receipt emails — Stripe's default receipt at the account level is sufficient.
- Live testing of the host gate — no TWA wrapper exists yet to test against. The plumbing is built and unit-testable; full integration test happens when the wrapper ships.

## Architecture

### High-level flow

```
1. User clicks pack tile (in /stage out-of-credits card OR /pricing)
2. POST /api/checkout/create-session { packId } → returns Stripe-hosted URL
3. Browser redirects to Stripe Checkout (stripe.com)
4. User pays
5. Stripe POSTs checkout.session.completed → /api/webhooks/stripe
6. Webhook verifies signature → idempotent check → addCredits() → 200
7. Stripe redirects browser to /checkout/success?session_id=…&return_to=…
8. Success page polls /api/auth/me every 2s until creditsRemaining > pre-purchase value
9. Bounces back to return_to (defaults to /dashboard)
```

The webhook is the source of truth for granting credits — never the redirect URL. The redirect is just a UX prompt to come back to our site; the credit grant happens server-side via the signed webhook.

### Idempotency

`/api/webhooks/stripe` stores every processed `event.id` in DynamoDB with a 30-day TTL. Stripe will retry any event we don't 200 within ~3 seconds, sometimes for hours. Without the dedup table, retries would double-grant credits. With it, retries are no-ops.

```
pk: STRIPE_EVENT#evt_<id>
sk: processed
ttl: now + 30 days
```

### After-purchase UX

`/checkout/success` is a small page that:
- Reads the initial credit balance from `useAuth()` on mount.
- Polls `/api/auth/me` every 2 seconds.
- When `creditsRemaining` increases, shows a one-second "X credits added — continuing…" beat then `router.push(return_to)`.
- After 30 seconds with no balance increase, falls back to "We're confirming your purchase. You'll receive an email when it lands." with a manual "continue anyway" button to `return_to`. (This handles the rare case where Stripe webhook delivery is genuinely delayed; the credits will still arrive eventually via the asynchronous webhook.)

### Cancel UX

`/checkout/cancel` immediately redirects the user to `return_to` (default `/dashboard`). No credits granted, no charge attempted.

### Host gate (plumbing only for v1)

The contract for the future TWA wrapper: when a request comes from inside the wrapper, the wrapper signals "I am a TWA" via a cookie (`sr_host=twa`) set on first launch by the wrapper's startup code. Server-side middleware reads the cookie and exposes the host context as a server-injected boolean.

For v1 (no wrapper yet):
- The cookie never gets set.
- `getRequestHostContext()` returns `'web'` for every request.
- `isWebPaymentAllowed()` returns `true` for every render.
- All payment surfaces render normally.

When the wrapper ships:
- Wrapper passes `?sr_host=twa` on first launch URL.
- Tiny client snippet captures the param and writes the cookie.
- Server-side `getRequestHostContext()` now returns `'twa'` for those requests.
- `isWebPaymentAllowed()` returns `false` → every payment surface hides automatically.
- No paywall code touched.

### Files to create

- `src/lib/stripe/server.ts` — Stripe SDK client singleton, env access via `@/env`.
- `src/lib/stripe/products.ts` — pack catalog: id, credits, displayPrice (AUD), Stripe price ID (env-keyed). Single source of truth for what's purchasable.
- `src/lib/db/credits.ts` — `addCredits(userId, amount, source)` and idempotency helpers (`hasProcessedStripeEvent`, `markStripeEventProcessed`).
- `src/lib/billing/host-gate.ts` — `getRequestHostContext()` (server-side, reads cookie) and `isWebPaymentAllowed()` (boolean wrapper).
- `src/app/api/checkout/create-session/route.ts` — POST endpoint creating Checkout Session.
- `src/app/api/webhooks/stripe/route.ts` — webhook handler. Uses `request.text()` (raw body required for Stripe signature verification — Next.js App Router quirk).
- `src/app/checkout/success/page.tsx` — success page with polling.
- `src/app/checkout/cancel/page.tsx` — cancel page.
- `src/app/pricing/page.tsx` — authenticated pricing surface. Anonymous visitors who land here are redirected to `/onboarding` (matching the marketing-CTA flow we just shipped) — they sign up, walk the free trial, and can return to `/pricing` to top up.
- `src/components/billing/pack-tiles.tsx` — reusable inline tiles. Four cards (Starter / Plus / Pro / Bulk). Each card has the pack details and a click handler that POSTs to `/api/checkout/create-session` with the relevant `packId` then `window.location.href = url`.

### Files to modify

- `src/app/stage/page.tsx` — in the out-of-credits card, replace the "Paid plans launching soon" copy with `<PackTiles returnTo="/stage?…" />`. Keep the brand-teal card chrome.
- `src/components/staging/credit-balance.tsx` — make the pill a clickable link to `/pricing` when `isWebPaymentAllowed()` is true. When false (future TWA), render as a non-interactive label.
- `src/lib/db/users.ts` — add `stripeCustomerId?: string` to the User shape (set on first purchase, reused on subsequent purchases so Stripe groups the customer's history).
- `src/types/index.ts` — `Pack` type definition.
- `src/env.ts` — register the four pack price ID env vars: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BULK`. Plus `STRIPE_WEBHOOK_SECRET` if not already present.

## Data shapes

### Pack catalog (`src/lib/stripe/products.ts`)

```typescript
export const PACKS = {
  starter: { id: 'starter', label: 'Starter', credits: 20, priceAud: 24, priceId: env.STRIPE_PRICE_STARTER },
  plus:    { id: 'plus',    label: 'Plus',    credits: 50, priceAud: 49, priceId: env.STRIPE_PRICE_PLUS },
  pro:     { id: 'pro',     label: 'Pro',     credits: 125, priceAud: 99, priceId: env.STRIPE_PRICE_PRO },
  bulk:    { id: 'bulk',    label: 'Bulk',    credits: 300, priceAud: 219, priceId: env.STRIPE_PRICE_BULK },
} as const;

export type PackId = keyof typeof PACKS;
```

### Stripe Checkout Session config

```typescript
{
  mode: 'payment',
  line_items: [{ price: pack.priceId, quantity: 1 }],
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
  payment_method_types: ['card'],
  // Apple Pay / Google Pay are auto-included; no extra config needed
}
```

### Webhook handler logic

```
1. Read raw body via request.text()
2. Verify signature with stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
   → on signature failure: return 400
3. Switch on event.type:
   - 'checkout.session.completed':
     a. If hasProcessedStripeEvent(event.id) → return 200 (dedup)
     b. Extract session.metadata.userId, .credits, .packId, session.customer
     c. await addCredits(userId, Number(credits), source: 'purchase')
     d. If session.customer && !user.stripeCustomerId → persist on User record
     e. await markStripeEventProcessed(event.id)
     f. return 200
   - other events: return 200 (we don't care)
4. On any thrown error inside the switch: return 500 → Stripe retries
```

### `addCredits` semantics

Atomic DDB update on the User record:
```
UpdateExpression: 'SET creditsRemaining = creditsRemaining + :amount, updatedAt = :now'
```

The `source` argument (`'purchase'` / `'bonus'` / `'admin'`) is a string passed only for `console.log` audit trails today — not persisted. If a separate ledger becomes useful later, it slots in here without changing call sites.

## Edge cases

| Case | Behaviour |
|---|---|
| User closes browser mid-purchase but actually paid | Webhook still lands, credits granted server-side. They see the new balance next time `/api/auth/me` runs (e.g., next page load). |
| Stripe webhook arrives before browser hits success page | Success page reads new balance on first poll, transitions immediately. |
| Browser hits success page before webhook lands | Polling continues at 2s intervals. Typical webhook latency is sub-second so this resolves quickly. |
| Webhook signature fails | 400. Stripe stops retrying that event. Investigation prompt. |
| User pays, webhook lands, DB write fails | 500 returned. Stripe retries. On retry success: idempotency table catches duplicate, no double-grant. |
| User cancels on Stripe page | `/checkout/cancel` → `router.push(return_to)`. No charge. |
| Card declined | User stays on Stripe page, can retry or cancel. We never see a webhook. No state change. |
| User refreshes success page mid-poll | Initial balance re-reads, polling restarts. Eventually still resolves. |
| Webhook never lands (Stripe outage) | Success page falls back to "we're confirming, you'll receive an email" after 30s. Credits still grant whenever the webhook eventually does land. |
| Discount/promo codes | Out of scope. v1 has no promo support. |

## Risks

1. **Webhook signature secret rotation.** If we ever regenerate the secret in Stripe dashboard, all in-flight webhooks fail until env vars update. Standard ops; document in deployment guide.

2. **Pricing changes.** If we change a pack's price in Stripe, we must update both the dashboard and the env-var-mapped price ID. The pack catalog in code is the source of truth for displayed prices; Stripe is the source of truth for billed prices. They MUST agree. Locked pricing in CLAUDE.md is currently stable, but if Tara ever wants to change prices, the process is: update Stripe → create new price object → swap the env var → redeploy. Old price ID stays valid for in-flight checkouts.

3. **GST handling correctness.** `tax_behavior: 'inclusive'` means the AUD price the user sees IS what they pay (no separate tax line). Tara remits 10% of revenue to ATO via BAS. If Tara ever sells to an international customer, this becomes wrong (no GST owed) — switch to Stripe Tax then.

4. **The host gate is plumbing-only — never tested live in v1.** When the TWA wrapper ships, the contract is "set the `sr_host=twa` cookie." If the wrapper sets a different cookie name or uses a different mechanism, the gate doesn't activate and Google rejects the app. Mitigation: the TWA wrapper PR's first task should be a manual integration test of the gate.

5. **No refund automation.** A user who wants a refund emails Tara → Tara processes via Stripe dashboard → Stripe sends `charge.refunded` webhook (which we currently ignore). The refunded credits are NOT auto-removed from their balance. For v1 Tara handles the credit deduction manually too (admin tooling exists for credit adjustments). Acceptable for low refund volume.

## Success criteria

- A logged-in user with zero credits sees four pack tiles in the "Out of credits" card. Clicking any tile takes them to a Stripe-hosted page, paying succeeds, and they return to `/stage` with the purchased credits visible.
- The same flow works from `/pricing` (proactive top-up).
- Refreshing or closing the browser mid-purchase doesn't double-grant or strand the user.
- Webhook idempotency: replaying the same `event.id` twice grants credits exactly once.
- Stripe signature verification: requests not signed by Stripe's secret return 400.
- The credit pill in the header routes to `/pricing` when clicked.
- `tax_behavior: 'inclusive'` is set on every pack price; the user sees a single "Total: $X.XX" line on Stripe Checkout matching the pack tile price.
- Host gate boolean returns `'web'` everywhere today; flipping the cookie to `sr_host=twa` (manually via devtools) hides every payment surface, including the credit pill click target.
- `npm run type-check` passes; `npm run build` passes locally.
