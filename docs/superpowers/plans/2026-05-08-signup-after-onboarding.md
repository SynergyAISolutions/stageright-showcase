# Signup-after-onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the signup step from the front of the StageRight funnel to the end, so anonymous users can walk the cached `/onboarding` flow and only sign up after the demo-bedroom reveal.

**Architecture:** `/onboarding` becomes the public entry point. Anonymous users hold all answers in React state for the duration of the flow; on the final `fact-credit` Continue (or commercial-waitlist Notify) we render an in-flow `SignupScreen` styled with the existing `OnboardingShell` / `OnboardingCta` / `Eyebrow` primitives. After Cognito confirm-code success we flush the held answers to `/api/onboarding/progress` and redirect to `/dashboard`. The standalone `/signup` page stays alive as a back-door for direct visitors and password-manager autofills.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, framer-motion, AWS Cognito (`@aws-sdk/client-cognito-identity-provider`), Zod.

**Spec:** `docs/superpowers/specs/2026-05-08-signup-after-onboarding-design.md`

---

## File map

**New:**
- `src/components/onboarding/signup-screen.tsx` — in-flow signup component with form / confirm-code sub-states + resend wiring.
- `src/app/api/auth/resend-code/route.ts` — POST endpoint that calls Cognito's `ResendConfirmationCodeCommand`.

**Modified:**
- `src/lib/aws/cognito.ts` — export a new `resendConfirmationCode(email)` helper.
- `src/app/onboarding/page.tsx` — drop the session-required redirect, pass `isAuthenticated` to `OnboardingFlow`.
- `src/app/onboarding/onboarding-flow.tsx` — add `'signup'` to `OnboardingStep` union, accept `isAuthenticated` prop, no-op `saveProgress` when anonymous, branch the `commercial` Notify and `fact-credit` Continue handlers on auth state, render `<SignupScreen />` at `step === 'signup'`.
- `src/components/onboarding/onboarding-progress-bar.tsx` — append `'signup'` to `STEP_ORDER`.
- `src/components/landing/nav.tsx` — `/signup` → `/onboarding` (two anchors).
- `src/components/landing/hero.tsx` — `/signup` → `/onboarding`.
- `src/components/landing/footer.tsx` — `/signup` → `/onboarding`.
- `src/components/landing/pricing.tsx` — `/signup?plan=…` → `/onboarding` (drop the query suffix).

**Untouched:**
- `src/app/(auth)/signup/page.tsx`, `src/app/api/auth/signup/route.ts`, `src/app/api/auth/confirm/route.ts`, `src/app/api/onboarding/progress/route.ts`.

---

## Task 1: Cognito `resendConfirmationCode` helper

**Files:**
- Modify: `src/lib/aws/cognito.ts`

- [ ] **Step 1: Extend the SDK import**

In `src/lib/aws/cognito.ts`, change the import block at lines 7-17 to add `ResendConfirmationCodeCommand`:

```typescript
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  type AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
```

- [ ] **Step 2: Add the helper export**

Append a new section directly under the existing `confirmSignUp` function (around line 47, before the `// ---------- Sign In ----------` heading):

```typescript
export async function resendConfirmationCode(email: string) {
  const command = new ResendConfirmationCodeCommand({
    ClientId: CLIENT_ID,
    Username: email,
  });
  return cognitoClient.send(command);
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/aws/cognito.ts
git commit -m "feat(cognito): add resendConfirmationCode helper"
```

---

## Task 2: `/api/auth/resend-code` route

