# Signup after onboarding — design spec

**Date:** 2026-05-08
**Status:** Approved, ready for implementation plan
**Brief:** Move the signup step from the front of the funnel to the end, just before the user lands on the dashboard. Strangers walk the cached onboarding flow first; we ask for credentials only after they've felt the product.

---

## Why

Today's flow asks a stranger for name / email / password / 6-digit code *before* they see anything. The 14-screen onboarding (welcome through fact-credit) only happens once they've already committed. That commitment-before-value ordering is the friction. Onboarding is fully cached and costs zero credits, so there is no technical reason to gate it behind authentication — that's just how the funnel grew.

This change reorders the funnel so the stranger sees the demo bedroom get staged in their chosen style *first*, then signs up at peak emotional engagement.

## Scope

In:
- `/onboarding` allows anonymous traffic.
- A new in-flow signup step at the end (after `fact-credit`, before `/dashboard`).
- Marketing-site CTAs repointed to `/onboarding`.
- Resend-code affordance on the in-flow verification screen.

Out:
- Auto-confirm via Cognito Lambda triggers (option 3 from brainstorming) — deferred. If telemetry later shows the verify-code step is the drop point, this becomes the next move.
- Magic-link / passwordless auth (option 4 from brainstorming) — deferred indefinitely.
- Password reset — separate pre-launch checklist item.
- `sessionStorage` stash of held onboarding answers if the user bails to `/login` mid-flow — polish.
- Plan-aware signup (`?plan=starter` → preselect a credit pack at signup) — comes with the paywall PR.

## Architecture

### New funnel (anonymous user)

```
landing
  → /onboarding (anonymous, 14 screens, answers held in React state)
  → new 'signup' step
      → form (name / email / password) → POST /api/auth/signup
      → confirm code → POST /api/auth/confirm
  → POST /api/onboarding/progress (flush held answers)
  → /dashboard
```

### Three states `/onboarding` handles at the `fact-credit` Continue button

| User state | Behaviour |
|---|---|
| Anonymous | `setStep('signup')` — show the in-flow signup |
| Authenticated, not completed | `router.push('/dashboard')` — current behaviour, signup step skipped |
| Authenticated admin | `router.push('/dashboard')` — current admin re-walk path |

### State model

Anonymous users hold all onboarding answers in `OnboardingFlow`'s React state — `role`, `listingsPerMonth`, `listingIntent`, `propertyType`, `activeStyle`. The `saveProgress(...)` helper short-circuits to a no-op when `!isAuthenticated`. On signup-confirm success, the held answers are POSTed to `/api/onboarding/progress` in one call before the dashboard redirect.

If that progress POST fails, the redirect happens anyway. The user is signed in and the answers are nice-to-have, not blocking.

### Existing `/signup` page stays alive

Direct visits, password-manager autofills, and Google-results clicks still land on `/signup`. After they confirm their email it redirects to `/onboarding` (current behaviour). Those users walk onboarding as authenticated traffic and the in-flow signup step is skipped at the end. Marketing-site links no longer point there, so most users will never see it.

## Files

### Modified

1. **`src/app/onboarding/page.tsx`**
   - Drop the `if (!session) redirect('/login')` line.
   - Pass `isAuthenticated: boolean` into `OnboardingFlow`.
   - When anonymous, `userName` is empty string; the welcome screen needs a copy fallback.

2. **`src/app/onboarding/onboarding-flow.tsx`**
   - Add `'signup'` to the `OnboardingStep` union.
   - Add `isAuthenticated` prop.
   - `saveProgress(...)` early-returns when `!isAuthenticated`.
   - `fact-credit`'s `onContinue` branches: anonymous → `setStep('signup')`; authenticated → `router.push('/dashboard')`.
   - Render `<SignupScreen />` when `step === 'signup'`.

3. **`src/components/onboarding/onboarding-progress-bar.tsx`**
   - Add `'signup'` to the progress map. Bar reads full at this step.

4. **`src/components/landing/nav.tsx`** — `/signup` → `/onboarding` (two places). `/login` link unchanged.

5. **`src/components/landing/hero.tsx`** — `/signup` → `/onboarding` (one place).

6. **`src/components/landing/footer.tsx`** — `/signup` → `/onboarding` (one place).

7. **`src/components/landing/pricing.tsx`** — `/signup?plan=…` → `/onboarding` (multiple places). Drop the `?plan=` suffix entirely; the paywall PR will reintroduce plan-handling at the right place.

### New

8. **`src/components/onboarding/signup-screen.tsx`** — the in-flow signup component. Two sub-states (form / confirm-code) wrapped in `OnboardingShell` with `OnboardingCta`. Hits the existing `/api/auth/signup` and `/api/auth/confirm` endpoints unchanged.

### Not modified

- `src/app/(auth)/signup/page.tsx` — back-door, unchanged.
- `src/app/api/auth/signup/route.ts` — unchanged.
- `src/app/api/auth/confirm/route.ts` — unchanged.
- `src/app/api/onboarding/progress/route.ts` — unchanged.
- `src/lib/aws/cognito.ts` — unchanged. (`resendConfirmationCode` already exists or is a one-line addition; verify during implementation.)

## SignupScreen UX

Component lives at `src/components/onboarding/signup-screen.tsx`. Both sub-states wrap `OnboardingShell` so the chrome (top progress bar + bottom CTA dock) stays continuous with every preceding onboarding screen.

### Sub-state A — form (default)

