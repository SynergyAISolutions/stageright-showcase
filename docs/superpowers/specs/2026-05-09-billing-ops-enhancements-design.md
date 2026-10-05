# Billing operations enhancements — design spec

**Date:** 2026-05-09
**Status:** Approved, ready for implementation plan
**Brief:** Three small additions on top of the just-shipped paywall plus a manual config walkthrough to flip Stripe to live mode.

---

## Why

The paywall ships in test mode with no operational tooling around it. Tara needs three things before she'll be comfortable taking it live:

1. **Self-grant credits without paying through Stripe** — so she can keep generating test accounts and example listings without the ceremony of a Stripe Checkout round-trip every time.
2. **Hand out promo codes** — so a friend / early-access agent / marketing partner can be given a free pack with a code they enter at checkout.
3. **Customers can see their own billing history** — the user menu already advertises "Billing & invoices" with a "SOON" badge; the obvious shape is Stripe's hosted Customer Portal.

Then she flips Stripe to live mode (manual config, no code change) so real cards charge real money.

## Scope

In:
- **A.** Admin "give credits" tool at `/admin/users` (admin-gated). List users, add credits with a required reason. No delete, no edit-other-fields.
- **B.** Enable Stripe promo codes on Checkout Sessions (one-line config). Tara creates codes in the Stripe dashboard.
- **D.** Stripe Customer Portal wiring. New `POST /api/billing/portal` returns a one-time portal URL; user-menu "Billing & invoices" item links to it. Disabled (with copy: "Make a purchase first") when the user has no `stripeCustomerId`.
- **C.** Manual walkthrough for flipping Stripe to live mode (products, prices, keys, webhook). No code change.

