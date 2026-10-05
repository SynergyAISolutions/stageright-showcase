# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 8-screen mandatory post-confirm onboarding at `/onboarding` that ends with the user's first real staged listing photo and sets `onboardingCompletedAt` on their user record.

**Architecture:** New `/onboarding` route with a single stateful client component driving a step enum. Screens 1–6 are new components; screens 7–8 reuse the existing wizard primitives (`HeroUpload`, `StyleRow`, `StagingLoader`, `BeforeAfterSlider`) against the existing `/api/stage/batch` pipeline. Two new API routes handle progress persistence and completion. Auto-login is added to `/api/auth/confirm` so signup → confirm flows directly into onboarding without a manual login step. Returning users are gated via a user-record `onboardingCompletedAt` field; existing users get a sentinel value to skip.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind, framer-motion, AWS Cognito (via `@aws-sdk/client-cognito-identity-provider`), DynamoDB single-table, Vitest for tests.

---

## File structure

**New files:**
- `src/app/onboarding/page.tsx` — server component route wrapper with auth + already-complete redirect
- `src/app/onboarding/onboarding-flow.tsx` — client component with step enum + screen switcher
- `src/app/api/onboarding/progress/route.ts` — POST to save role / listingsPerMonth
- `src/app/api/onboarding/complete/route.ts` — POST to set `onboardingCompletedAt`
- `src/components/onboarding/welcome-screen.tsx` — screen 1
- `src/components/onboarding/role-picker.tsx` — screen 2
- `src/components/onboarding/volume-picker.tsx` — screen 3
- `src/components/onboarding/bombshell-screen.tsx` — screen 4
- `src/components/onboarding/bridge-screen.tsx` — screen 5
- `src/components/onboarding/how-it-works-screen.tsx` — screen 6 (simplified variant of landing's `HowItWorks`)
- `src/components/onboarding/regeneration-primer.tsx` — small inline card shown beneath the result on screen 8
- `scripts/migrate-existing-users-onboarding.mjs` — one-shot migration to set the sentinel `onboardingCompletedAt` for pre-deploy users
- `tests/api/onboarding-progress.test.ts`
- `tests/api/onboarding-complete.test.ts`
- `tests/api/auth-confirm-autologin.test.ts`
- `tests/db/users-onboarding-helpers.test.ts`

**Modified files:**
- `src/types/index.ts` — add `Role`, `ListingsPerMonth`, extend `User` interface; update `free.credits` from 5 to 15
- `src/lib/db/users.ts` — add `updateOnboardingFields`, `markOnboardingComplete` helpers; `createUser` sets `onboardingCompletedAt` sentinel for admin plan
- `src/app/api/auth/confirm/route.ts` — after `confirmSignUp`, call `signIn` and return session cookies + `{ redirectTo: '/onboarding' }`
- `src/app/(auth)/signup/page.tsx` — on confirmed response, `router.push('/onboarding')` instead of showing the "Log in" card
- `src/app/dashboard/page.tsx` — if `onboardingCompletedAt` is null, redirect to `/onboarding`
- `src/app/stage/page.tsx` — same redirect check

**Files intentionally not touched:** the existing `/stage` wizard's internals, the landing page components, the Lambda worker. All reused, not forked.

---

## Task 1: User type extensions + free credits fix

**Files:**
- Modify: `src/types/index.ts`
- Test: (inline via Task 2's DB helper tests — type changes are verified by compile)

Role + listings-volume enums, extended User interface, and the locked-but-not-yet-applied free tier bump from 5 → 15 credits (per `project_pricing_locked.md` memory).

- [ ] **Step 1: Add `Role` and `ListingsPerMonth` unions to `src/types/index.ts`**

Append to the type definitions section (near `Plan`):

```ts
export type Role = 'solo-agent' | 'agency' | 'photographer' | 'property-manager';
export type ListingsPerMonth = '0-2' | '3-5' | '6-10' | '11+';
```

- [ ] **Step 2: Extend the `User` interface in `src/types/index.ts`** to include the three new optional fields:

```ts
// In the existing User interface, add:
role?: Role | null;
listingsPerMonth?: ListingsPerMonth | null;
onboardingCompletedAt?: string | null;
```

- [ ] **Step 3: Fix the locked free tier credit count** — update `PLANS.free.credits` from `5` to `15` and update the corresponding feature string:

```ts
// src/types/index.ts, PLANS.free:
free: {
  name: 'Free',
  credits: 15,
  priceAud: 0,
  isMonthly: false,
  isLifetime: false,
  features: [
    '15 credits to start',
    'Photorealistic staging',
    'Earn a free regeneration every 10 stages',
  ],
},
```

- [ ] **Step 4: Run TypeScript check**

Run: `npm run type-check`
Expected: PASS (no new errors; existing code compiles with the added optional fields).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add Role/ListingsPerMonth + onboardingCompletedAt to User; free=15 credits"
```

---

## Task 2: DB helpers — `updateOnboardingFields` + `markOnboardingComplete`

**Files:**
- Modify: `src/lib/db/users.ts`
- Test: `tests/db/users-onboarding-helpers.test.ts` (new)

- [ ] **Step 1: Write failing tests**

Create `tests/db/users-onboarding-helpers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright',
}));

import { updateOnboardingFields, markOnboardingComplete } from '@/lib/db/users';
import { dynamodb } from '@/lib/aws/dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