```
[progress bar — full]

           ALMOST THERE

      Save your rooms.

   Your gallery and your free credits
   are ready. We just need somewhere
   to send them.

   ┌────────────────────────────┐
   │ Name                       │
   ├────────────────────────────┤
   │ Email                      │
   ├────────────────────────────┤
   │ Password               👁  │
   └────────────────────────────┘
     Min 8 chars · upper · lower · number

       Already have an account? Log in

[──────  Continue  ──────────→]
```

Specifics:
- `Eyebrow` reads `ALMOST THERE`.
- h1 uses the existing display-font + terra-italic accent pattern: `Save your` ink, `rooms` terra italic.
- Inputs use the cream-soft / hairline / terra-focus-ring styling from the rest of the app, not the standalone `/signup` page's card styling.
- Password rules hint sits beneath the password field in `text-sr-ink-mute`.
- "Log in" link is a small inline `<Link href="/login">` underneath the rules hint. Quiet escape hatch. Anyone clicking it loses their held onboarding state — acceptable for v1.
- Primary CTA: `OnboardingCta` with label `Continue`. Disabled + label `Saving…` while POST is in flight.
- Errors render inline above the CTA, red pill style matching the existing `/signup`. The Cognito `UsernameExistsException` gets special copy: *"This email already has an account."* with the Log-in link styled prominently in the error block.
- Back arrow returns to `fact-credit`.

### Sub-state B — verification code

```
[progress bar — full]

           CHECK YOUR EMAIL

      We sent a code.

   Six digits, headed to
   tara@example.com

       ┌──────────────────┐
       │   1 2 3 4 5 6    │
       └──────────────────┘

       Didn't get it? Resend

[──────  Confirm  ──────────→]
```

Specifics:
- `Eyebrow` reads `CHECK YOUR EMAIL`.
- h1: `We sent a` ink, `code` terra italic.
- Confirms the typed email beneath as a typo-check.
- One input, `tracking-widest` centered, placeholder `123456`.
- "Didn't get it? Resend" link beneath the input. Disabled while a resend is in flight; switches to `Code resent` for ~3s after success, then back to `Resend`. Cognito `resendConfirmationCode` API. Errors surface inline.
- Primary CTA: `Confirm`. Disabled + `Confirming…` while POST is in flight.
- Back arrow returns to sub-state A so they can fix an email typo. Cognito treats the corrected email as a fresh signup — fine, the orphaned unconfirmed user expires in 24h.
- On success in this order: POST held onboarding state to `/api/onboarding/progress`, then `router.push('/dashboard')`. If progress POST fails, dashboard happens anyway.

### Animations

`AnimatePresence` cross-fades between sub-states A and B. Same `[0.16, 1, 0.3, 1]` cubic-bezier and 0.7s duration as every other onboarding step transition. Key switches on the sub-state.

## Edge cases

| Case | Behaviour |
|---|---|
| User typoes email at form, submits, gets code on wrong address | Backs out to sub-state A, fixes email, resubmits. Cognito creates a fresh unconfirmed user; orphaned one expires in 24h. |
| Email already has a confirmed account | Inline error + prominent Log-in link. Holds signup state on the form sub-state so user can switch email. |
| Email has an unconfirmed account from a prior abandoned signup | Cognito error string is `UsernameExistsException` — same path as above. v1 doesn't distinguish. (Polish: detect and offer Resend instead of Log-in.) |
| User reloads `/onboarding` mid-flow as anonymous | React state is lost; restart from welcome. Same as today for unauthenticated traffic (today there is none). Polish: sessionStorage stash. |
| User clicks Log-in link mid-signup | `/login` flow. Held onboarding state lost. Acceptable for v1. |
| Authenticated returning user (not completed) walks the flow | Behaves as today: `saveProgress` writes to DB on each choice; final Continue goes straight to `/dashboard` skipping the signup step. |
| Admin re-walks onboarding | Behaves as today: fresh state every visit, final Continue goes to `/dashboard`. |
| `/api/onboarding/progress` POST fails after confirm-code success | Dashboard redirect happens regardless. User is signed in. Held answers are lost. Logged for telemetry; not user-visible. |
| User submits form, navigates away before code arrives | Cognito holds the unconfirmed user for ~24h. They can use `/signup` directly to recover (current behaviour). |

## Risks

1. **More users abandon at the verify-code step than today.** Today the user types email/password then gets a code right after. In the new flow, by the time they see the code prompt they've spent ~3 minutes walking the editorial flow — abandonment at the email step is more costly. Mitigation: resend affordance, accurate copy ("Six digits, headed to {email}"). If this becomes a measured drop point, the next move is auto-confirm via Cognito Lambda trigger (option 3 from brainstorming).

2. **Held onboarding state lost on reload.** Anonymous users who reload the page mid-flow start from welcome. v1 accepts this; polish is sessionStorage. Likely impact: small — most users walk the flow in one sitting on one device.

3. **`/signup` back-door drift.** The standalone `/signup` page is no longer linked from marketing but stays reachable. If we add new fields to the in-flow signup later (e.g. role-targeting prompts, plan preselect), the back-door page will drift unless we explicitly mirror or replace it. Worth a comment in the back-door file pointing at the in-flow component.

## Success criteria

- A first-time visitor with no account reaches `/dashboard` having typed credentials exactly once, after the demo-bedroom reveal.
- The held onboarding answers (`role`, `listingsPerMonth`, `listingIntent`, `propertyType`) appear on their User record in DDB after first dashboard load.
- Existing flows continue to work: `/signup` direct visits still confirm and redirect; admin re-walk still starts fresh; authenticated returning users finish onboarding without seeing the signup step.
- The signup screen visually matches the rest of `/onboarding` (OnboardingShell chrome, Eyebrow, display-font h1 with terra italic, OnboardingCta).
- `next build` passes; `next type-check` passes.
