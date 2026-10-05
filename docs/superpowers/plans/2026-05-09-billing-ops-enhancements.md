# Billing ops enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small additions on top of the just-merged paywall: an admin "give credits" tool, Stripe promo codes on Checkout, and a Stripe Customer Portal link from the user menu. Plus a manual walkthrough for flipping Stripe to live mode.

**Architecture:** Reuses the existing admin layout + auth gate, the existing `addCredits` helper, the existing Stripe client, and the existing webhook handler. Total surface area: 4 new files + 3 modified files. The Customer Portal is Stripe-hosted, so we just generate a one-time portal URL and redirect.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, AWS DynamoDB, Stripe Node SDK v17, vitest.

**Spec:** `docs/superpowers/specs/2026-05-09-billing-ops-enhancements-design.md`

---

## File map

**New:**
- `src/app/api/admin/users/[userId]/credits/route.ts` — POST endpoint that admins use to grant credits.
- `src/app/admin/users/page.tsx` — `'use client'` admin page: table + search + add-credits modal in one file.
- `src/app/api/billing/portal/route.ts` — POST endpoint creating a Stripe Customer Portal session for the authenticated user.
- `tests/api/admin-users-credits.test.ts` — vitest covering auth + happy path + bad input.

**Modified:**
- `src/lib/db/users.ts` — add a `listAllUsers()` helper that scans DDB for User records.
- `src/app/admin/layout.tsx` — add a "Users" link to the admin nav.
- `src/app/api/checkout/create-session/route.ts` — add `allow_promotion_codes: true` to the Stripe Checkout Session.
- `src/components/dashboard/user-menu.tsx` — wire "Billing & invoices" to the new portal API; drop SOON badge.

**Untouched but referenced:**
- `src/lib/db/users.ts` `addCredits` — already exists, called by the new admin route.
- `src/app/admin/layout.tsx` auth gate — already redirects non-admins to `/dashboard`.
- `src/lib/stripe/server.ts` — already exports `getStripe()`.

---

## Task 1: `listAllUsers()` helper

**Files:**
- Modify: `src/lib/db/users.ts`

- [ ] **Step 1: Add the helper function**

Open `src/lib/db/users.ts`. Find the line with the existing import block at the top — confirm `ScanCommand` is NOT yet imported. Add it:

```typescript
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
```

Then append this function at the bottom of the file (after the last existing export):

```typescript
/**
 * Admin-only: list every User record. Used by the admin "give credits" page.
 *
 * DDB scan with FilterExpression — fine at the current user count (dozens).
 * If we ever exceed a few hundred users, switch to the EMAIL GSI with
 * pagination and server-side search.
 */
export async function listAllUsers(): Promise<User[]> {
  const all: User[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const res = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'sk = :sk AND begins_with(pk, :pkPrefix)',
      ExpressionAttributeValues: {
        ':sk': 'PROFILE',
        ':pkPrefix': 'USER#',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    if (res.Items) all.push(...(res.Items as User[]));
    lastEvaluatedKey = res.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return all;
}
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/users.ts
git commit -m "feat(db): listAllUsers helper for admin user list"
```

---

## Task 2: POST /api/admin/users/[userId]/credits with TDD

**Files:**
- Create: `src/app/api/admin/users/[userId]/credits/route.ts`
- Create: `tests/api/admin-users-credits.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/api/admin-users-credits.test.ts` with this content:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getSession = vi.fn();
vi.mock('@/lib/auth/session', () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

const addCredits = vi.fn();
vi.mock('@/lib/db/users', () => ({
  addCredits: (...args: unknown[]) => addCredits(...args),
}));

vi.mock('@/types', () => ({
  ADMIN_EMAILS: ['admin@example.com'],
}));

import { POST } from '@/app/api/admin/users/[userId]/credits/route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/admin/users/u1/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  addCredits.mockReset();
});