**Files:**
- Create: `src/app/api/auth/resend-code/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/auth/resend-code/route.ts` with this content:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resendConfirmationCode } from '@/lib/aws/cognito';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    await resendConfirmationCode(parsed.data.email);
    return NextResponse.json({ message: 'Confirmation code resent.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Resend failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/resend-code/route.ts
git commit -m "feat(api): POST /api/auth/resend-code"
```

---

## Task 3: `SignupScreen` component

**Files:**
- Create: `src/components/onboarding/signup-screen.tsx`

The component is one cohesive unit; we write it in one step then verify.

- [ ] **Step 1: Create the component file**

Create `src/components/onboarding/signup-screen.tsx` with this content:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type { ListingIntent, ListingsPerMonth, PropertyType, Role } from '@/types';
import { Eyebrow } from './eyebrow';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';

const EXPO = [0.16, 1, 0.3, 1] as const;

export type HeldOnboardingState = {
  role: Role | null;
  listingsPerMonth: ListingsPerMonth | null;
  listingIntent: ListingIntent | null;
  propertyType: PropertyType | null;
};

type Phase = 'form' | 'code';

export function SignupScreen({
  heldState,
  onBack,
}: {
  heldState: HeldOnboardingState;
  onBack: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resending, setResending] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const showResentLabel = resentAt !== null && Date.now() - resentAt < 3000;

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailExists(false);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (r.status === 409) {
        setEmailExists(true);
        setError('This email already has an account.');
        return;
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not create your account.');
        return;
      }
      setPhase('code');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not confirm your email.');
        return;
      }
      const patch: Partial<HeldOnboardingState> = {};
      if (heldState.role) patch.role = heldState.role;
      if (heldState.listingsPerMonth) patch.listingsPerMonth = heldState.listingsPerMonth;
      if (heldState.listingIntent) patch.listingIntent = heldState.listingIntent;
      if (heldState.propertyType) patch.propertyType = heldState.propertyType;
      if (Object.keys(patch).length > 0) {
        await fetch('/api/onboarding/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {});
      }
      router.push('/dashboard');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending) return;
    setError(null);
    setResending(true);
    try {
      const r = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.error ?? 'Could not resend the code.');
        return;
      }
      setResentAt(Date.now());
    } catch {
      setError('Network error. Try again.');
    } finally {
      setResending(false);
    }
  }

  const ctaLabel =
    phase === 'form'
      ? submitting
        ? 'Saving…'
        : 'Continue'
      : submitting
        ? 'Confirming…'
        : 'Confirm';

  return (
    <OnboardingShell
      cta={
        <OnboardingCta
          label={ctaLabel}
          type="submit"
          disabled={submitting}
          onClick={() => {
            const form = document.getElementById('signup-form') as HTMLFormElement | null;
            form?.requestSubmit();
          }}
        />
      }
    >
      <button
        type="button"
        onClick={() => (phase === 'code' ? setPhase('form') : onBack())}
        aria-label="Back"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 text-sr-ink/60 hover:text-sr-ink transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M13 5l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence mode="wait">
        {phase === 'form' ? (
          <motion.form
            key="form"
            id="signup-form"
            onSubmit={handleSignup}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, ease: EXPO }}
            className="w-full max-w-[34ch] sm:max-w-[42ch] flex flex-col items-center text-center"
          >
            <Eyebrow>Almost there</Eyebrow>

            <h1 className="mt-3 font-display text-sr-ink text-[36px] sm:text-[52px] lg:text-[68px] leading-[1.0] tracking-[-0.025em]">
              Save your <span className="italic text-sr-terra">rooms</span>.
            </h1>

            <p className="mt-5 sm:mt-6 text-[15px] sm:text-[17px] text-sr-ink/70 leading-snug">
              Your gallery and your free credits are ready. We just need somewhere to send them.
            </p>

            <div className="mt-8 sm:mt-10 w-full flex flex-col gap-3.5 text-left">
              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-medium text-sr-ink-mute uppercase tracking-[0.18em] mb-1.5">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full text-[15px] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 pr-11 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-sr-ink-mute hover:text-sr-ink transition-colors"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path d="M3 3l14 14M8.5 4.2A9 9 0 0110 4c4 0 7.5 3 9 6a10.5 10.5 0 01-2.1 2.9M6.1 6.1A10.4 10.4 0 001 10c1.5 3 5 6 9 6 1.5 0 2.9-.4 4.1-1M8.5 8.5a2 2 0 002.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path d="M1 10c1.5-3 5-6 9-6s7.5 3 9 6c-1.5 3-5 6-9 6s-7.5-3-9-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-sr-ink-mute">Min 8 characters &middot; upper &middot; lower &middot; number</p>
              </label>
            </div>

            {error && (
              <div className="mt-5 w-full text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-left">
                {error}
                {emailExists && (
                  <>
                    {' '}
                    <Link href="/login" className="font-medium text-red-800 underline">Log in</Link>
                  </>
                )}
              </div>
            )}

            <Link
              href="/login"
              className="mt-6 text-[13px] text-sr-ink/60 hover:text-sr-ink"
            >
              Already have an account? <span className="text-sr-terra font-medium">Log in</span>
            </Link>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            id="signup-form"
            onSubmit={handleConfirm}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, ease: EXPO }}
            className="w-full max-w-[34ch] sm:max-w-[42ch] flex flex-col items-center text-center"
          >
            <Eyebrow>Check your email</Eyebrow>

            <h1 className="mt-3 font-display text-sr-ink text-[36px] sm:text-[52px] lg:text-[68px] leading-[1.0] tracking-[-0.025em]">
              We sent a <span className="italic text-sr-terra">code</span>.
            </h1>

            <p className="mt-5 sm:mt-6 text-[15px] sm:text-[17px] text-sr-ink/70 leading-snug">
              Six digits, headed to <span className="text-sr-ink font-medium">{email}</span>.
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              maxLength={6}
              placeholder="123456"
              className="mt-8 sm:mt-10 w-full max-w-[20ch] text-center text-2xl tracking-[0.5em] text-sr-ink bg-sr-cream-soft border border-sr-hairline rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-sr-terra/30 focus:border-sr-terra/40"
            />

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="mt-5 text-[13px] text-sr-ink/60 hover:text-sr-ink disabled:opacity-50"
            >
              {showResentLabel ? 'Code resent' : resending ? 'Sending…' : 'Didn’t get it? Resend'}
            </button>

            {error && (
              <div className="mt-5 w-full text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-left">
                {error}
              </div>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/signup-screen.tsx
git commit -m "feat(onboarding): SignupScreen component (form + confirm-code + resend)"
```

---

## Task 4: Update onboarding progress bar

**Files:**
- Modify: `src/components/onboarding/onboarding-progress-bar.tsx`

- [ ] **Step 1: Append `'signup'` to STEP_ORDER**

In `src/components/onboarding/onboarding-progress-bar.tsx`, change the `STEP_ORDER` array (lines 6-23) to add `'signup'` as the final entry:

```typescript
const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'listing-type',
  'commercial',
  'volume',
  'bombshell',
  'bridge',
  'how-it-works',
  'upload',
  'rooms',
  'style',
  'generating',
  'result',
  'disclosure-perks',
  'fact-ai',
  'fact-credit',
  'signup',
];
```

- [ ] **Step 2: Commit**

(Type-check happens after the next task — `OnboardingStep` doesn't yet include `'signup'` until Task 5.)

```bash
git add src/components/onboarding/onboarding-progress-bar.tsx
git commit -m "feat(onboarding): add signup step to progress bar order"
```

---

## Task 5: Wire signup into `OnboardingFlow`

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Add the `'signup'` step to the union**

In `src/app/onboarding/onboarding-flow.tsx`, change the `OnboardingStep` type (lines 36-53) by adding `'signup'`:

```typescript
export type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'listing-type'
  | 'commercial'
  | 'volume'
  | 'bombshell'
  | 'bridge'
  | 'how-it-works'
  | 'demo-room'
  | 'upload'
  | 'rooms'
  | 'style'
  | 'generating'
  | 'result'
  | 'disclosure-perks'
  | 'fact-ai'
  | 'fact-credit'
  | 'signup';
```

- [ ] **Step 2: Add `isAuthenticated` to the `Props` interface**

Change the `Props` interface (lines 55-59):

```typescript
interface Props {
  userName: string;
  initialRole: Role | null;
  initialListingsPerMonth: ListingsPerMonth | null;
  isAuthenticated: boolean;
}
```

- [ ] **Step 3: Destructure the new prop**

Change the function signature on line 61:

```typescript
export function OnboardingFlow({ userName, initialRole, initialListingsPerMonth, isAuthenticated }: Props) {
```

- [ ] **Step 4: Make `saveProgress` a no-op when anonymous**

Change the `saveProgress` helper (lines 113-125) so it skips the network call for anonymous users:

```typescript
  // Fire-and-forget: a flaky network must not strand the user mid-onboarding.
  // Anonymous users have no DB record yet, so we hold the answers in React
  // state and flush them inside SignupScreen after confirm-code success.
  const saveProgress = (patch: {
    role?: Role;
    listingsPerMonth?: ListingsPerMonth;
    listingIntent?: ListingIntent;
    propertyType?: PropertyType;
  }) => {
    if (!isAuthenticated) return;
    void fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };
```

- [ ] **Step 5: Branch the `commercial` Notify handler**

Change the `commercial` case (currently lines 211-222) so anonymous Notify users land in signup instead of jumping straight to `/dashboard`:

```tsx
            {step === 'commercial' && (
              <CommercialNoticeScreen
                onNotify={() => {
                  // propertyType=commercial is held in state; SignupScreen
                  // flushes it to /api/onboarding/progress after confirm-code.
                  // Authenticated users (admin re-walk, returning incompletes)
                  // already saved it via saveProgress on listing-type.
                  if (isAuthenticated) {
                    router.push('/dashboard');
                  } else {
                    setStep('signup');
                  }
                }}
                onTryAnyway={() => setStep('style')}
                onBack={() => setStep('listing-type')}
              />
            )}
```

- [ ] **Step 6: Branch the `fact-credit` Continue handler**

Change the `fact-credit` case (currently lines 345-350):

```tsx
            {step === 'fact-credit' && (
              <FactCreditScreen
                onContinue={() => {
                  if (isAuthenticated) {
                    router.push('/dashboard');
                  } else {
                    setStep('signup');
                  }
                }}
                onBack={() => setStep('fact-ai')}
              />
            )}
```

- [ ] **Step 7: Add the SignupScreen import**

Near the top of the file, add the import (group with the other onboarding component imports around line 33):

```typescript
import { SignupScreen, type HeldOnboardingState } from '@/components/onboarding/signup-screen';
```

- [ ] **Step 8: Render `<SignupScreen />` in the AnimatePresence block**

Add a new branch directly before the closing `</motion.div>` (after the `fact-credit` case from Step 6):

```tsx
            {step === 'signup' && (
              <SignupScreen
                heldState={{
                  role,
                  listingsPerMonth,
                  listingIntent,
                  propertyType,
                }}
                onBack={() => setStep('fact-credit')}
              />
            )}
```

- [ ] **Step 9: Type-check**

Run: `npm run type-check`
Expected: PASS. (This is the first time `OnboardingStep` includes `'signup'`, so the progress bar from Task 4 now type-checks against the same union.)

- [ ] **Step 10: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): branch fact-credit + commercial on auth state, render SignupScreen"
```

---

## Task 6: Allow anonymous traffic into `/onboarding`

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace the file content**

Replace the entire content of `src/app/onboarding/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUserById } from '@/lib/db/users';
import { ADMIN_EMAILS } from '@/types';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getSession();

  // Anonymous users walk the cached onboarding flow with no DB record.
  // They sign up at the end via the in-flow SignupScreen, which flushes
  // their held answers to /api/onboarding/progress before redirecting
  // to /dashboard.
  if (!session) {
    return (
      <OnboardingFlow
        userName=""
        initialRole={null}
        initialListingsPerMonth={null}
        isAuthenticated={false}
      />
    );
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return (
      <OnboardingFlow
        userName=""
        initialRole={null}
        initialListingsPerMonth={null}
        isAuthenticated={false}
      />
    );
  }

  // Admin emails always re-walk the flow — used for QA / dogfooding the
  // onboarding experience. They start fresh every visit (no pre-selected
  // role / volume) so they feel exactly what a new user does.
  const isAdmin = ADMIN_EMAILS.includes(user.email);

  if (user.onboardingCompletedAt && !isAdmin) redirect('/dashboard');

  return (
    <OnboardingFlow
      userName={user.name}
      initialRole={isAdmin ? null : (user.role ?? null)}
      initialListingsPerMonth={isAdmin ? null : (user.listingsPerMonth ?? null)}
      isAuthenticated
    />
  );
}
```

- [ ] **Step 2: Verify the welcome-screen handles empty `userName`**

Run: `npm run type-check`
Expected: PASS.

Then open `src/components/onboarding/welcome-screen.tsx` and read the h1 (around lines 43-52). It currently reads `Hi, <span italic terra>{userName}</span>.` — when `userName` is an empty string this renders as `Hi, .` which is broken. Add a fallback:

Change the h1 contents (the `Hi, ...` line) to:

```tsx
            {userName ? (
              <>
                Hi, <span className="italic text-sr-terra">{userName}</span>.
                <br />
                Let&apos;s take it for a <span className="italic text-sr-terra">spin</span>.
              </>
            ) : (
              <>
                Let&apos;s take it for a{' '}
                <span className="italic text-sr-terra">spin</span>.
              </>
            )}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx src/components/onboarding/welcome-screen.tsx
