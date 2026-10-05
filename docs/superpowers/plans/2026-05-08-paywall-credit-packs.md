# Paywall — credit packs (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Stripe Checkout for the four locked credit packs (Starter / Plus / Pro / Bulk) so users can buy more credits when they hit the "Out of credits" wall, and so Tara has revenue.

**Architecture:** Stripe Checkout (hosted) + signed webhook for the credit grant + idempotency via a per-event DDB record. Reusable `<PackTiles />` component renders inline in the `/stage` out-of-credits card and standalone on a new authenticated `/pricing` page. Host gate plumbing in place for the future Play Store wrapper but inactive in v1.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Stripe Node SDK v17, AWS DynamoDB, vitest for tests.

**Spec:** `docs/superpowers/specs/2026-05-08-paywall-credit-packs-design.md`

---

## File map

**New:**
- `src/lib/stripe/server.ts` — Stripe SDK client singleton.
- `src/lib/stripe/products.ts` — `PACKS` catalog (single source of truth for what's purchasable).
- `src/lib/db/stripe-events.ts` — webhook idempotency helpers.
- `src/lib/billing/host-gate-server.ts` — server-side host context detection.
- `src/lib/billing/host-gate-client.ts` — client-side host context hook.
- `src/app/api/checkout/create-session/route.ts` — POST endpoint creating Stripe Checkout Session.
- `src/app/api/webhooks/stripe/route.ts` — webhook handler (raw body, signature verification, idempotency, addCredits).
- `src/app/checkout/success/page.tsx` — return URL with polling.
- `src/app/checkout/cancel/page.tsx` — cancel return URL.
- `src/app/pricing/page.tsx` — authenticated pricing surface.
- `src/components/billing/pack-tiles.tsx` — reusable inline pack tiles component.
- `tests/api/webhooks-stripe.test.ts` — webhook handler tests.
- `tests/lib/stripe/products.test.ts` — pack catalog completeness test.
- `tests/lib/billing/host-gate.test.ts` — host gate test.

**Modified:**
- `src/env.ts` — register `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BULK`.
- `src/app/stage/page.tsx` — replace the "Paid plans launching soon" block (currently `~lines 856-889`) with `<PackTiles />`.
- `src/components/layout/app-header.tsx` — wrap `<CreditBalance />` in a `<Link href="/pricing">` when `isWebPaymentAllowed`.

**Untouched:**
- `src/lib/db/users.ts` — `addCredits(userId, amount)` already exists and is sufficient for v1 (race window is negligible — Stripe Checkout takes 10+ seconds, user can't trigger two simultaneous purchases).
- `src/types/index.ts` — `User.stripeCustomerId?: string` already declared.
- `src/components/staging/credit-balance.tsx` — pill stays a pure visual component; clickability is composed at the parent (header).

---

## Task 1: Stripe price IDs in env, Stripe client, pack catalog

**Files:**
- Modify: `src/env.ts`
- Create: `src/lib/stripe/server.ts`
- Create: `src/lib/stripe/products.ts`

- [ ] **Step 1: Add price-ID env vars to `src/env.ts`**

In `src/env.ts`, find the `// --- Stripe ---` section (currently lines 60-69) and add four price-ID getters under the existing trio:

```typescript
  // --- Stripe ---
  get STRIPE_SECRET_KEY() {
    return getRequiredEnvVar('STRIPE_SECRET_KEY');
  },
  get STRIPE_PUBLISHABLE_KEY() {
    return getRequiredEnvVar('STRIPE_PUBLISHABLE_KEY');
  },
  get STRIPE_WEBHOOK_SECRET() {
    return getRequiredEnvVar('STRIPE_WEBHOOK_SECRET');
  },
  get STRIPE_PRICE_STARTER() {
    return getRequiredEnvVar('STRIPE_PRICE_STARTER');
  },
  get STRIPE_PRICE_PLUS() {
    return getRequiredEnvVar('STRIPE_PRICE_PLUS');
  },
  get STRIPE_PRICE_PRO() {
    return getRequiredEnvVar('STRIPE_PRICE_PRO');
  },
  get STRIPE_PRICE_BULK() {
    return getRequiredEnvVar('STRIPE_PRICE_BULK');
  },
```

- [ ] **Step 2: Create `src/lib/stripe/server.ts`**

```typescript
/**
 * Singleton Stripe SDK client. Server-only — never import from a 'use client'
 * file (env.STRIPE_SECRET_KEY would throw and the secret would otherwise risk
 * shipping to the browser bundle).
 */
import Stripe from 'stripe';
import { env } from '@/env';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });
  return _stripe;
}
```

- [ ] **Step 3: Create `src/lib/stripe/products.ts`**

```typescript
/**
 * Single source of truth for purchasable credit packs.
 *
 * The displayed price (priceAud) is what the user sees on the tile and on
 * Stripe Checkout. The Stripe price object referenced by priceId MUST be
 * configured with the same AUD amount and `tax_behavior: 'inclusive'` —
 * i.e. the user pays exactly priceAud (GST is folded in).
 *
 * If a price ever changes: update it in Stripe (creating a new price object),
 * then swap the env var pointing at the new price ID, then redeploy. Do NOT
 * mutate this file's priceAud without doing the Stripe-side change.
 */
import { env } from '@/env';

export type PackId = 'starter' | 'plus' | 'pro' | 'bulk';

export type Pack = {
  id: PackId;
  label: string;
  credits: number;
  priceAud: number;
  /** Stripe Price object ID (price_…) */
  priceId: string;
};

export const PACKS: Record<PackId, Pack> = {
  starter: { id: 'starter', label: 'Starter', credits: 20, priceAud: 24, priceId: env.STRIPE_PRICE_STARTER },
  plus:    { id: 'plus',    label: 'Plus',    credits: 50, priceAud: 49, priceId: env.STRIPE_PRICE_PLUS },
  pro:     { id: 'pro',     label: 'Pro',     credits: 125, priceAud: 99, priceId: env.STRIPE_PRICE_PRO },
  bulk:    { id: 'bulk',    label: 'Bulk',    credits: 300, priceAud: 219, priceId: env.STRIPE_PRICE_BULK },
};

export function getPack(id: string): Pack | null {
  if (id === 'starter' || id === 'plus' || id === 'pro' || id === 'bulk') {
    return PACKS[id];
  }
  return null;
}

export const PACK_ORDER: PackId[] = ['starter', 'plus', 'pro', 'bulk'];
```

- [ ] **Step 4: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS. (Type-check is allowed to skip env-var resolution since `env` getters are lazy.)

- [ ] **Step 5: Commit**

```bash
git add src/env.ts src/lib/stripe/server.ts src/lib/stripe/products.ts
git commit -m "feat(stripe): pack catalog + Stripe SDK client + price-ID env vars"
```

---

## Task 2: Pack catalog test (TDD anchor for the catalog)

**Files:**
- Create: `tests/lib/stripe/products.test.ts`

This test exists to prevent silent corruption — every time someone touches the catalog, the test forces them to also remember the four-pack invariant.

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/stripe/products.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  process.env.STRIPE_PRICE_STARTER = 'price_starter';
  process.env.STRIPE_PRICE_PLUS = 'price_plus';
  process.env.STRIPE_PRICE_PRO = 'price_pro';
  process.env.STRIPE_PRICE_BULK = 'price_bulk';
});