Out:
- Subscriptions (deferred to v2 paywall).
- Custom in-app invoice UI (the Stripe-hosted portal handles this).
- Bulk credit grants (tara wants the UI per-user; we'll YAGNI bulk).
- Editing or removing credits via admin (Tara's explicit constraint).
- Stripe Tax (still off — see paywall spec).
- Migrating existing test-mode purchases to live mode (test purchases are throwaway; nobody bought anything real yet).

## Architecture

### A. Admin "give credits" tool

**Page:** `src/app/admin/users/page.tsx` — server component. Auth-gated (existing admin layout at `src/app/admin/layout.tsx` already checks `ADMIN_EMAILS`). Server-side fetches all User records via a DDB scan filtered to `pk` starting with `USER#` and `sk = 'PROFILE'`, returns sorted by `updatedAt` desc.

**Table columns:** email · name · plan · creditsRemaining · creditsUsedAllTime · last active (relative time from `updatedAt`) · `+` button.

**Search:** plain text input, client-side filter on email substring (case-insensitive). For the current user count this is fine; if the table grows beyond ~500 users we revisit with server-side search. Sort: stable by `updatedAt` desc.

**Add-credits modal:** triggered by row's `+` button. Two fields:
- Number input (label: "Credits to add", min 1, max 10000)
- Required text field "Reason" (min 3 chars; e.g., "Test account", "Friend gift", "Refund for issue #42")

Submit → `POST /api/admin/users/[userId]/credits` with `{ amount, reason }`.

**API route** `src/app/api/admin/users/[userId]/credits/route.ts`:
- Server-side admin gate (reads session, checks `ADMIN_EMAILS.includes(email)`)
- Zod schema for body
- Calls existing `addCredits(userId, amount)` in `users.ts`
- `console.log('[admin-credits-grant]', { adminEmail, targetUserId, amount, reason, timestamp })` — single-line audit log to CloudWatch
- Returns `{ creditsRemaining: <new total> }` for optimistic UI update

**Audit ledger (deliberately omitted):** for v1 the `console.log` line is the only audit trail. If it ever matters operationally we add a `CREDIT_GRANT#` DDB record in a follow-up. YAGNI for now.

### B. Stripe promo codes

**Single change** in `src/app/api/checkout/create-session/route.ts`: add `allow_promotion_codes: true` to the `stripe.checkout.sessions.create({...})` payload. Stripe's hosted Checkout page now renders an "Add promotion code" field.

Tara creates codes in the Stripe dashboard:
- Coupons → create a 100% off coupon
- Promotion codes → create a code (e.g. `FRIEND100`) that uses the coupon
- Limits per use, per customer, by date, by minimum amount — all configured in Stripe, no code on our side.

For 100% off purchases, Stripe still fires `checkout.session.completed` with `amount_total: 0`. Our existing webhook handler grants credits regardless of amount. Confirmed by inspection of `src/app/api/webhooks/stripe/route.ts` — it reads `metadata.credits`, not `amount_total`.

### D. Stripe Customer Portal

**New API route:** `src/app/api/billing/portal/route.ts` (POST).
- Auth-gated (requires session)
- Looks up user, requires `user.stripeCustomerId` (returns 400 with `{ error: 'no_customer' }` if missing)
- Calls `stripe.billingPortal.sessions.create({ customer, return_url: <origin>/dashboard })` and returns `{ url }`
- Client redirects via `window.location.href = url`

**User-menu update** in `src/components/dashboard/user-menu.tsx`:
- "Billing & invoices" item: replace `stubClick('Billing')` with a real handler.
- If `user.stripeCustomerId` is set → button POSTs to `/api/billing/portal` and redirects.
- If not set → button shows a small inline tooltip / disabled state with copy *"Make a purchase first."* (Just a `disabled` attribute + a soft tooltip is fine.)
- Drop the `SOON` badge.

**Customer Portal config (Tara, in Stripe dashboard, one-time):**
- Test mode AND live mode (separate configs)
- Settings → Billing → Customer portal:
  - **Business information:** business name "StageRight" or "AI Wave", support email
  - **Functionality:**
    - ✅ Invoice history
    - ✅ Update payment method
    - ❌ Update subscriptions (we don't have subs yet)
    - ❌ Cancel subscriptions (same)
    - ❌ Update billing address (optional, off for simplicity)
  - **Branding:** logo + colors (optional)
- Save. Stripe surfaces what we've enabled; nothing else.

### C. Live-mode Stripe rerun (no code, manual walkthrough)

Sequence Tara performs:

1. **Stripe dashboard top-right toggle → Live mode.**
2. **Re-create the four products in live mode** (same names: Starter / Plus / Pro / Bulk; same AUD prices: 24/49/99/219; tax behavior `unspecified`). Copy each new live `price_…` ID.
3. **Live API keys page** (https://dashboard.stripe.com/apikeys — note: NO `/test/`): copy `pk_live_…` and reveal-then-copy `sk_live_…`.
4. **Live webhooks** (https://dashboard.stripe.com/webhooks): create endpoint at `https://master.d88xgpqlfkk1w.amplifyapp.com/api/webhooks/stripe`, event `checkout.session.completed`, copy the live signing secret (`whsec_…`).
5. **Live Customer Portal config** — repeat the toggles from D's "Customer Portal config" section, but in live mode.
6. **Amplify env vars** — overwrite all 7 STRIPE_* values:
   - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BULK` → live price IDs
   - `STRIPE_SECRET_KEY` → `sk_live_…`
   - `STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
   - `STRIPE_WEBHOOK_SECRET` → live `whsec_…`
7. **Wait for Amplify build** (env-var save triggers rebuild).
8. **Smoke test with a real card** — Tara buys Starter ($24) on her own account, verifies credits land. Refunds via Stripe dashboard if she wants the money back.

No code change ships with C. The same `next.config.mjs` env block + static `process.env.X` lookups already in the codebase mean live values flow through cleanly — same pattern that works in test mode.

## Files

**New:**
- `src/app/admin/users/page.tsx` — admin user table
- `src/app/admin/users/users-table.tsx` — `'use client'` table + search + modal (split from the server-component page)
- `src/app/admin/users/add-credits-modal.tsx` — modal component
- `src/app/api/admin/users/[userId]/credits/route.ts` — POST credit grant
- `src/app/api/billing/portal/route.ts` — POST portal session
- `tests/api/admin-users-credits.test.ts` — webhook-style admin route test (auth + happy path + invalid input + non-admin rejection)

**Modified:**
- `src/app/api/checkout/create-session/route.ts` — add `allow_promotion_codes: true`
- `src/components/dashboard/user-menu.tsx` — wire Billing & invoices to portal API; drop SOON badge

**Untouched:**
- `src/lib/db/users.ts` — `addCredits` already exists, reusable as-is
- `src/app/admin/layout.tsx` — existing admin auth gate, no change

## Data shapes

### Admin user list (server-component fetch)

```typescript
type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  creditsRemaining: number;
  creditsUsedAllTime: number;
  updatedAt: string; // ISO
  stripeCustomerId?: string;
};
```

DDB query: scan with `FilterExpression: 'sk = :sk AND begins_with(pk, :pkPrefix)'` where `:sk = 'PROFILE'` and `:pkPrefix = 'USER#'`. Project only the fields above. Sort client-side by `updatedAt` desc.

### Admin credit-grant request

```typescript
{
  amount: number;     // 1..10000, integer
  reason: string;     // min 3 chars, max 200
}
```

### Audit log line (CloudWatch)

```
[admin-credits-grant] adminEmail=tara@aiwave.com.au targetUserId=abc-123 amount=50 reason="Test account"
```

CloudWatch prepends the timestamp on every log line; no need to include it in the message.

## Edge cases

| Case | Behaviour |
|---|---|
| Admin grants credits to themselves | Allowed. Logged like any other grant. |
| Non-admin hits `POST /api/admin/users/[userId]/credits` directly | 403. Server-side `ADMIN_EMAILS` check. |
| Admin grants credits to a userId that doesn't exist | `addCredits` already throws "User not found" → caught, returns 404. |
| User opens portal without `stripeCustomerId` | Modal shows disabled state with "Make a purchase first." Doesn't hit the API. |
| User has `stripeCustomerId` but Stripe rejects (deleted customer, etc.) | API returns 502 with the Stripe error message. Toast in user-menu, no crash. |
| Promo code applied → 100% off → $0 charge | Stripe still fires `checkout.session.completed`. Webhook grants credits same as paid. |
| Promo code applied to subscription (future) | Out of scope — subs aren't shipping in this PR. |
| Live-mode flip with stale Lambda warm containers serving test-mode env | New build invalidates Lambda containers. Per the env-propagation memory, static dot-notation in `env.ts` means values are baked in at build time. Fresh build = fresh values. |

## Risks

1. **Customer Portal config drift between test and live modes.** The portal needs to be configured TWICE (once in test, once in live). Easy to forget the live-mode toggles and end up with a portal that reveals nothing useful.
2. **Promo-code abuse.** A 100% off code that leaks publicly costs Tara real credits-worth of compute. Mitigation: she sets per-customer / total-redemption limits in Stripe when creating each code.
3. **Admin credit grants are not idempotent.** Clicking submit twice grants twice. Mitigation: disable the submit button while POST in flight + close the modal on success. (Same pattern PackTiles uses.)
4. **DDB scan cost on the admin user list.** Negligible at the current user count (~dozens). If scaling becomes a concern, switch to GSI1 (email index) with pagination.
5. **Customer Portal session-URL is single-use.** If user clicks the link, leaves the portal, then clicks the user-menu link again → fresh portal session needed. Our flow always creates a fresh one, so this is fine but means a brief delay each click.

## Success criteria

- Admin visits `/admin/users` → sees a table of all users → searches by email → clicks `+` on `tara+200@aiwave.com.au` → adds 25 credits with reason "Test grant" → modal closes, table updates to show new balance, CloudWatch log line emitted.
- Non-admin gets 403 from the `/api/admin/users/[userId]/credits` endpoint.
- Stripe Checkout page now shows "Add promotion code" field. Creating a 100% off code in Stripe dashboard, applying it during a Plus checkout, results in $0 charge AND credits granted on the user.
- User with `stripeCustomerId` clicks "Billing & invoices" → redirects to Stripe-hosted portal → can see invoices and update payment method.
- User without `stripeCustomerId` sees the "Make a purchase first" disabled state.
- After live-mode flip: Tara's own real card buys Starter ($24), credits land. Stripe live-mode logs show the charge.
- `npm run type-check` passes; `npm run build` passes locally.

## Test plan

Per-PR tests:

**A + B PR:**
- vitest: `tests/api/admin-users-credits.test.ts` covering: no auth → 401, non-admin auth → 403, admin auth + valid body → 200 + addCredits called, admin auth + missing reason → 400, admin auth + non-existent userId → 404
- Manual browser: `/admin/users` renders, search works, modal works, balance updates after grant, audit line in CloudWatch, non-admin redirected by existing layout gate
- Manual Stripe: create a promo code in dashboard, complete a Checkout flow with it, confirm $0 amount + credits granted

**D PR:**
- Manual browser: user with `stripeCustomerId` → portal opens. User without → disabled state.
- Manual Stripe: confirm the portal config matches what's specified

**C walkthrough:**
- Tara executes the 8-step sequence above.
- Smoke test with one real card purchase.
