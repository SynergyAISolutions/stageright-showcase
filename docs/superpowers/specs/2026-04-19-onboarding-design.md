# StageRight Onboarding — Design Spec

**Date:** 2026-04-19
**Status:** Approved by Tara, ready for implementation plan
**Skill trail:** `superpowers:brainstorming` → this spec → `superpowers:writing-plans`

---

## 1. Purpose

StageRight's landing + pricing are shipped. Signup works but the post-signup experience is a dead end — the user finishes email confirmation, clicks back to `/login`, signs in manually, lands on `/dashboard` staring at a credit counter. No narrative, no "see yourself in the product" moment, no immediate path to their first real stage. Drop-off between signup and first stage is almost certainly costing conversions.

Onboarding has to do three things in one run:

1. **Collect a minimum of segmentation data** (role + volume) so pricing conversations later are personal and so we can cohort in analytics.
2. **Sell the value** — make the agent feel the pain of NOT using StageRight (delayed commissions, expensive physical staging) and the relief of using it.
3. **Deliver the aha moment** — get them all the way through their first real staged listing photo before they leave the session. Prayer Lock's core lesson: *make them DO the core action inside onboarding*.

## 2. Success criteria

- A new-user signup ends with a staged room, not a dashboard. Measured by `onboardingCompletedAt` being set for ≥70 % of new signups in the first 30 days after ship.
- Role + volume captured on ≥90 % of new accounts.
- Signup → first-stage conversion (within 24 hours) jumps meaningfully from the current baseline (expected >2× but we don't have a good baseline yet — treat as exploratory).
- First stage uses 1 of the 15 free credits — leaves 14 in the account when they land on the dashboard.

## 3. Principles carried forward (from Prayer Lock playbook)

- **Personalisation early.** Use `{name}` from signup on screen 1.
- **One job per screen.** Don't combine multiple questions, don't combine bombshell + bridge.
- **Bombshell as pure pain.** The user must feel the cost of the status quo before the bridge relieves it. Separate screens, not combined.
- **Make them DO the core action.** First stage lives inside onboarding, not as a handoff afterwards.
- **Review modal at emotional peak.** DEFERRED — we don't have an app store surface yet. Will wire up on Play Store launch.

## 4. Principles explicitly NOT carried forward

- **29-screen count.** Target 5–8 for B2B. Landed on 8.
- **Cialdini commitment screens.** "How committed are you?" feels manipulative in a B2B context where the user is an agent being judged professionally.
- **Age / phone-usage data.** Wrong market. We ask role + listings volume instead — the B2B equivalents.
- **Hard paywall with trial-countdown push.** We give 15 free credits on signup; the pricing tier decision happens later, softly, when credits run low.
- **Social proof screen with user counts / reviews.** We don't have real numbers yet. Faking them violates the "copy only what is shipped" rule.
- **Skip-to-end escape hatch.** No. Every new user goes through. They just signed up; they have the runway.

## 5. Architecture

### Route

New route: `/onboarding`.

- Wrapped in the authenticated-layout group.
- Redirects to `/login` if no session.
- Redirects to `/dashboard` if `onboardingCompletedAt` is already set (returning user landed here by accident).

### State

Single client component at `/onboarding` with a step enum:

```ts
type OnboardingStep =
  | 'welcome'       // screen 1
  | 'role'          // screen 2
  | 'volume'        // screen 3
  | 'bombshell'     // screen 4
  | 'bridge'        // screen 5
  | 'how-it-works'  // screen 6
  | 'upload'        // screen 7: embedded wizard upload + style pick
  | 'generating'    // transient, wizard's existing generating step
  | 'result';       // screen 8
```

Wizard screens 7–`generating`–`result` reuse the existing `/stage` wizard's internal components (`HeroUpload`, `StyleRow` grid, `StagingLoader`, `BeforeAfterSlider`, etc.) to avoid forking. The `/onboarding` page is a thin shell that progresses through its own step enum while delegating UI to the same primitives the wizard uses.

### Data model (user record additions)

Three new fields on the user's DynamoDB record (`pk = USER#<id>, sk = PROFILE`):

```ts
{
  role: 'solo-agent' | 'agency' | 'photographer' | 'property-manager' | null;
  listingsPerMonth: '0-2' | '3-5' | '6-10' | '11+' | null;
  onboardingCompletedAt: string | null; // ISO timestamp
}
```

All three are nullable. Existing users have them all `null` until they see onboarding (or never — existing users bypass entirely, their fields stay null forever).

### Auto-login post-confirm

`/api/auth/confirm` currently just marks the Cognito account confirmed and returns success — the user then has to manually log in. For this design to flow cleanly, `/api/auth/confirm` must also sign the user in (set session cookies) and return a redirect hint of `/onboarding`. The signup page's `confirmed` state then becomes a 0-duration bounce through to `/onboarding` rather than a "You're in, go log in" card.

This is a small, safe change to the auth route — Cognito supports the pattern directly via `initiateAuth` after `confirmSignUp`.

### Server endpoints

- `POST /api/onboarding/progress` — accepts `{ role?, listingsPerMonth? }`, updates the user record. Called after screens 2 and 3 so data is persisted server-side (refreshing the page won't lose the answers).
- `POST /api/onboarding/complete` — sets `onboardingCompletedAt` to `new Date().toISOString()`. Called from the result screen once the staging job completes successfully.

Credit deduction for the first stage goes through the existing `/api/stage/batch` path — no duplication. 1 credit deducted, 14 free remaining.

## 6. Flow — screen by screen

### Screen 1 — Welcome

- Heading: *Hi {name}. In 60 seconds you'll have your first staged listing.*
- Sub: *Three quick questions, one photo, and you're done. Fifteen free credits are ready.*
- Primary CTA: *Let's go →*
- Single CTA, no skip.

### Screen 2 — Role

- Heading: *What do you do?*
- MCQ, 4 options, single-select:
  - Solo real estate agent
  - Agency / team
  - Real estate photographer
  - Property manager
- Saves to user record immediately on selection (no next button — answer IS the progress).
- Back button available from screen 2 through screen 6. Disabled from screen 7 onwards (once the credit is deducted, we don't want the user navigating back and triggering a duplicate stage).

### Screen 3 — Listings volume

- Heading: *Roughly how many listings do you manage each month?*
- MCQ, 4 options, single-select:
  - 0–2
  - 3–5
  - 6–10
  - 11+
- Saves to user record immediately.

### Screen 4 — Bombshell (pure pain)

Two stat blocks stacked vertically, then a tagline. NO next-step language on this screen — the user sits in the pain for a beat.

- **73%** — *longer on market than staged listings.*
  Supporting line: *"At {listingsPerMonth} listings per month, that's weeks — sometimes months — of delayed commissions every year."*
- **$2,300+** — *per home, traditional staging.*
  Supporting line: *"At your volume, staging every listing the old way adds up fast."*
- Tagline: *"Either way, empty listings cost you — in time or in cash."*
- CTA: *Continue →*

(Numbers: $2,300+ is the published RESA / industry low-end per-home figure, unannotated to keep it honest. 73% from NAR / RESA research. Both appear in the landing's Why-This-Matters section so we're reinforcing a claim we already stand behind.)

### Screen 5 — Bridge (hope)

One clean block of copy, full-width navy card or similar visual weight.

- Heading: *It doesn't have to be this way.*
- Body: *"StageRight gets every listing staged in under a minute, from $1.25 per image — less than 10% of what traditional staging costs. Let's stage your first one now."*
- CTA: *Show me →*

### Screen 6 — How it works

Re-uses the 4-step illustration from the landing's `HowItWorks` component (Upload / Read the room / Stage / Regenerate) or a simplified version of the same. Familiarity beats novelty here — the user just saw this on the landing.

- Heading: *Here's how it works.*
- Sub: *You do two small things. We do the two big ones. Total: about a minute.*
- CTA: *Ready — let's stage →*

### Screen 7 — Upload + style pick (embedded wizard)

The real working screen. Simplified from the full `/stage` wizard — on first run we strip it down so the user doesn't drown in options:

- Hero photo upload (`HeroUpload` component, already built).
- Style picker (`StyleRow` grid with the 12 curated styles, already built).
- NO reference uploads, NO room-type picker, NO notes field — these are power-user options that distract on first run. Regular `/stage` wizard still has them for returning users.
- CTA: *Stage →* (deducts 1 credit, kicks off the normal batch route).

Transient `generating` state uses the existing `StagingLoader`.

### Screen 8 — Result

- `BeforeAfterSlider` showing their original + staged output.
- Headline: *Your first staged listing.*
- Sub: *That used 1 of your 15 free credits. 14 left.*
- Primary CTA: *Try another style →* (routes to the regular `/stage` wizard with the same hero preloaded, so they can immediately keep experimenting).
- Secondary CTA: *Go to dashboard →*
- `onboardingCompletedAt` set on mount of this screen.
- Regeneration-bank primer: a small inline info card beneath the result image (not a modal, not a toast). Content: *"You've earned 1 of your 10 stages toward your first free regeneration."* Brand-teal border + tiny teal dot icon, matches the landing-page card style. One line, dismissable is not needed.

## 7. Components

- `src/app/onboarding/page.tsx` — route wrapper, auth + onboarding-already-complete redirects.
- `src/app/onboarding/onboarding-flow.tsx` — client component with the step enum, screen switcher, framer-motion transitions.
- `src/components/onboarding/welcome-screen.tsx` — screen 1.
- `src/components/onboarding/role-picker.tsx` — screen 2.
- `src/components/onboarding/volume-picker.tsx` — screen 3.
- `src/components/onboarding/bombshell-screen.tsx` — screen 4.
- `src/components/onboarding/bridge-screen.tsx` — screen 5.
- `src/components/onboarding/how-it-works-screen.tsx` — screen 6 (may reuse landing's `HowItWorks` or a simplified variant).
- Screen 7 and 8 reuse existing wizard primitives directly from within `onboarding-flow.tsx` — no new components.

## 8. Data flow

```
┌─ signup → confirm → auto-login → redirect / onboarding
│
├─ screen 1 welcome      (no data save)
├─ screen 2 role         → POST /api/onboarding/progress { role }
├─ screen 3 volume       → POST /api/onboarding/progress { listingsPerMonth }
├─ screen 4 bombshell    (reads listingsPerMonth from server or state for personalisation)
├─ screen 5 bridge       (no data save)
├─ screen 6 how it works (no data save)
├─ screen 7 upload+style (uses existing /api/upload + /api/stage/batch)
├─ (generating)
└─ screen 8 result       → POST /api/onboarding/complete
                         → redirect to /dashboard on "Go to dashboard"
                         → redirect to /stage on "Try another style"
```

## 9. Error handling

- Screen 2 or 3 save fails: toast error, keep user on screen, retry on re-select. Don't block flow.
- Screen 7 upload fails: existing wizard error UI.
- Screen 7 staging fails: existing wizard error UI. User stays on screen 7, credit is refunded per existing `refundCredits` path. They can retry.
- Screen 8 `onboardingCompletedAt` save fails: retry silently in background; the next page load will re-check and set it. User-visible flow is not blocked.
- Session expires mid-flow: redirect to `/login`, return to `/onboarding` with preserved step state (stored in user record's `onboardingCompletedAt === null`).

## 10. Returning-user bypass

Every new authenticated page load checks `onboardingCompletedAt`:
- If `null` and path is not `/onboarding` → redirect to `/onboarding`.
- If not `null` → no change, user goes where they were going.

Existing users (pre-this-ship) all have `onboardingCompletedAt === null` by default, which would retro-trigger onboarding for them on their next visit. That's wrong — they already know the product. Migration: on deploy, set `onboardingCompletedAt = '2026-04-19T00:00:00Z'` (a sentinel value meaning "grandfathered, not a new user") for all existing users. Detection: any user whose account was created before the deploy date gets the sentinel.

## 11. Admin / testing

- Admins (detected via `user.plan === 'admin'`) bypass onboarding on their own accounts — `onboardingCompletedAt` set at account creation for admin-plan users. Covers `taraferguson.business@gmail.com` and `tara@aiwave.com.au` per project memory.
- For QA: a hidden dev-only query param on `/onboarding?reset=1` clears the local step state (server-side fields untouched) so the flow can be re-run without creating a new account.

## 12. Deferred (explicitly out of scope for this spec)

- **Review modal / NPS prompt at screen 8 peak.** Defer to Play Store launch — the native review prompt is what pays off at that peak. Web NPS would work but is a separate decision.
- **Customer testimonials / social proof screen.** No real quotes to use yet. Add when we have 2–3 real beta-user quotes.
- **Referral prompt on result screen.** Not in v1. Add post-launch if we build a referral program.
- **Personalisation of dashboard based on role / volume.** Data captured is for analytics + future email campaigns; dashboard stays generic in v1.
- **Email sequence post-onboarding.** Also deferred — SES IAM gap may still be active per earlier memory. First onboarding cohort gets no automated email.
- **Returning-session resumption UX.** If a user bounces mid-flow and comes back, they restart at screen 1. Refining this (resume where you left off) is a v2 enhancement; v1 just re-runs.

## 13. Open questions (none currently blocking — all resolved in brainstorm)

- ~~Where does onboarding live?~~ Answered: mandatory post-confirm at `/onboarding`.
- ~~First stage inside or outside the flow?~~ Answered: inside.
- ~~How much data do we capture?~~ Answered: role + volume.
- ~~Bombshell framing?~~ Answered: dual pain (time + cost), separate from bridge, factual not inflated.

## 14. Success metrics to instrument

- `onboardingStartedAt` (screen 1 mount) and `onboardingCompletedAt` (screen 8 mount). Difference = time-to-first-stage.
- Screen-level funnel drop-off events (log the transition FROM each step).
- Role + volume distribution report for the admin panel.
- First-stage success rate (complete vs failed vs abandoned on screen 7).