git commit -m "feat(onboarding): allow anonymous traffic; welcome falls back when no name"
```

---

## Task 7: Repoint marketing CTAs to `/onboarding`

**Files:**
- Modify: `src/components/landing/nav.tsx`
- Modify: `src/components/landing/hero.tsx`
- Modify: `src/components/landing/footer.tsx`
- Modify: `src/components/landing/pricing.tsx`

- [ ] **Step 1: `nav.tsx`**

In `src/components/landing/nav.tsx`, change both occurrences of `href="/signup"` (around lines 100 and 163) to `href="/onboarding"`. Leave `href="/login"` (lines 91 and 157) unchanged.

- [ ] **Step 2: `hero.tsx`**

In `src/components/landing/hero.tsx`, change the single `href="/signup"` (around line 105) to `href="/onboarding"`.

- [ ] **Step 3: `footer.tsx`**

In `src/components/landing/footer.tsx`, change the link entry on line 18 from `{ href: '/signup', label: 'Get started' }` to `{ href: '/onboarding', label: 'Get started' }`.

- [ ] **Step 4: `pricing.tsx` — drop the `?plan=` suffix**

In `src/components/landing/pricing.tsx`, change every `href: '/signup?plan=…'` and the bare `href="/signup"` (around lines 41, 50, 59, 69, 82, 92, 315) to use `'/onboarding'` (no query string). Use `replace_all` semantics where safe — but verify visually because the file may contain unrelated `/signup` strings.

Run: `grep -n "/signup" src/components/landing/pricing.tsx` (or the equivalent in your shell) to confirm no `/signup` references remain in this file after the edits.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS. (`next build`, not just type-check — the apostrophe-escape constraint can sneak in here per `feedback_apostrophes.md`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/nav.tsx src/components/landing/hero.tsx src/components/landing/footer.tsx src/components/landing/pricing.tsx
git commit -m "feat(landing): repoint Get-started CTAs to /onboarding"
```