describe('PACKS catalog', () => {
  it('contains exactly four packs in the locked-pricing order', async () => {
    const { PACKS, PACK_ORDER } = await import('@/lib/stripe/products');
    expect(PACK_ORDER).toEqual(['starter', 'plus', 'pro', 'bulk']);
    expect(Object.keys(PACKS).sort()).toEqual(['bulk', 'plus', 'pro', 'starter']);
  });

  it('matches the locked-pricing credits-and-AUD values from CLAUDE.md', async () => {
    const { PACKS } = await import('@/lib/stripe/products');
    expect(PACKS.starter).toMatchObject({ credits: 20, priceAud: 24 });
    expect(PACKS.plus).toMatchObject({ credits: 50, priceAud: 49 });
    expect(PACKS.pro).toMatchObject({ credits: 125, priceAud: 99 });
    expect(PACKS.bulk).toMatchObject({ credits: 300, priceAud: 219 });
  });

  it('getPack returns the pack for a valid id, null otherwise', async () => {
    const { getPack } = await import('@/lib/stripe/products');
    expect(getPack('plus')?.credits).toBe(50);
    expect(getPack('nonsense')).toBeNull();
    expect(getPack('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/lib/stripe/products.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/stripe/products.test.ts
git commit -m "test(stripe): pack catalog completeness + getPack lookup"
```

---

## Task 3: Stripe webhook event idempotency helpers

**Files:**
- Create: `src/lib/db/stripe-events.ts`

- [ ] **Step 1: Create the file**

```typescript
/**
 * Tracks which Stripe webhook event IDs we've already processed, so retries
 * (Stripe retries any non-2xx for ~3 days) don't double-grant credits.
 *
 * Layout: pk = STRIPE_EVENT#<event_id>, sk = 'processed'. TTL = 30 days, well
 * past Stripe's retry window. After TTL the row vacates DDB automatically.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

const TTL_DAYS = 30;

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const res = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `STRIPE_EVENT#${eventId}`, sk: 'processed' },
    }),
  );
  return !!res.Item;
}

export async function markStripeEventProcessed(eventId: string): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;
  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: `STRIPE_EVENT#${eventId}`,
        sk: 'processed',
        eventId,
        processedAt: new Date().toISOString(),
        ttl,
      },
    }),
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/stripe-events.ts
git commit -m "feat(db): Stripe webhook idempotency helpers"
```

---

## Task 4: Host gate plumbing

**Files:**
- Create: `src/lib/billing/host-gate-server.ts`
- Create: `src/lib/billing/host-gate-client.ts`
- Create: `tests/lib/billing/host-gate.test.ts`

- [ ] **Step 1: Write the failing test for the server helper**

```typescript
// tests/lib/billing/host-gate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookiesGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: cookiesGet }),
}));

beforeEach(() => {
  cookiesGet.mockReset();
});

describe('host-gate-server', () => {
  it('returns "web" when no sr_host cookie is set', async () => {
    cookiesGet.mockReturnValue(undefined);
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('web');
    expect(isWebPaymentAllowedServer()).toBe(true);
  });

  it('returns "twa" when sr_host=twa cookie is set', async () => {
    cookiesGet.mockReturnValue({ value: 'twa' });
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('twa');
    expect(isWebPaymentAllowedServer()).toBe(false);
  });

  it('returns "web" for any other cookie value', async () => {
    cookiesGet.mockReturnValue({ value: 'something-else' });
    const { getServerHostContext, isWebPaymentAllowedServer } = await import('@/lib/billing/host-gate-server');
    expect(getServerHostContext()).toBe('web');
    expect(isWebPaymentAllowedServer()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/lib/billing/host-gate.test.ts
```

Expected: FAIL — module `@/lib/billing/host-gate-server` doesn't exist yet.

- [ ] **Step 3: Create `src/lib/billing/host-gate-server.ts`**

```typescript
/**
 * Server-side host detection.
 *
 * For v1 the only signal is the `sr_host` cookie set by the (future) TWA
 * wrapper on first launch. Today no wrapper exists, the cookie never gets
 * set, and getServerHostContext() always returns 'web'.
 *
 * Server-only — uses next/headers. Never import from a 'use client' file.
 */
import { cookies } from 'next/headers';

export type HostContext = 'web' | 'twa';

export function getServerHostContext(): HostContext {
  const c = cookies().get('sr_host');
  return c?.value === 'twa' ? 'twa' : 'web';
}

export function isWebPaymentAllowedServer(): boolean {
  return getServerHostContext() === 'web';
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/lib/billing/host-gate.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Create `src/lib/billing/host-gate-client.ts`**

```typescript
'use client';

/**
 * Client-side host detection. Reads the same `sr_host` cookie via document.cookie.
 *
 * The hook returns true on initial render (SSR-safe default) and updates after
 * mount once the cookie can be read. Components that key visible UI off this
 * value will briefly flash the "web" state before flipping to "twa" inside the
 * future wrapper — acceptable since the wrapper user lands on a fully-loaded
 * page within ms of cookie read, and there's nothing for them to interact with
 * during that flash.
 */
import { useEffect, useState } from 'react';

export function useIsWebPaymentAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    const isTwa = typeof document !== 'undefined' &&
      document.cookie.split('; ').some((c) => c === 'sr_host=twa');
    if (isTwa) setAllowed(false);
  }, []);
  return allowed;
}
```

- [ ] **Step 6: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/host-gate-server.ts src/lib/billing/host-gate-client.ts tests/lib/billing/host-gate.test.ts
git commit -m "feat(billing): host gate plumbing (server + client) for future TWA wrapper"
```

---

## Task 5: POST /api/checkout/create-session

**Files:**
- Create: `src/app/api/checkout/create-session/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { getStripe } from '@/lib/stripe/server';
import { getPack } from '@/lib/stripe/products';
import { isWebPaymentAllowedServer } from '@/lib/billing/host-gate-server';
import { env } from '@/env';

export const dynamic = 'force-dynamic';

const schema = z.object({
  packId: z.string().min(1),
  returnTo: z.string().startsWith('/').optional(),
});

export async function POST(request: NextRequest) {
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
  const checkoutSession = await stripe.checkout.sessions.create({
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
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: 'Stripe did not return a URL' }, { status: 502 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/checkout/create-session/route.ts
git commit -m "feat(api): POST /api/checkout/create-session"
```

---

## Task 6: POST /api/webhooks/stripe (with TDD)

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`
- Create: `tests/api/webhooks-stripe.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// tests/api/webhooks-stripe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const constructEvent = vi.fn();
vi.mock('@/lib/stripe/server', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
  }),
}));

vi.mock('@/env', () => ({
  env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
}));

const hasProcessedStripeEvent = vi.fn();
const markStripeEventProcessed = vi.fn();
vi.mock('@/lib/db/stripe-events', () => ({
  hasProcessedStripeEvent: (...args: unknown[]) => hasProcessedStripeEvent(...args),
  markStripeEventProcessed: (...args: unknown[]) => markStripeEventProcessed(...args),
}));

const addCredits = vi.fn();
const getUserById = vi.fn();
const updateUser = vi.fn();
vi.mock('@/lib/db/users', () => ({
  addCredits: (...args: unknown[]) => addCredits(...args),
  getUserById: (...args: unknown[]) => getUserById(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

function makeRequest(body: string, sig?: string) {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: sig ? { 'stripe-signature': sig } : {},
    body,
  });
}

beforeEach(() => {
  constructEvent.mockReset();
  hasProcessedStripeEvent.mockReset();
  markStripeEventProcessed.mockReset();
  addCredits.mockReset();
  getUserById.mockReset();
  updateUser.mockReset();
});

describe('POST /api/webhooks/stripe', () => {
  it('400 when stripe-signature header is missing', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('400 when signature verification throws', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const res = await POST(makeRequest('{}', 'sig_bad'));
    expect(res.status).toBe(400);
  });

  it('200 and ignores unrelated event types', async () => {
    constructEvent.mockReturnValue({ id: 'evt_1', type: 'invoice.paid' });
    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(200);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('dedups when event ID has been processed before', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u1', credits: '50', packId: 'plus' } } },
    });
    hasProcessedStripeEvent.mockResolvedValue(true);
    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduped).toBe(true);
    expect(addCredits).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it('grants credits, persists stripeCustomerId, marks event processed on success', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_abc',
          metadata: { userId: 'u1', credits: '50', packId: 'plus' },
        },
      },
    });
    hasProcessedStripeEvent.mockResolvedValue(false);
    getUserById.mockResolvedValue({ id: 'u1', stripeCustomerId: undefined });
    addCredits.mockResolvedValue(undefined);
    updateUser.mockResolvedValue(undefined);
    markStripeEventProcessed.mockResolvedValue(undefined);

    const res = await POST(makeRequest('{}', 'sig_good'));

    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalledWith('u1', 50);
    expect(updateUser).toHaveBeenCalledWith('u1', { stripeCustomerId: 'cus_abc' });
    expect(markStripeEventProcessed).toHaveBeenCalledWith('evt_2');
  });

  it('skips updateUser when stripeCustomerId already on record', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_abc',
          metadata: { userId: 'u1', credits: '50', packId: 'plus' },
        },
      },
    });
    hasProcessedStripeEvent.mockResolvedValue(false);
    getUserById.mockResolvedValue({ id: 'u1', stripeCustomerId: 'cus_abc' });

    const res = await POST(makeRequest('{}', 'sig_good'));

    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalledWith('u1', 50);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('400 when session.metadata is missing required fields', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_4',
      type: 'checkout.session.completed',
      data: { object: { metadata: { userId: 'u1' } } }, // no credits/packId
    });
    hasProcessedStripeEvent.mockResolvedValue(false);

    const res = await POST(makeRequest('{}', 'sig_good'));
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/api/webhooks-stripe.test.ts
```

Expected: FAIL — module `@/app/api/webhooks/stripe/route` doesn't exist yet.

- [ ] **Step 3: Create the route file**

```typescript
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { env } from '@/env';
import { addCredits, getUserById, updateUser } from '@/lib/db/users';
import { hasProcessedStripeEvent, markStripeEventProcessed } from '@/lib/db/stripe-events';

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

  if (await hasProcessedStripeEvent(event.id)) {
    return NextResponse.json({ received: true, deduped: true });
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

  await addCredits(userId, credits);

  // Persist stripeCustomerId on first purchase so subsequent checkouts reuse it.
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;
  if (customerId) {
    const user = await getUserById(userId);
    if (user && !user.stripeCustomerId) {
      await updateUser(userId, { stripeCustomerId: customerId });
    }
  }

  await markStripeEventProcessed(event.id);

  return NextResponse.json({ received: true, credits });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/api/webhooks-stripe.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts tests/api/webhooks-stripe.test.ts
git commit -m "feat(api): POST /api/webhooks/stripe with signature verification + idempotency"
```

---

## Task 7: PackTiles component

**Files:**
- Create: `src/components/billing/pack-tiles.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import { useIsWebPaymentAllowed } from '@/lib/billing/host-gate-client';
import { PACKS, PACK_ORDER, type PackId } from '@/lib/stripe/products';

export function PackTiles({ returnTo, className }: { returnTo: string; className?: string }) {
  const [pendingPack, setPendingPack] = useState<PackId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = useIsWebPaymentAllowed();

  if (!allowed) return null;

  async function buy(packId: PackId) {
    if (pendingPack) return;
    setError(null);
    setPendingPack(packId);
    try {
      const r = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, returnTo }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not start checkout. Try again in a moment.');
        return;
      }
      const data = await r.json();
      if (!data.url) {
        setError('Checkout did not return a URL. Try again in a moment.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Try again.');
    } finally {
      setPendingPack(null);
    }
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PACK_ORDER.map((id) => {
          const p = PACKS[id];
          const isPending = pendingPack === id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => buy(p.id)}
              disabled={pendingPack !== null}
              className="text-left rounded-xl border-[1.5px] border-sr-terra/30 bg-white px-4 py-3.5 hover:border-sr-terra/60 hover:shadow-soft transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sr-ink-mute">{p.label}</div>
              <div className="mt-1 font-display text-2xl text-sr-ink leading-none">${p.priceAud}</div>
              <div className="mt-1 text-[12px] text-sr-ink-soft">{p.credits} credits</div>
              {isPending && <div className="mt-2 text-[11px] text-sr-terra">Redirecting…</div>}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] text-sr-ink-mute">Prices include GST. Credits never expire while your account is active.</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/pack-tiles.tsx
git commit -m "feat(billing): PackTiles component (reusable inline pack cards)"
```

---

## Task 8: /checkout/success page (polling)

**Files:**
- Create: `src/app/checkout/success/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const POLL_MS = 2000;
const TIMEOUT_MS = 30000;

function SuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get('return_to') ?? '/dashboard';
  const { user, refresh } = useAuth();
  const [initialBalance] = useState<number | null>(user?.creditsRemaining ?? null);
  const [phase, setPhase] = useState<'polling' | 'confirmed' | 'timeout'>('polling');

  useEffect(() => {
    if (phase !== 'polling') return;
    const start = Date.now();
    const interval = setInterval(async () => {
      await refresh();
      if (Date.now() - start > TIMEOUT_MS) {
        clearInterval(interval);
        setPhase('timeout');
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [phase, refresh]);

  useEffect(() => {
    if (phase !== 'polling') return;
    if (user && initialBalance !== null && user.creditsRemaining > initialBalance) {
      setPhase('confirmed');
      const t = setTimeout(() => router.push(returnTo), 1000);
      return () => clearTimeout(t);
    }
  }, [user, initialBalance, phase, router, returnTo]);

  return (
    <div className="min-h-[100dvh] bg-sr-cream flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        {phase === 'polling' && (
          <>
            <div className="mx-auto size-10 border-2 border-sr-terra border-t-transparent rounded-full animate-spin" />
            <h1 className="mt-6 font-display text-2xl text-sr-ink">Confirming your purchase…</h1>
            <p className="mt-2 text-sm text-sr-ink-mute">Just a few seconds.</p>
          </>
        )}
        {phase === 'confirmed' && (
          <>
            <h1 className="font-display text-2xl text-sr-ink">Credits added.</h1>
            <p className="mt-2 text-sm text-sr-ink-mute">Sending you back…</p>
          </>
        )}
        {phase === 'timeout' && (
          <>
            <h1 className="font-display text-2xl text-sr-ink">We&apos;re still confirming.</h1>
            <p className="mt-2 text-sm text-sr-ink-mute">Your credits will land in a moment. You&apos;ll receive an email receipt either way.</p>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="mt-5 inline-block bg-sr-ink text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-sr-ink-2 transition-colors"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-sr-cream" />}>
      <SuccessInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/checkout/success/page.tsx
git commit -m "feat(checkout): /checkout/success page with credit-grant polling"
```

---

## Task 9: /checkout/cancel page

**Files:**
- Create: `src/app/checkout/cancel/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CancelInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get('return_to') ?? '/dashboard';

  useEffect(() => {
    router.replace(returnTo);
  }, [router, returnTo]);

  return (
    <div className="min-h-[100dvh] bg-sr-cream flex items-center justify-center px-6">
      <p className="text-sm text-sr-ink-mute">Returning…</p>
    </div>
  );
}

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-sr-cream" />}>
      <CancelInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/checkout/cancel/page.tsx
git commit -m "feat(checkout): /checkout/cancel page (redirect back to return_to)"
```

---

## Task 10: /pricing page

**Files:**
- Create: `src/app/pricing/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isWebPaymentAllowedServer } from '@/lib/billing/host-gate-server';
import { AppHeader } from '@/components/layout/app-header';
import { PackTiles } from '@/components/billing/pack-tiles';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect('/onboarding');
  if (!isWebPaymentAllowedServer()) redirect('/dashboard');

  return (
    <div className="min-h-[100dvh] bg-sr-cream">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-6 py-10 sm:py-16">
        <div className="text-center max-w-xl mx-auto">
          <h1 className="font-display text-4xl sm:text-5xl text-sr-ink leading-[1.05] tracking-[-0.02em]">
            Top up your <span className="italic text-sr-terra">credits</span>.
          </h1>
          <p className="mt-4 text-[15px] sm:text-[17px] text-sr-ink/70">
            Pick a pack. Credits never expire while your account is active.
          </p>
        </div>
        <div className="mt-10">
          <PackTiles returnTo="/dashboard" />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/pricing/page.tsx
git commit -m "feat(pricing): authenticated /pricing top-up page"
```

---

## Task 11: Wire PackTiles into the /stage out-of-credits card; make CreditBalance pill clickable

**Files:**
- Modify: `src/app/stage/page.tsx`
- Modify: `src/components/layout/app-header.tsx`

- [ ] **Step 1: Replace the "launching soon" copy in `src/app/stage/page.tsx`**

Open `src/app/stage/page.tsx` and find the out-of-credits card block (currently around lines 856-889 — the `{!hasEnoughCredits && (` block). The current inner content is the headline + the "Paid plans launching soon" paragraph + the "Pick fewer styles" button. Replace JUST the paragraph with `<PackTiles />`. Keep the rest.

The replacement target text:
```tsx
                      <p className="mt-2 text-sm text-sr-ink-soft font-medium leading-snug">
                        Paid plans are launching soon. Every account will get more credits when they do — we&apos;ll be in touch.
                      </p>
```

Replace with:
```tsx
                      <div className="mt-3">
                        <PackTiles returnTo="/stage" />
                      </div>
```

Then add the import near the top of the file (group with other imports, sort order optional — match what's there):

```tsx
import { PackTiles } from '@/components/billing/pack-tiles';
```

- [ ] **Step 2: Make the credit pill in the header clickable**

Open `src/components/layout/app-header.tsx`. Find the `<CreditBalance ... />` render (currently around line 42).

Wrap it in a Link conditionally based on the host gate. Add the import at the top:

```tsx
import Link from 'next/link';
import { useIsWebPaymentAllowed } from '@/lib/billing/host-gate-client';
```

Inside the function body, add:

```tsx
  const allowed = useIsWebPaymentAllowed();
```

Then wrap the `<CreditBalance ... />` element. Find:

```tsx
            <CreditBalance credits={user.creditsRemaining ?? 0} plan={user.plan ?? 'free'} />
```

Replace with:

```tsx
            {allowed ? (
              <Link href="/pricing" aria-label="Buy credits" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sr-terra/40">
                <CreditBalance credits={user.creditsRemaining ?? 0} plan={user.plan ?? 'free'} />
              </Link>
            ) : (
              <CreditBalance credits={user.creditsRemaining ?? 0} plan={user.plan ?? 'free'} />
            )}
```

- [ ] **Step 3: Type-check + lint the touched files**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check && npx eslint src/app/stage/page.tsx src/components/layout/app-header.tsx
```

Expected: type-check PASS, eslint PASS (no errors).

- [ ] **Step 4: Run the full test suite**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm test
```

Expected: pre-existing 4 unrelated failures still present (per project memory — concierge notes, batch staging routes); all NEW tests added by this plan PASS. Net: no new failures introduced.

- [ ] **Step 5: Commit**

```bash
git add src/app/stage/page.tsx src/components/layout/app-header.tsx
git commit -m "feat(billing): wire PackTiles into out-of-credits card; clickable credit pill"
```

---

## Task 12: Configure Stripe dashboard (manual, by Tara) and manual browser verification

This task has no code. It's the configuration + verification gate before the work goes to production.

- [ ] **Step 1: Create the four Stripe Products + Prices in test mode**

In the Stripe dashboard (test mode):
1. Create a Product called "Starter" → add a Price: AUD 24.00, one-time, `tax_behavior: inclusive`. Copy the price ID (starts with `price_…`).
2. Repeat for "Plus" (AUD 49.00), "Pro" (AUD 99.00), "Bulk" (AUD 219.00).
3. Set the four price IDs as environment variables locally (in `.env.local`):

```
STRIPE_PRICE_STARTER=price_…
STRIPE_PRICE_PLUS=price_…
STRIPE_PRICE_PRO=price_…
STRIPE_PRICE_BULK=price_…
```

4. Set the same four (with the SAME values) in the Amplify console's environment variables for the production deploy.

- [ ] **Step 2: Configure the Stripe webhook endpoint**

In Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://master.d88xgpqlfkk1w.amplifyapp.com/api/webhooks/stripe`
- Events: `checkout.session.completed`
- Reveal the signing secret. Copy it. Set `STRIPE_WEBHOOK_SECRET` in Amplify env vars.

For LOCAL testing: install Stripe CLI, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, copy the `whsec_…` it prints, set as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

- [ ] **Step 3: Local browser walkthrough**

Run `npm run dev` and walk:
1. Sign up a fresh test account (or use an existing one).
2. Stage a few rooms until `creditsRemaining` is below the cost of a multi-style stage.
3. Open `/stage`, set up a 2+ style batch. The "Out of credits" card renders with four pack tiles instead of the "launching soon" paragraph.
4. Click "Plus" → redirected to Stripe Checkout (test mode).
5. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Pay.
6. Stripe redirects to `/checkout/success?session_id=…&return_to=/stage`. Spinner shows "Confirming your purchase…" briefly, then "Credits added." → bounces back to `/stage`. Credit balance now shows the new value (50 added).
7. Click the credit pill in the header → goes to `/pricing`. Tiles render. Click any tile → checkout flow works the same way.
8. Click any tile → on the Stripe page click "← Back" / cancel → returns to `/stage` with no credits granted.
9. Pay again → confirm credits add correctly (no double-grant).
10. In Stripe dashboard → Webhooks → recent attempts: confirm 200 responses for every `checkout.session.completed`.

- [ ] **Step 4: Production deploy + smoke test**

After merging the PR:
1. Wait for Amplify deploy to land.
2. Repeat steps 3-7 above on the production URL with the production webhook secret. Use a real card ($24 starter pack — Tara can refund herself afterwards via Stripe dashboard).
3. Confirm the user record on DDB shows `creditsRemaining` updated and `stripeCustomerId` populated.

If anything fails at any step: capture the failure (browser screenshot, Stripe webhook delivery log), fix forward on a new branch.

---

## Self-review checklist (already run by the planning author)

- **Spec coverage:** every spec section maps to a task. Stripe Checkout (T5, T6), webhook source-of-truth + idempotency (T6), packs catalog (T1, T2), success polling (T8), cancel (T9), pricing surface (T10), inline tiles in /stage (T11), clickable credit pill (T11), host gate plumbing (T4), GST inclusive prices (T1, configured at Stripe-product level in T12), env vars (T1).
- **Placeholder scan:** no TBDs, TODOs, "implement later", "similar to Task N", "appropriate error handling". Every code step shows the actual code.
- **Type consistency:** `PackId` is defined in `src/lib/stripe/products.ts` (Task 1) and re-imported in Tasks 7, 11 by name. `Pack` shape is consistent across catalog + tile rendering. Webhook handler in Task 6 calls `addCredits(userId, credits)` matching the existing signature in `src/lib/db/users.ts` (verified during plan-writing).
- **Risk:** The existing `addCredits` in users.ts is read-modify-write rather than atomic, accepted for v1 (race window is negligible for one-pack-at-a-time human flow). Live testing of host gate not possible until TWA wrapper exists — accepted per spec.