describe('updateOnboardingFields', () => {
  it('saves role', async () => {
    await updateOnboardingFields('u1', { role: 'solo-agent' });
    expect(dynamodb.send).toHaveBeenCalledOnce();
    const call = vi.mocked(dynamodb.send).mock.calls[0][0];
    expect(call).toBeInstanceOf(UpdateCommand);
    const input = (call as UpdateCommand).input;
    expect(input.Key).toEqual({ pk: 'USER#u1', sk: 'PROFILE' });
    expect(input.UpdateExpression).toMatch(/#role = :role/);
    expect(input.ExpressionAttributeValues?.[':role']).toBe('solo-agent');
  });

  it('saves listingsPerMonth', async () => {
    await updateOnboardingFields('u1', { listingsPerMonth: '3-5' });
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.ExpressionAttributeValues?.[':listingsPerMonth']).toBe('3-5');
  });

  it('saves both at once', async () => {
    await updateOnboardingFields('u1', { role: 'agency', listingsPerMonth: '11+' });
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.ExpressionAttributeValues?.[':role']).toBe('agency');
    expect(input.ExpressionAttributeValues?.[':listingsPerMonth']).toBe('11+');
  });

  it('noop when nothing provided', async () => {
    await updateOnboardingFields('u1', {});
    expect(dynamodb.send).not.toHaveBeenCalled();
  });
});