---

## Task 8: Manual browser verification

This task has no code. It is the verification gate before reporting the work complete, per the project's UI-verification convention.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Note the actual port — if a zombie process is holding 3000, Next will port-hop to 3001/3002. Use the port the terminal prints, not the assumed one.

- [ ] **Step 2: Verify the anonymous funnel — happy path**

In a private/incognito browser window (so no session cookie):

1. Visit the landing page (`http://localhost:<port>/`).
2. Click "Get started" in the nav. URL should be `/onboarding`. The welcome screen should render with the no-name fallback ("Let's take it for a spin.").
3. Walk through every step: welcome → role → listing-type → volume → bombshell → bridge → how-it-works → demo-room → style (pick any style) → generating (~20s) → result → disclosure-perks → fact-ai → fact-credit.
4. Click Continue on `fact-credit`. Confirm you land on the `signup` step (NOT `/dashboard`). The progress bar should read full.
5. Confirm the form sub-state renders: `ALMOST THERE` eyebrow, `Save your rooms.` h1 with terra italic, three labelled inputs, password rules hint, "Already have an account? Log in" beneath.
6. Submit with name + a fresh email + an 8+ char password (upper / lower / number).
7. The screen cross-fades to the code sub-state: `CHECK YOUR EMAIL` eyebrow, `We sent a code.` h1, the typed email shown beneath, code input, "Didn't get it? Resend" link.
8. Open the inbox of the email you typed, paste the 6-digit code, click `Confirm`.
9. Confirm you land on `/dashboard`.