describe('POST /api/admin/users/[userId]/credits', () => {
  it('401 when no session', async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(401);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('403 when session user is not an admin', async () => {
    getSession.mockResolvedValue({ user: { id: 'x', email: 'someone@example.com' } });
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(403);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when amount is missing', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when reason is too short', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ amount: 50, reason: 'no' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('400 when amount is not a positive integer', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    const res = await POST(makeRequest({ amount: -5, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(400);
    expect(addCredits).not.toHaveBeenCalled();
  });

  it('200 happy path — calls addCredits and returns success', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'admin@example.com' } });
    addCredits.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalledWith('u1', 50);
  });

  it('email check is case-insensitive', async () => {
    getSession.mockResolvedValue({ user: { id: 'a', email: 'ADMIN@example.com' } });
    addCredits.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ amount: 50, reason: 'Test grant' }), { params: { userId: 'u1' } });
    expect(res.status).toBe(200);
    expect(addCredits).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/api/admin-users-credits.test.ts
```

Expected: FAIL — module `@/app/api/admin/users/[userId]/credits/route` doesn't exist.

- [ ] **Step 3: Create the route**

Create `src/app/api/admin/users/[userId]/credits/route.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npx vitest run tests/api/admin-users-credits.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users/[userId]/credits/route.ts tests/api/admin-users-credits.test.ts
git commit -m "feat(api): admin credit-grant route with auth + audit log"
```

---

## Task 3: Add "Users" link to admin nav

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Add the link**

In `src/app/admin/layout.tsx`, find the existing nav section (lines 13-22) with the three Link elements (Compare models / Review queue / Landing images). Add a new Link AFTER "Landing images":

```tsx
          <Link href="/admin/users" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Users</Link>
```

The full nav block should now read:

```tsx
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-12 flex items-center gap-1 text-[13px]">
          <Link href="/dashboard" className="px-3 h-8 rounded-md inline-flex items-center text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors">← Dashboard</Link>
          <span className="mx-2 text-white/30" aria-hidden>·</span>
          <span className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Admin</span>
          <Link href="/admin/compare" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Compare models</Link>
          <Link href="/admin/reviews" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Review queue</Link>
          <Link href="/admin/landing-images" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Landing images</Link>
          <Link href="/admin/users" className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors">Users</Link>
        </div>
```

- [ ] **Step 2: Commit**

(Type-check happens after Task 4 lands; the new link points at a route that doesn't exist yet, but that's a 404 in the browser, not a type error.)

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): add Users nav link"
```

---

## Task 4: Admin users page with table, search, and modal

**Files:**
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/api/admin/users/route.ts` (GET — returns list of users for the client page)

- [ ] **Step 1: Create the GET endpoint that returns the user list**

Create `src/app/api/admin/users/route.ts`:

```typescript
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
```

- [ ] **Step 2: Create the admin users page**

Create `src/app/admin/users/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';

type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  plan: string;
  creditsRemaining: number;
  creditsUsedAllTime: number;
  updatedAt: string;
  stripeCustomerId: string | null;
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState<AdminUserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/users');
      if (r.ok) {
        const data = await r.json();
        setRows(data.users);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? rows.filter((r) => r.email.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <header className="bg-white border-b border-surface-border sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between">
          <h1 className="font-heading text-xl text-brand-navy">Users</h1>
          <a href="/dashboard" className="text-sm font-medium text-ink-muted hover:text-brand-navy">Dashboard</a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
        <div className="mb-5 flex items-center gap-3">
          <input
            type="search"
            placeholder="Search by email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm text-sm bg-white border border-surface-border rounded-lg px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy/40"
          />
          <span className="text-sm text-ink-muted">
            {loading ? 'Loading…' : `${filtered.length} of ${rows.length}`}
          </span>
        </div>

        <div className="bg-white border border-surface-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Credits</th>
                <th className="px-4 py-3 text-right">Spent</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-surface-secondary/40">
                  <td className="px-4 py-3 text-brand-navy font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-ink-secondary">{u.name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{u.plan}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.creditsRemaining}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{u.creditsUsedAllTime}</td>
                  <td className="px-4 py-3 text-ink-muted text-xs">{relativeTime(u.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setGranting(u)}
                      className="inline-flex items-center justify-center size-7 rounded-full bg-brand-navy text-white text-base leading-none hover:bg-brand-navy/90 transition-colors"
                      aria-label={`Add credits to ${u.email}`}
                    >
                      +
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">No users match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {granting && (
        <AddCreditsModal
          user={granting}
          onClose={() => setGranting(null)}
          onSuccess={(newBalance) => {
            setRows((prev) => prev.map((r) => r.id === granting.id ? { ...r, creditsRemaining: newBalance } : r));
            setGranting(null);
          }}
        />
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function AddCreditsModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not grant credits.');
        return;
      }
      onSuccess(user.creditsRemaining + amount);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl border border-surface-border shadow-[0_24px_48px_-12px_rgba(15,29,46,0.25)] p-6"
      >
        <h2 className="font-heading text-lg text-brand-navy">Add credits</h2>
        <p className="mt-1 text-sm text-ink-muted truncate">{user.email}</p>

        <label className="block mt-5">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted mb-1.5">Credits to add</span>
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            required
            className="w-full text-sm bg-surface-secondary border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
          />
        </label>

        <label className="block mt-3">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted mb-1.5">Reason (audit log)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            placeholder='e.g. "Test account"'
            className="w-full text-sm bg-surface-secondary border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-medium text-ink-muted hover:text-brand-navy px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 3 || amount < 1}
            className="text-sm font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Granting…' : `Add ${amount}`}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/users/page.tsx src/app/api/admin/users/route.ts
git commit -m "feat(admin): /admin/users page with search + add-credits modal"
```

---

## Task 5: Stripe promo codes (one-line config)

**Files:**
- Modify: `src/app/api/checkout/create-session/route.ts`

- [ ] **Step 1: Add `allow_promotion_codes`**

In `src/app/api/checkout/create-session/route.ts`, find the `stripe.checkout.sessions.create({...})` call (currently around lines 49-65 inside the try block). Add `allow_promotion_codes: true` as a new line in the config object — anywhere is fine, but tucking it next to `mode: 'payment'` keeps mode-related fields together:

The full config object should now read:

```typescript
    checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      allow_promotion_codes: true,
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
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/checkout/create-session/route.ts
git commit -m "feat(stripe): allow promotion codes on Checkout Sessions"
```

---

## Task 6: POST /api/billing/portal route

**Files:**
- Create: `src/app/api/billing/portal/route.ts`

- [ ] **Step 1: Create the route**

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/billing/portal/route.ts
git commit -m "feat(billing): POST /api/billing/portal — Stripe Customer Portal session"
```

---

## Task 7: Wire user-menu Billing & invoices to the portal

**Files:**
- Modify: `src/components/dashboard/user-menu.tsx`

- [ ] **Step 1: Replace the stub Billing button with a real handler**

Open `src/components/dashboard/user-menu.tsx`. The `useAuth` hook in this file gives a `User` object whose shape (per `src/hooks/use-auth.ts`) doesn't include `stripeCustomerId`. We need to pass that flag in from the parent.

First, add a new prop to the component. Find:

```typescript
interface UserMenuProps {
  name: string;
  email: string;
  plan: string;
  onLogout: () => void | Promise<void>;
}
```

Change to:

```typescript
interface UserMenuProps {
  name: string;
  email: string;
  plan: string;
  hasStripeCustomer: boolean;
  onLogout: () => void | Promise<void>;
}
```

And the destructure:

```typescript
export function UserMenu({ name, email, plan, hasStripeCustomer, onLogout }: UserMenuProps) {
```

Then find the existing Billing button block (lines ~104-119, the `<button onClick={stubClick('Billing')}>` element). Replace the entire `<button>...</button>` for "Billing & invoices" with this:

```tsx
              <button
                role="menuitem"
                onClick={async () => {
                  if (!hasStripeCustomer) return;
                  try {
                    const r = await fetch('/api/billing/portal', { method: 'POST' });
                    if (!r.ok) {
                      setFlash('Could not open billing portal.');
                      return;
                    }
                    const data = await r.json();
                    if (data.url) {
                      window.location.href = data.url;
                    } else {
                      setFlash('Billing portal returned no URL.');
                    }
                  } catch {
                    setFlash('Network error opening billing portal.');
                  }
                }}
                disabled={!hasStripeCustomer}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-sr-ink hover:bg-sr-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={!hasStripeCustomer ? 'Make a purchase first to access billing.' : undefined}
              >
                <span className="flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-sr-ink-mute">
                    <rect x="1.5" y="3" width="12" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M1.5 6h12" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Billing &amp; invoices
                </span>
                {!hasStripeCustomer && (
                  <span className="text-[10px] font-medium text-sr-ink-mute italic">No purchases yet</span>
                )}
              </button>
```

- [ ] **Step 2: Update the call site that renders `<UserMenu />`**

The call site is `src/components/layout/app-header.tsx`. The component currently renders `<UserMenu name={...} email={...} plan={...} onLogout={...} />`. Add the new prop based on `useAuth()`'s `user.stripeCustomerId`.

First, check the `User` type returned by `useAuth` — open `src/hooks/use-auth.ts`. Per its `AuthUser` interface, it does NOT include `stripeCustomerId`. We need to add it.

In `src/hooks/use-auth.ts`, find:

```typescript
interface AuthUser {
  sub: string;
  email: string;
  name: string;
  plan?: string;
  creditsRemaining?: number;
  onboardingCompletedAt?: string | null;
}
```

Add `hasStripeCustomer?: boolean;`:

```typescript
interface AuthUser {
  sub: string;
  email: string;
  name: string;
  plan?: string;
  creditsRemaining?: number;
  onboardingCompletedAt?: string | null;
  hasStripeCustomer?: boolean;
}
```

Then in `src/app/api/auth/me/route.ts`, find the response shape (lines ~53-62) and add `hasStripeCustomer: !!user.stripeCustomerId` to the user object:

```typescript
    return NextResponse.json({
      user: {
        sub: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        creditsRemaining: user.creditsRemaining,
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        hasStripeCustomer: !!user.stripeCustomerId,
      },
    });
```

Finally, in `src/components/layout/app-header.tsx`, find the `<UserMenu ... />` JSX (it'll be near where `useAuth()` is called). Pass the new prop:

```tsx
<UserMenu
  name={user.name}
  email={user.email}
  plan={user.plan ?? 'free'}
  hasStripeCustomer={user.hasStripeCustomer ?? false}
  onLogout={logout}
/>
```

(The exact existing prop list may differ slightly — match the existing pattern, just add `hasStripeCustomer={user.hasStripeCustomer ?? false}`.)

- [ ] **Step 3: Type-check**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/user-menu.tsx src/hooks/use-auth.ts src/app/api/auth/me/route.ts src/components/layout/app-header.tsx
git commit -m "feat(billing): user-menu Billing & invoices opens Stripe Customer Portal"
```

---

## Task 8: Build + full test sweep + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full test sweep**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm test 2>&1 | tail -10
```

Expected: all NEW tests pass (admin-users-credits.test.ts: 7 tests). The 4 pre-existing failures (concierge, stage-batch, jobs-batch x2) remain unrelated to this PR.

- [ ] **Step 2: Type-check + lint the touched files**

```bash
cd "C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images" && npm run type-check && npx eslint src/app/admin/users src/app/api/admin/users src/app/api/billing src/components/dashboard/user-menu.tsx src/hooks/use-auth.ts
```

Both should PASS (0 errors).

- [ ] **Step 3: Manual browser verification on live deploy**

After merge + deploy:

1. Log in as admin (`tara@aiwave.com.au` or `taraferguson.business@gmail.com`).
2. Visit `/admin/users` — should see all users in a table, sorted by most-recent activity.
3. Type part of an email in the search — table filters live.
4. Click `+` next to `tara+200@aiwave.com.au` — modal opens.
5. Set Credits to 25, Reason to `Manual verification grant`. Click Add 25.
6. Modal closes; table row updates to show new balance. CloudWatch shows the `[admin-credits-grant]` line.
7. Log into `tara+200@aiwave.com.au` separately — credit pill in header reflects the new balance.
8. **Promo codes:** create a test promo code in Stripe dashboard (test mode → Coupons → 100% off → create promotion code `MANUAL_TEST`). Buy a Plus pack and apply the code at checkout — total should be $0, webhook still grants 50 credits.
9. **Customer Portal:** as `tara+200@aiwave.com.au` (who now has a `stripeCustomerId` from earlier purchases), open the user menu and click **Billing & invoices** — should redirect to Stripe-hosted portal showing past invoices. Click "Return to StageRight" → land back on `/dashboard`.
10. **Customer Portal disabled state:** as a brand-new user with no purchases, the Billing & invoices item shows "No purchases yet" and is disabled.

Each step should pass. If any fails, report what you saw.

- [ ] **Step 4: Final commit if any verification fixes were needed**

If steps 1-3 surfaced issues that required code fixes, commit them. Otherwise no commit needed.

---

## Walkthrough C: live-mode Stripe flip (manual, no code)

This is for Tara to perform after the PR has merged + deployed. No agentic implementation work.

**Pre-flight:** before starting, the test-mode setup is already complete. Live-mode mirrors it.

- [ ] **Step 1: Switch Stripe dashboard to LIVE mode**

Top-right of dashboard.stripe.com — toggle from "Test mode" to live. Note: from this point any product/price/webhook you create is REAL.

- [ ] **Step 2: Create the four products + prices in live mode**

For each pack (Starter / Plus / Pro / Bulk):
1. Products → + Add product
2. Name (e.g. `Starter`), Description (e.g. `20 staging credits`)
3. Pricing → One-time, AUD, the matching amount (24 / 49 / 99 / 219), Tax behavior: Not specified
4. Save
5. Click into the price → copy the `price_…` ID

Collect: 4 live `price_…` IDs.

- [ ] **Step 3: Live API keys**

https://dashboard.stripe.com/apikeys (no `/test/` in the URL):
- Publishable key — copy `pk_live_…`
- Secret key — click Reveal, copy `sk_live_…`

- [ ] **Step 4: Live webhook**

https://dashboard.stripe.com/webhooks:
- Add endpoint
- URL: `https://master.d88xgpqlfkk1w.amplifyapp.com/api/webhooks/stripe`
- Events: `checkout.session.completed`
- Save → reveal signing secret → copy `whsec_…`

- [ ] **Step 5: Configure live Customer Portal**

https://dashboard.stripe.com/settings/billing/portal:
- Business name: AI Wave (or StageRight) + support email
- Functionality:
  - ✅ Invoice history
  - ✅ Update payment method
  - ❌ Update subscriptions (off)
  - ❌ Cancel subscriptions (off)
  - ❌ Update billing address (off — keep simple)
- Branding: optional logo/colors
- Save

- [ ] **Step 6: Update Amplify env vars**

https://ap-southeast-2.console.aws.amazon.com/amplify/apps/d88xgpqlfkk1w/hosting/environment-variables:

Overwrite all 7 STRIPE_* values with the live equivalents:
- `STRIPE_PRICE_STARTER` → live `price_…`
- `STRIPE_PRICE_PLUS` → live `price_…`
- `STRIPE_PRICE_PRO` → live `price_…`
- `STRIPE_PRICE_BULK` → live `price_…`
- `STRIPE_SECRET_KEY` → `sk_live_…`
- `STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
- `STRIPE_WEBHOOK_SECRET` → live `whsec_…`

Save → triggers a fresh Amplify build automatically.

- [ ] **Step 7: Wait for Amplify build to finish**

Watch https://ap-southeast-2.console.aws.amazon.com/amplify/apps/d88xgpqlfkk1w/branches/master/deployments — wait for green tick on the new build.

- [ ] **Step 8: Smoke test with one real card**

Buy Starter ($24) on your own user account. Confirm:
- Stripe Checkout shows live mode (no orange "TEST" banner)
- Real card charges through
- Credits land on the account
- Stripe live-mode logs show the charge under `POST /v1/checkout/sessions`
- Stripe webhook delivery shows 200 from your endpoint

Refund yourself via Stripe dashboard if desired.

After this, the paywall is officially live and accepting real payments.

---

## Self-review checklist (already run by the planning author)

- **Spec coverage:**
  - A (admin grant tool): Tasks 1-4. The audit log line in Task 2's route matches the spec's format.
  - B (promo codes): Task 5.
  - D (Customer Portal): Tasks 6-7. The `hasStripeCustomer` flow handles the spec's "no customer yet" case.
  - C (live-mode walkthrough): final section, eight steps, mirrors test-mode setup.
- **Placeholder scan:** no TBD/TODO/"appropriate error handling"/"similar to Task N". All code blocks are complete.
- **Type consistency:** `AdminUserRow` is defined in Task 4 and used consistently. `hasStripeCustomer` flows: Task 7 adds it to `AuthUser` + `/api/auth/me` response + UserMenuProps. The DDB scan helper returns `User[]` (the existing type from `@/types`); the projection in `/api/admin/users` GET endpoint trims it to the row shape the page needs.
- **Risks:**
  - Task 3 commits a nav link to a route that doesn't exist until Task 4. Acceptable — between commits the nav has a dead link, but the type-check + build pass and the route lands immediately after.
  - Task 7 modifies four files together (user-menu, use-auth hook, /api/auth/me route, app-header.tsx) — they form one logical change (adding `hasStripeCustomer` end-to-end) and must commit together.