describe('markOnboardingComplete', () => {
  it('sets onboardingCompletedAt to an ISO timestamp', async () => {
    await markOnboardingComplete('u1');
    const input = (vi.mocked(dynamodb.send).mock.calls[0][0] as UpdateCommand).input;
    expect(input.Key).toEqual({ pk: 'USER#u1', sk: 'PROFILE' });
    expect(input.UpdateExpression).toMatch(/onboardingCompletedAt = :now/);
    const val = input.ExpressionAttributeValues?.[':now'];
    expect(typeof val).toBe('string');
    expect(() => new Date(val as string).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db/users-onboarding-helpers.test.ts`
Expected: FAIL with "updateOnboardingFields is not a function" and "markOnboardingComplete is not a function".

- [ ] **Step 3: Implement the helpers in `src/lib/db/users.ts`** — append after `addCredits`:

```ts
export async function updateOnboardingFields(
  userId: string,
  updates: { role?: import('@/types').Role; listingsPerMonth?: import('@/types').ListingsPerMonth },
): Promise<void> {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;

  const now = new Date().toISOString();
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': now };
  const setParts = ['updatedAt = :now'];

  for (const [key, val] of entries) {
    names[`#${key}`] = key;
    values[`:${key}`] = val;
    setParts.push(`#${key} = :${key}`);
  }

  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET onboardingCompletedAt = :now, updatedAt = :now',
      ExpressionAttributeValues: { ':now': now },
    }),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/users-onboarding-helpers.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/users.ts tests/db/users-onboarding-helpers.test.ts
git commit -m "feat(db): add updateOnboardingFields + markOnboardingComplete helpers"
```

---

## Task 3: `createUser` sets admin sentinel

**Files:**
- Modify: `src/lib/db/users.ts`
- Test: add to `tests/db/users-onboarding-helpers.test.ts`

When a user is created and their plan resolves to `admin` (detected via `ADMIN_EMAILS`), the new user record has `onboardingCompletedAt` set to the current timestamp — so Tara and admin emails never see onboarding.

- [ ] **Step 1: Add a failing test**

Append to `tests/db/users-onboarding-helpers.test.ts`:

```ts
vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return {
    ...actual,
    ADMIN_EMAILS: ['admin@example.com'],
  };
});

import { createUser } from '@/lib/db/users';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

describe('createUser', () => {
  it('sets onboardingCompletedAt for admin users', async () => {
    await createUser({ email: 'admin@example.com', name: 'Admin', cognitoSub: 'sub-a' });
    const put = vi.mocked(dynamodb.send).mock.calls.find(
      ([cmd]) => cmd instanceof PutCommand,
    )?.[0] as PutCommand | undefined;
    expect(put?.input.Item?.onboardingCompletedAt).toBeTypeOf('string');
  });

  it('leaves onboardingCompletedAt null for non-admin users', async () => {
    await createUser({ email: 'user@example.com', name: 'User', cognitoSub: 'sub-u' });
    const put = vi.mocked(dynamodb.send).mock.calls.find(
      ([cmd]) => cmd instanceof PutCommand,
    )?.[0] as PutCommand | undefined;
    expect(put?.input.Item?.onboardingCompletedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db/users-onboarding-helpers.test.ts -t createUser`
Expected: FAIL — `onboardingCompletedAt` is `undefined` on the stored item.

- [ ] **Step 3: Update `createUser` in `src/lib/db/users.ts`**

Modify the `User` object construction inside `createUser`:

```ts
const user: User = {
  pk: `USER#${id}`,
  sk: 'PROFILE',
  gsi1pk: 'EMAIL',
  gsi1sk: data.email.toLowerCase(),
  id,
  email: data.email.toLowerCase(),
  name: data.name,
  plan,
  creditsRemaining: isAdmin ? 999999 : planConfig.credits,
  creditsUsedAllTime: 0,
  role: null,
  listingsPerMonth: null,
  onboardingCompletedAt: isAdmin ? now : null,
  createdAt: now,
  updatedAt: now,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/users-onboarding-helpers.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/users.ts tests/db/users-onboarding-helpers.test.ts
git commit -m "feat(db): createUser sets onboardingCompletedAt sentinel for admin plan"
```

---

## Task 4: `POST /api/onboarding/progress` route

**Files:**
- Create: `src/app/api/onboarding/progress/route.ts`
- Test: `tests/api/onboarding-progress.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/onboarding-progress.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  updateOnboardingFields: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/onboarding/progress/route';
import { getSession } from '@/lib/auth/session';
import { updateOnboardingFields } from '@/lib/db/users';

const userSession = {
  user: { id: 'u1', email: 'u@x.com', name: 'U', plan: 'free', creditsRemaining: 15, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding/progress', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(userSession as any);
});

describe('POST /api/onboarding/progress', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ role: 'solo-agent' }));
    expect(res.status).toBe(401);
  });

  it('400 on invalid role', async () => {
    const res = await POST(makeReq({ role: 'wizard' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid listingsPerMonth', async () => {
    const res = await POST(makeReq({ listingsPerMonth: 'many' }));
    expect(res.status).toBe(400);
  });

  it('200 on role-only', async () => {
    const res = await POST(makeReq({ role: 'agency' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { role: 'agency' });
  });

  it('200 on volume-only', async () => {
    const res = await POST(makeReq({ listingsPerMonth: '6-10' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { listingsPerMonth: '6-10' });
  });

  it('200 on both at once', async () => {
    const res = await POST(makeReq({ role: 'photographer', listingsPerMonth: '11+' }));
    expect(res.status).toBe(200);
    expect(updateOnboardingFields).toHaveBeenCalledWith('u1', { role: 'photographer', listingsPerMonth: '11+' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/onboarding-progress.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route** — create `src/app/api/onboarding/progress/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { updateOnboardingFields } from '@/lib/db/users';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    role: z.enum(['solo-agent', 'agency', 'photographer', 'property-manager']).optional(),
    listingsPerMonth: z.enum(['0-2', '3-5', '6-10', '11+']).optional(),
  })
  .refine((v) => v.role !== undefined || v.listingsPerMonth !== undefined, {
    message: 'At least one of role or listingsPerMonth is required',
  });

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await updateOnboardingFields(session.user.id, parsed.data);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/onboarding-progress.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/progress/route.ts tests/api/onboarding-progress.test.ts
git commit -m "feat(api): POST /api/onboarding/progress for role + volume saves"
```

---

## Task 5: `POST /api/onboarding/complete` route

**Files:**
- Create: `src/app/api/onboarding/complete/route.ts`
- Test: `tests/api/onboarding-complete.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/onboarding-complete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  markOnboardingComplete: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/onboarding/complete/route';
import { getSession } from '@/lib/auth/session';
import { markOnboardingComplete } from '@/lib/db/users';

const userSession = {
  user: { id: 'u1', email: 'u@x.com', name: 'U', plan: 'free', creditsRemaining: 14, creditsUsedAllTime: 1, pk: 'USER#u1', sk: 'PROFILE' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(userSession as any);
});

function makeReq() {
  return new NextRequest('http://localhost/api/onboarding/complete', { method: 'POST' });
}

describe('POST /api/onboarding/complete', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('200 on success and calls markOnboardingComplete', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(markOnboardingComplete).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/onboarding-complete.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route** — create `src/app/api/onboarding/complete/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { markOnboardingComplete } from '@/lib/db/users';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await markOnboardingComplete(session.user.id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/onboarding-complete.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts tests/api/onboarding-complete.test.ts
git commit -m "feat(api): POST /api/onboarding/complete sets onboardingCompletedAt"
```

---

## Task 6: Auto-login after email confirmation

**Files:**
- Modify: `src/app/api/auth/confirm/route.ts`
- Test: `tests/api/auth-confirm-autologin.test.ts`

After `confirmSignUp`, the route needs a password to call `signIn`. The confirmation request doesn't normally include the password, so the signup page needs to pass it along (we already have it in local state at confirm time — safe to send over HTTPS to our own API).

- [ ] **Step 1: Write failing tests**

Create `tests/api/auth-confirm-autologin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/aws/cognito', () => ({
  confirmSignUp: vi.fn(async () => undefined),
  signIn: vi.fn(async () => ({
    AuthenticationResult: {
      AccessToken: 'at', IdToken: 'idt', RefreshToken: 'rt', ExpiresIn: 3600,
    },
  })),
}));

import { POST } from '@/app/api/auth/confirm/route';
import { confirmSignUp, signIn } from '@/lib/aws/cognito';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/auth/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/auth/confirm', () => {
  it('400 on invalid input', async () => {
    const res = await POST(makeReq({ email: 'not-email' }));
    expect(res.status).toBe(400);
  });

  it('confirms then signs in when password is provided', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456', password: 'SuperSecret1!' }));
    expect(res.status).toBe(200);
    expect(confirmSignUp).toHaveBeenCalledWith('a@b.com', '123456');
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'SuperSecret1!');
    const body = await res.json();
    expect(body.redirectTo).toBe('/onboarding');
    const setCookies = res.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((c) => c.startsWith('sr_access_token='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sr_id_token='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sr_refresh_token='))).toBe(true);
  });

  it('200 without auto-login when password is omitted (fallback)', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', code: '123456' }));
    expect(res.status).toBe(200);
    expect(confirmSignUp).toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.redirectTo).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/auth-confirm-autologin.test.ts`
Expected: FAIL — `signIn` not called, no `redirectTo` in response.

- [ ] **Step 3: Rewrite `src/app/api/auth/confirm/route.ts`**:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmSignUp, signIn } from '@/lib/aws/cognito';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  password: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    await confirmSignUp(parsed.data.email, parsed.data.code);

    if (!parsed.data.password) {
      return NextResponse.json({ message: 'Email confirmed. You can now log in.' });
    }

    const result = await signIn(parsed.data.email, parsed.data.password);
    const auth = result.AuthenticationResult;
    if (!auth?.AccessToken || !auth?.IdToken || !auth?.RefreshToken) {
      return NextResponse.json({ message: 'Email confirmed. You can now log in.' });
    }

    const response = NextResponse.json({
      message: 'Email confirmed',
      redirectTo: '/onboarding',
    });

    response.cookies.set('sr_access_token', auth.AccessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: auth.ExpiresIn || 3600,
      path: '/',
    });
    response.cookies.set('sr_id_token', auth.IdToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: auth.ExpiresIn || 3600,
      path: '/',
    });
    response.cookies.set('sr_refresh_token', auth.RefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Confirmation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/auth-confirm-autologin.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/confirm/route.ts tests/api/auth-confirm-autologin.test.ts
git commit -m "feat(auth): auto-login after email confirmation, redirect to /onboarding"
```

---

## Task 7: Signup page sends password + redirects to /onboarding

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Update `handleConfirm` in `src/app/(auth)/signup/page.tsx`** — pass `password` in the body and redirect on success:

Replace the existing `handleConfirm`:

```tsx
const handleConfirm = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const res = await fetch('/api/auth/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Confirmation failed');
    }

    const data = await res.json();
    if (data.redirectTo) {
      window.location.href = data.redirectTo;
      return;
    }

    // Fallback (password-less flow): show the old success card
    setConfirmed(true);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Confirmation failed');
  } finally {
    setLoading(false);
  }
};
```

(`window.location.href` is used instead of `router.push` so the new auth cookies are picked up by a fresh request.)

- [ ] **Step 2: Manual render check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/signup/page.tsx
git commit -m "feat(signup): send password with confirm, redirect to /onboarding on success"
```

---

## Task 8: Onboarding route shell + step state

**Files:**
- Create: `src/app/onboarding/page.tsx`
- Create: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/app/onboarding/page.tsx`** — server component, auth + already-complete redirect:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await getUserById(session.user.id);
  if (!user) redirect('/login');
  if (user.onboardingCompletedAt) redirect('/dashboard');

  return (
    <OnboardingFlow
      userName={user.name}
      initialRole={user.role ?? null}
      initialListingsPerMonth={user.listingsPerMonth ?? null}
    />
  );
}
```

- [ ] **Step 2: Create `src/app/onboarding/onboarding-flow.tsx`** — client component with the step enum and a placeholder switcher (screens filled in by later tasks):

```tsx
'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Role, ListingsPerMonth } from '@/types';

type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'volume'
  | 'bombshell'
  | 'bridge'
  | 'how-it-works'
  | 'upload'
  | 'generating'
  | 'result';

interface Props {
  userName: string;
  initialRole: Role | null;
  initialListingsPerMonth: ListingsPerMonth | null;
}

export function OnboardingFlow({ userName, initialRole, initialListingsPerMonth }: Props) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [role, setRole] = useState<Role | null>(initialRole);
  const [listingsPerMonth, setListingsPerMonth] = useState<ListingsPerMonth | null>(initialListingsPerMonth);

  return (
    <div
      className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex items-center justify-center"
          >
            {/* Screens added by later tasks. For now, welcome placeholder only. */}
            {step === 'welcome' && (
              <div className="text-center">
                <h1 className="font-heading text-4xl text-brand-navy">Hi {userName}</h1>
                <button
                  onClick={() => setStep('role')}
                  className="mt-6 bg-brand-navy text-white font-bold text-[19px] px-7 py-4 rounded-xl"
                >
                  Let&apos;s go
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): route shell + step-enum state placeholder"
```

---

## Task 9: Welcome screen (screen 1)

**Files:**
- Create: `src/components/onboarding/welcome-screen.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/components/onboarding/welcome-screen.tsx`**:

```tsx
'use client';

export function WelcomeScreen({ userName, onContinue }: { userName: string; onContinue: () => void }) {
  return (
    <div className="w-full max-w-xl mx-auto text-center px-5">
      <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4">
        Step 1 of 8
      </p>
      <h1 className="font-heading text-4xl sm:text-5xl text-brand-navy tracking-tight leading-tight">
        Hi {userName}.
        <span className="block mt-2 text-brand-teal">
          In 60 seconds you&apos;ll have your first staged listing.
        </span>
      </h1>
      <p className="mt-6 text-xl text-brand-navy font-medium leading-snug max-w-[40ch] mx-auto">
        Three quick questions, one photo, and you&apos;re done. Fifteen free credits are ready.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-10 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium"
      >
        Let&apos;s go
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it in to `onboarding-flow.tsx`** — replace the inline welcome placeholder:

```tsx
// Add import at top:
import { WelcomeScreen } from '@/components/onboarding/welcome-screen';

// In the step switch, replace the welcome branch:
{step === 'welcome' && (
  <WelcomeScreen userName={userName} onContinue={() => setStep('role')} />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/welcome-screen.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): welcome screen (step 1)"
```

---

## Task 10: Role picker (screen 2)

**Files:**
- Create: `src/components/onboarding/role-picker.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/components/onboarding/role-picker.tsx`**:

```tsx
'use client';

import type { Role } from '@/types';

const OPTIONS: { value: Role; label: string; sub: string }[] = [
  { value: 'solo-agent', label: 'Solo real estate agent', sub: 'Managing my own listings.' },
  { value: 'agency', label: 'Agency / team', sub: 'Part of a sales team or office.' },
  { value: 'photographer', label: 'Real estate photographer', sub: 'I shoot and stage for agents.' },
  { value: 'property-manager', label: 'Property manager', sub: 'Rental listings mostly.' },
];

export function RolePicker({
  selected,
  onPick,
  onBack,
}: {
  selected: Role | null;
  onPick: (role: Role) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-xl mx-auto px-5">
      <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4">
        Step 2 of 8
      </p>
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight">
        What do you do?
      </h1>
      <ul className="mt-8 flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              onClick={() => onPick(o.value)}
              className={
                selected === o.value
                  ? 'w-full text-left rounded-xl border-2 border-brand-teal bg-brand-teal/5 px-5 py-4 transition-colors'
                  : 'w-full text-left rounded-xl border-2 border-brand-navy bg-white px-5 py-4 hover:border-brand-teal hover:bg-brand-teal/5 transition-colors'
              }
            >
              <span className="block font-heading text-xl text-brand-navy leading-tight">
                {o.label}
              </span>
              <span className="block mt-1 text-[19px] text-brand-navy font-medium leading-snug">
                {o.sub}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="mt-8 text-[19px] font-bold text-brand-navy hover:text-brand-teal transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `onboarding-flow.tsx`** — persist the answer, advance automatically:

```tsx
// Add import:
import { RolePicker } from '@/components/onboarding/role-picker';

// Helper to persist progress (put near top of component):
const saveProgress = async (patch: { role?: Role; listingsPerMonth?: ListingsPerMonth }) => {
  await fetch('/api/onboarding/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
};

// In the step switch:
{step === 'role' && (
  <RolePicker
    selected={role}
    onPick={async (r) => {
      setRole(r);
      await saveProgress({ role: r });
      setStep('volume');
    }}
    onBack={() => setStep('welcome')}
  />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/role-picker.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): role picker (step 2) with auto-advance + save"
```

---

## Task 11: Volume picker (screen 3)

**Files:**
- Create: `src/components/onboarding/volume-picker.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/components/onboarding/volume-picker.tsx`** — structurally identical to RolePicker, different options:

```tsx
'use client';

import type { ListingsPerMonth } from '@/types';

const OPTIONS: { value: ListingsPerMonth; label: string; sub: string }[] = [
  { value: '0-2', label: '0–2 listings / month', sub: 'Just getting started.' },
  { value: '3-5', label: '3–5 listings / month', sub: 'Steady pipeline.' },
  { value: '6-10', label: '6–10 listings / month', sub: 'Active agent.' },
  { value: '11+', label: '11+ listings / month', sub: 'Running at volume.' },
];

export function VolumePicker({
  selected,
  onPick,
  onBack,
}: {
  selected: ListingsPerMonth | null;
  onPick: (v: ListingsPerMonth) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-xl mx-auto px-5">
      <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4">
        Step 3 of 8
      </p>
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight">
        Roughly how many listings do you manage each month?
      </h1>
      <ul className="mt-8 flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              onClick={() => onPick(o.value)}
              className={
                selected === o.value
                  ? 'w-full text-left rounded-xl border-2 border-brand-teal bg-brand-teal/5 px-5 py-4 transition-colors'
                  : 'w-full text-left rounded-xl border-2 border-brand-navy bg-white px-5 py-4 hover:border-brand-teal hover:bg-brand-teal/5 transition-colors'
              }
            >
              <span className="block font-heading text-xl text-brand-navy leading-tight">
                {o.label}
              </span>
              <span className="block mt-1 text-[19px] text-brand-navy font-medium leading-snug">
                {o.sub}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBack}
        className="mt-8 text-[19px] font-bold text-brand-navy hover:text-brand-teal transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `onboarding-flow.tsx`**:

```tsx
import { VolumePicker } from '@/components/onboarding/volume-picker';

// In the step switch:
{step === 'volume' && (
  <VolumePicker
    selected={listingsPerMonth}
    onPick={async (v) => {
      setListingsPerMonth(v);
      await saveProgress({ listingsPerMonth: v });
      setStep('bombshell');
    }}
    onBack={() => setStep('role')}
  />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/volume-picker.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): listings-per-month picker (step 3)"
```

---

## Task 12: Bombshell screen (screen 4)

**Files:**
- Create: `src/components/onboarding/bombshell-screen.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/components/onboarding/bombshell-screen.tsx`** — dual-pain on dark navy:

```tsx
'use client';

import type { ListingsPerMonth } from '@/types';

const VOLUME_LABEL: Record<ListingsPerMonth, string> = {
  '0-2': '0–2',
  '3-5': '3–5',
  '6-10': '6–10',
  '11+': '11+',
};

export function BombshellScreen({
  listingsPerMonth,
  onContinue,
  onBack,
}: {
  listingsPerMonth: ListingsPerMonth | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const volume = listingsPerMonth ? VOLUME_LABEL[listingsPerMonth] : 'your';

  return (
    <div className="w-full max-w-2xl mx-auto px-5 text-center">
      <p className="text-[19px] font-bold text-brand-teal-light uppercase tracking-wider mb-4">
        Step 4 of 8
      </p>

      <div className="rounded-2xl bg-brand-navy text-white p-8 sm:p-10">
        <div>
          <p className="font-heading text-6xl sm:text-8xl text-brand-teal-light tracking-tight tabular-nums leading-none">
            73%
          </p>
          <p className="mt-3 text-[19px] text-white font-bold leading-snug">
            longer on market than staged listings.
          </p>
          <p className="mt-3 text-[19px] text-white font-medium leading-snug">
            At {volume} listings per month, that&apos;s weeks — sometimes months — of delayed commissions every year.
          </p>
        </div>

        <div className="mt-8 pt-8 border-t-2 border-white/15">
          <p className="font-heading text-6xl sm:text-8xl text-brand-teal-light tracking-tight tabular-nums leading-none">
            $2,300+
          </p>
          <p className="mt-3 text-[19px] text-white font-bold leading-snug">
            per home, traditional staging.
          </p>
          <p className="mt-3 text-[19px] text-white font-medium leading-snug">
            At your volume, staging every listing the old way adds up fast.
          </p>
        </div>

        <p className="mt-8 pt-8 border-t-2 border-white/15 text-xl sm:text-2xl text-brand-teal-light font-bold italic leading-snug">
          Either way, empty listings cost you — in time or in cash.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium"
      >
        Continue
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="mt-4">
        <button
          type="button"
          onClick={onBack}
          className="text-[19px] font-bold text-brand-navy hover:text-brand-teal transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `onboarding-flow.tsx`**:

```tsx
import { BombshellScreen } from '@/components/onboarding/bombshell-screen';

// In the step switch:
{step === 'bombshell' && (
  <BombshellScreen
    listingsPerMonth={listingsPerMonth}
    onContinue={() => setStep('bridge')}
    onBack={() => setStep('volume')}
  />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/bombshell-screen.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): bombshell screen (step 4) with dual-pain cards"
```

---

## Task 13: Bridge screen (screen 5)

**Files:**
- Create: `src/components/onboarding/bridge-screen.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Create `src/components/onboarding/bridge-screen.tsx`**:

```tsx
'use client';

export function BridgeScreen({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  return (
    <div className="w-full max-w-2xl mx-auto px-5 text-center">
      <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4">
        Step 5 of 8
      </p>
      <h1 className="font-heading text-4xl sm:text-5xl text-brand-navy tracking-tight leading-tight">
        It doesn&apos;t have to be this way.
      </h1>
      <p className="mt-6 text-xl sm:text-2xl text-brand-navy font-medium leading-snug max-w-[50ch] mx-auto">
        StageRight gets every listing staged in under a minute, from $1.25 per
        image — less than 10% of what traditional staging costs.
      </p>
      <p className="mt-6 text-xl text-brand-teal font-bold leading-snug max-w-[50ch] mx-auto">
        Let&apos;s stage your first one now.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-10 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium"
      >
        Show me
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="mt-4">
        <button
          type="button"
          onClick={onBack}
          className="text-[19px] font-bold text-brand-navy hover:text-brand-teal transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `onboarding-flow.tsx`**:

```tsx
import { BridgeScreen } from '@/components/onboarding/bridge-screen';

// In the step switch:
{step === 'bridge' && (
  <BridgeScreen
    onContinue={() => setStep('how-it-works')}
    onBack={() => setStep('bombshell')}
  />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/bridge-screen.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): bridge screen (step 5)"
```

---

## Task 14: How-it-works screen (screen 6)

**Files:**
- Create: `src/components/onboarding/how-it-works-screen.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Simplified variant of the landing's `HowItWorks` — same 4 steps, smaller visual treatment, embedded in the onboarding rhythm.

- [ ] **Step 1: Create `src/components/onboarding/how-it-works-screen.tsx`**:

```tsx
'use client';

const STEPS = [
  { num: '01', title: 'Upload', who: 'You', time: '~5 sec', desc: 'Drop any photo of the room. Phone or camera.' },
  { num: '02', title: 'Read the room', who: 'We', time: '~5 sec', desc: 'Camera angle, light, openings. Done automatically.' },
  { num: '03', title: 'Stage it', who: 'We', time: '~30 sec', desc: 'Full-res photo, twelve curated styles.' },
  { num: '04', title: 'Regenerate (optional)', who: 'You', time: 'free', desc: 'Not quite right? Earn one every 10 stages.' },
];

export function HowItWorksScreen({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto px-5">
      <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
        Step 6 of 8
      </p>
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
        Here&apos;s how it works.
      </h1>
      <p className="mt-4 text-xl text-brand-navy font-medium leading-snug text-center max-w-[45ch] mx-auto">
        You do two small things. We do the two big ones. Total: about a minute.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {STEPS.map((s) => (
          <li
            key={s.num}
            className="rounded-xl bg-white border-2 border-brand-navy p-5 flex items-start gap-4"
          >
            <span className="font-heading text-3xl text-brand-teal tabular-nums leading-none mt-1">
              {s.num}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="font-heading text-xl text-brand-navy leading-tight">{s.title}</h3>
                <span className="text-[19px] font-bold text-brand-teal">
                  {s.who.startsWith('W') ? 'We handle' : 'You'} · {s.time}
                </span>
              </div>
              <p className="mt-1 text-[19px] text-brand-navy font-medium leading-snug">{s.desc}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium"
        >
          Ready — let&apos;s stage
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="mt-4">
          <button
            type="button"
            onClick={onBack}
            className="text-[19px] font-bold text-brand-navy hover:text-brand-teal transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `onboarding-flow.tsx`**:

```tsx
import { HowItWorksScreen } from '@/components/onboarding/how-it-works-screen';

{step === 'how-it-works' && (
  <HowItWorksScreen
    onContinue={() => setStep('upload')}
    onBack={() => setStep('bridge')}
  />
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/how-it-works-screen.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): how-it-works screen (step 6)"
```

---

## Task 15: Upload + style (screen 7) — embedded wizard

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Reuses `HeroUpload` and `StyleRow` directly. On Stage click, uploads to S3 (via `/api/upload`), then calls `/api/stage/batch` with a single style. The flow then advances to `generating`.

- [ ] **Step 1: Add upload + style UI in `onboarding-flow.tsx`**

Add these imports at the top:

```tsx
import { HeroUpload } from '@/components/wizard/hero-upload';
import { StyleRow } from '@/components/staging/style-row';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
import type { RoomPhoto } from '@/components/wizard/types';
```

Add state inside the component:

```tsx
const [heroPhoto, setHeroPhoto] = useState<RoomPhoto | null>(null);
const [activeStyle, setActiveStyle] = useState<StagingStyle>('Modern');
const [batchId, setBatchId] = useState<string | null>(null);
const [stageError, setStageError] = useState<string | null>(null);
```

Helper to upload the hero + start a batch (place near `saveProgress`):

```tsx
const startFirstStage = async () => {
  if (!heroPhoto) return;
  setStageError(null);
  try {
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: heroPhoto.base64, imageMimeType: heroPhoto.mimeType }),
    });
    if (!uploadRes.ok) throw new Error('Upload failed');
    const { s3Key } = await uploadRes.json();

    const stageRes = await fetch('/api/stage/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heroS3Key: s3Key,
        referenceS3Keys: [],
        roomTypes: [],
        styles: [activeStyle],
        notes: '',
        quality: 'standard',
      }),
    });
    if (!stageRes.ok) {
      const e = await stageRes.json();
      throw new Error(e.error || 'Staging failed');
    }
    const data = await stageRes.json();
    setBatchId(data.batchId);
    setStep('generating');
  } catch (err) {
    setStageError(err instanceof Error ? err.message : 'Staging failed');
  }
};
```

Add the upload/style UI in the switch:

```tsx
{step === 'upload' && (
  <div className="w-full max-w-4xl mx-auto px-5">
    <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
      Step 7 of 8
    </p>
    <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
      Your turn. Upload and pick a style.
    </h1>

    <div className="mt-8">
      <HeroUpload heroPhoto={heroPhoto} onChange={setHeroPhoto} />
    </div>

    <div className="mt-8">
      <p className="text-[19px] font-bold text-brand-navy mb-3">Pick a style:</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {STAGING_STYLES.map((s) => (
          <li key={s}>
            <StyleRow
              style={s}
              selected={activeStyle === s}
              onPick={() => setActiveStyle(s)}
              roomCategory="living"
              size="compact"
            />
          </li>
        ))}
      </ul>
    </div>

    {stageError && (
      <p className="mt-6 text-[19px] text-red-600 font-bold text-center" role="alert">
        {stageError}
      </p>
    )}

    <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
      <button
        type="button"
        disabled={!heroPhoto}
        onClick={startFirstStage}
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Stage this room (1 credit)
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): upload + style pick (step 7), calls /api/stage/batch"
```

---

## Task 16: Generating + result (screen 8)

**Files:**
- Create: `src/components/onboarding/regeneration-primer.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Polls `/api/jobs/batch?batchId=...` until the single sub-job status is `completed` or `failed`. On completion, calls `/api/onboarding/complete` and renders the result screen.

- [ ] **Step 1: Create `src/components/onboarding/regeneration-primer.tsx`**:

```tsx
'use client';

export function RegenerationPrimer() {
  return (
    <div className="mt-6 max-w-xl mx-auto rounded-xl border-2 border-brand-teal bg-white px-5 py-4 flex items-start gap-3">
      <span className="flex-shrink-0 size-3 rounded-full bg-brand-teal mt-1.5" />
      <p className="text-[19px] text-brand-navy font-medium leading-snug">
        You&apos;ve earned 1 of your 10 stages toward your first free regeneration.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Add generating + result UI in `onboarding-flow.tsx`**

Add imports:

```tsx
import { useEffect } from 'react';
import Link from 'next/link';
import { StagingLoader } from '@/components/staging/staging-loader';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { RegenerationPrimer } from '@/components/onboarding/regeneration-primer';
```

Add state:

```tsx
const [stagedUrl, setStagedUrl] = useState<string | null>(null);
const [originalUrl, setOriginalUrl] = useState<string | null>(null);
```

Polling effect (added inside the component body):

```tsx
useEffect(() => {
  if (step !== 'generating' || !batchId) return;
  let cancelled = false;
  const poll = async () => {
    try {
      const r = await fetch(`/api/jobs/batch?batchId=${encodeURIComponent(batchId)}`);
      if (!r.ok) throw new Error('Poll failed');
      const data = await r.json();
      const sub = data?.subJobs?.[0];
      if (!sub) return;
      if (sub.status === 'completed' && sub.imageUrl) {
        if (cancelled) return;
        setStagedUrl(sub.imageUrl);
        setOriginalUrl(heroPhoto?.preview ?? null);
        await fetch('/api/onboarding/complete', { method: 'POST' });
        setStep('result');
      } else if (sub.status === 'failed') {
        if (cancelled) return;
        setStageError(sub.error ?? 'Staging failed');
        setStep('upload');
      }
    } catch {
      // transient — we'll poll again
    }
  };
  const t = setInterval(poll, 2000);
  poll();
  return () => {
    cancelled = true;
    clearInterval(t);
  };
}, [step, batchId, heroPhoto]);
```

Add the two new branches to the step switch:

```tsx
{step === 'generating' && (
  <div className="w-full max-w-xl mx-auto px-5 text-center">
    <StagingLoader />
  </div>
)}

{step === 'result' && stagedUrl && originalUrl && (
  <div className="w-full max-w-4xl mx-auto px-5">
    <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
      Step 8 of 8 · Done
    </p>
    <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
      Your first staged listing.
    </h1>
    <p className="mt-3 text-[19px] text-brand-navy font-medium text-center">
      That used 1 of your 15 free credits. 14 left.
    </p>

    <div className="mt-8">
      <BeforeAfterSlider
        beforeSrc={originalUrl}
        afterSrc={stagedUrl}
        beforeLabel="Empty"
        afterLabel={activeStyle}
      />
    </div>

    <RegenerationPrimer />

    <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
      <Link
        href="/stage"
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium"
      >
        Try another style
      </Link>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150"
      >
        Go to dashboard
      </Link>
    </div>
  </div>
)}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/regeneration-primer.tsx src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): generating + result screens (step 8), marks completion"
```

---

## Task 17: Returning-user bypass + existing-user migration

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/stage/page.tsx`
- Create: `scripts/migrate-existing-users-onboarding.mjs`

- [ ] **Step 1: Add the redirect check to `src/app/dashboard/page.tsx`**

Find the top of the dashboard page (it's a client component with `useAuth`). Add a check that fires when `user` loads:

```tsx
// Inside the dashboard page component, after useAuth():
useEffect(() => {
  if (user && !user.onboardingCompletedAt) {
    router.replace('/onboarding');
  }
}, [user, router]);
```

(`user` must expose `onboardingCompletedAt` — already covered by Task 1's User type change.)

- [ ] **Step 2: Same check in `src/app/stage/page.tsx`** — near the top of the wizard's main component, after the session is known:

```tsx
useEffect(() => {
  if (user && !user.onboardingCompletedAt) {
    router.replace('/onboarding');
  }
}, [user, router]);
```

- [ ] **Step 3: Create the migration script** `scripts/migrate-existing-users-onboarding.mjs`:

```js
/**
 * One-shot migration: set onboardingCompletedAt sentinel for all users
 * created before the onboarding feature ships. Without this, existing
 * users would land in onboarding on their next visit.
 *
 * Usage:
 *   node scripts/migrate-existing-users-onboarding.mjs
 *
 * Safe to re-run — UpdateCommand with attribute_not_exists guard only
 * sets the field on users that don't have it yet.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-southeast-2';
const TABLE = 'stageright';
const SENTINEL = '2026-04-19T00:00:00.000Z';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  let cursor;
  let scanned = 0;
  let updated = 0;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
      ExclusiveStartKey: cursor,
    }));
    for (const item of res.Items ?? []) {
      scanned += 1;
      if (item.onboardingCompletedAt) continue;
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'SET onboardingCompletedAt = :s, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(onboardingCompletedAt)',
        ExpressionAttributeValues: { ':s': SENTINEL, ':now': new Date().toISOString() },
      })).catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException') throw e;
      });
      updated += 1;
    }
    cursor = res.LastEvaluatedKey;
  } while (cursor);
  console.log(`Scanned: ${scanned}, updated: ${updated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/stage/page.tsx scripts/migrate-existing-users-onboarding.mjs
git commit -m "feat(onboarding): returning-user bypass + existing-user migration"
```

---

## Task 18: Ship + verify

**Files:** none (deployment only)

- [ ] **Step 1: Push to master**

```bash
git push
```

- [ ] **Step 2: Watch Amplify build**

```bash
aws amplify list-jobs --app-id d88xgpqlfkk1w --branch-name master --region ap-southeast-2 --max-results 1 --query "jobSummaries[0].{jobId:jobId,status:status,commitId:commitId}" --output json
```

Expected: `"status": "SUCCEED"` within ~3 minutes.

- [ ] **Step 3: Run the existing-user migration script ONCE**

```bash
cd "$(git rev-parse --show-toplevel)"
node scripts/migrate-existing-users-onboarding.mjs
```

Expected output: `Scanned: N, updated: M` (where M = number of pre-existing non-admin users). Idempotent — safe to re-run if it fails partway.

- [ ] **Step 4: Manual smoke test**

1. Open an incognito window and sign up with a new email.
2. Enter the email confirmation code.
3. Verify the browser redirects directly to `/onboarding` (no manual log-in).
4. Click through: Welcome → Role (pick one) → Volume (pick one) → Bombshell → Bridge → How it works → Upload.
5. Upload a test room photo, pick any style, click "Stage this room".
6. Wait ~30 seconds for the staging to complete.
7. Verify the before/after slider shows your staged result.
8. Verify the regeneration primer card reads "1 of your 10 stages toward your first free regeneration".
9. Click "Go to dashboard". Verify you land on `/dashboard` and the credit counter reads 14.
10. Refresh `/onboarding`. Verify you're redirected to `/dashboard` (returning user bypass).

- [ ] **Step 5: Spot-check existing users unaffected**

Log in as an existing (non-admin) account. Verify you go straight to `/dashboard` (migration sentinel handled the bypass).

---

## Self-review (completed inline before handing back)

**Spec coverage** — every spec section maps to tasks:
- Spec §5 Architecture: Tasks 1, 2, 3, 4, 5, 8, 17.
- Spec §6 Flow: Tasks 9 (welcome), 10 (role), 11 (volume), 12 (bombshell), 13 (bridge), 14 (how-it-works), 15 (upload), 16 (generating + result).
- Spec §7 Components: covered by all screen tasks.
- Spec §8 Data flow: Tasks 4 (progress API), 5 (complete API), 6 (auto-login), 7 (signup redirect), 16 (completion call).
- Spec §9 Error handling: covered in Task 4 (400), Task 5 (401), Task 15 (`stageError` state), Task 16 (failed sub-job reverts to upload).
- Spec §10 Returning-user bypass: Task 17.
- Spec §11 Admin: Task 3 (admin sentinel in `createUser`).
- Spec §12 Deferred: no tasks needed — explicitly out of scope.

**Placeholder scan** — all tasks contain exact file paths, complete code, and exact commands. No TBD/TODO markers.

**Type consistency** — `Role` and `ListingsPerMonth` types introduced in Task 1 are used verbatim in Tasks 2, 4, 10, 11, 12. `OnboardingStep` enum introduced in Task 8 is used verbatim in all later screen tasks. Helper names (`updateOnboardingFields`, `markOnboardingComplete`) consistent across Tasks 2, 4, 5, 16.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-onboarding.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