- [ ] **Step 3: Verify the held onboarding state was flushed**

Open the dashboard. Confirm credits read 14 (the free-trial allotment). Then in DynamoDB (or via your existing admin tooling), check the User record for the email you signed up with. Confirm `role`, `listingsPerMonth`, `listingIntent`, and `propertyType` match the choices you made during onboarding.

- [ ] **Step 4: Verify the resend-code affordance**

Repeat steps 2.1–2.7 with a new email. On the code screen, click "Didn't get it? Resend". Confirm the link briefly reads "Code resent", a fresh code arrives in the inbox, and entering that fresh code works.

- [ ] **Step 5: Verify the email-already-exists branch**

Repeat steps 2.1–2.6 using the SAME email you just signed up with. The form-submit response should populate the inline red error block with "This email already has an account." and an underlined "Log in" link. Click the link — confirm it routes to `/login`.

- [ ] **Step 6: Verify the commercial waitlist Notify path for anonymous users**

In a fresh incognito window: visit `/onboarding` → walk to the listing-type step → pick the commercial option. Confirm the `commercial-notice-screen` renders. Click "Notify me." Confirm you land on the `signup` step (NOT `/dashboard`). Submit signup. Confirm `propertyType=commercial` is saved on the User record after dashboard.

- [ ] **Step 7: Verify authenticated paths still work**

Log in (regular browser tab, not incognito) as an admin. Visit `/onboarding`. Walk to the end — the `fact-credit` Continue should route directly to `/dashboard`, NOT to the signup step. Same check for the commercial Notify path: it should route directly to `/dashboard`.

- [ ] **Step 8: Verify the back-door `/signup` page still works**

Direct-visit `http://localhost:<port>/signup`. Sign up with a fresh email. Confirm-code flow should redirect you to `/onboarding` (existing behaviour unchanged). Walk through onboarding — at the end, `fact-credit` Continue should route directly to `/dashboard` (because by this point you're authenticated), NOT to the in-flow signup step.

- [ ] **Step 9: Verify marketing CTAs**

Visit the landing page. Confirm: nav "Get started", hero CTA, every pricing tile button, and the footer "Get started" link all point at `/onboarding` (hover the link — bottom of the browser window shows the URL).

- [ ] **Step 10: Final commit if any verification fixes were needed**

If steps 2–9 surfaced bugs that required fixes, commit them now.

```bash
git status
# review changes, then if any:
git add -p
git commit -m "fix(onboarding): <what you fixed>"
```

If steps 2–9 all passed cleanly, no further commit is needed — the verification task itself produces no code.

---

## Self-review checklist (already run by the planning author)

- **Spec coverage:** every spec section has a task. New entry point (Task 6), in-flow signup component (Task 3), commercial branching (Task 5 step 5), held-state flush after confirm-code (Task 3), resend code (Tasks 1–3), marketing repoint (Task 7), `/signup` back-door untouched (Tasks 1–7 leave it alone, Task 8 step 8 verifies).
- **Placeholder scan:** no TBDs, TODOs, "implement later", "similar to Task N", "appropriate error handling". Every code step shows the actual code.
- **Type consistency:** `HeldOnboardingState` is defined in Task 3 and imported by name in Task 5. `OnboardingStep` includes `'signup'` after Task 5. `STEP_ORDER` in Task 4 references the union before Task 5 adds the variant — Task 4 deliberately commits without a type-check; Task 5 step 9 is the first place the union and the array agree.
- **Risk:** Task 4 commits a temporarily-broken state (progress bar references a step that doesn't exist in the union yet). Acceptable because Task 5 lands immediately after and a partial-build state isn't deployed mid-stream. If using subagent-driven execution where each task is reviewed independently, the reviewer should treat Task 4 + Task 5 as a unit and only run `npm run type-check` after Task 5.
