# Onboarding Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the gift-framework ceremony to the onboarding flow's three emotional peaks — cinematic Welcome screen, unified top-positioned progress bar across steps 1–7, full reveal ceremony on steps 8–9 (generating + result).

**Architecture:** Three concrete presentational changes. One new component (`OnboardingProgressBar`). One full rewrite (`WelcomeScreen`). Targeted edits to `OnboardingFlow` to swap in the reveal-ceremony components already shipped in PR #1 and #3 (`StagingWaitConcierge`, `EditorialNameplate`, `BeforeAfterSlider.autoReveal`, `ConciergeNotesExpander`, `FirstStageWelcomeToast`). No backend, no Lambda, no new type definitions. Single PR.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind, framer-motion 12. Vitest is available but no new unit tests added (presentational layer; matching existing onboarding test culture — zero tests on screens).

**Source spec:** `docs/superpowers/specs/2026-04-24-onboarding-ceremony-design.md`.

---

## File structure

**New files:**
- `src/components/onboarding/onboarding-progress-bar.tsx` — thin 2px top-positioned bar, takes `step: OnboardingStep` prop, returns null on ceremony steps (generating + result)

**Modified files:**
- `src/components/onboarding/welcome-screen.tsx` — full rewrite. Replaces the current plain centered copy with a cinematic full-frame welcome (blurred Hamptons hero + navy/teal gradient + DM Serif name personalisation + staggered entry animations + teal Begin button)
- `src/app/onboarding/onboarding-flow.tsx` — six targeted changes: export `OnboardingStep` type, add new imports, add welcome-toast + sub-job-concierge-notes state, add `relative` class to outer wrapper + render `<OnboardingProgressBar>`, remove hardcoded step-count text (2 places), replace `<StagingLoader />` on generating step with `<StagingWaitConcierge>`, replace result step wholesale with the full reveal ceremony layout

**Files intentionally not touched:**
- `src/components/onboarding/role-picker.tsx`, `volume-picker.tsx`, `bombshell-screen.tsx`, `bridge-screen.tsx`, `how-it-works-screen.tsx` — middle-screen content stays as-is per the spec
- `src/components/staging/staging-wait-concierge.tsx`, `editorial-nameplate.tsx`, `concierge-notes-expander.tsx`, `first-stage-welcome-toast.tsx`, `src/components/comparison/before-after-slider.tsx` — all reused as-is from PR #1 + #3 + yesterday's polish
- `src/lib/ai/prompts.ts` — `buildConciergeNotes` and `STYLE_CONCIERGE_BASE` already exist with the right shapes
- All API routes, Lambda, DDB types

---

## Task 1: Export `OnboardingStep` type

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Prerequisite for Task 2 — the progress bar component needs to import this type.

- [ ] **Step 1: Add `export` to the type declaration**

Find at the top of `src/app/onboarding/onboarding-flow.tsx`:

```ts
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
```

Replace with:

```ts
export type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'volume'
  | 'bombshell'
  | 'bridge'
  | 'how-it-works'
  | 'upload'
  | 'generating'
  | 'result';
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (adding an export doesn't change semantics).

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "types(onboarding): export OnboardingStep for cross-file consumers"
```

---

## Task 2: `OnboardingProgressBar` component (new)

**Files:**
- Create: `src/components/onboarding/onboarding-progress-bar.tsx`

Thin 2px top-positioned progress bar, absolute-positioned at the top of the onboarding root container. Navy/10 track + teal fill. Width animates by step index. Returns `null` on `generating` + `result` (the reveal ceremony has its own chrome on those steps).

- [ ] **Step 1: Create `src/components/onboarding/onboarding-progress-bar.tsx`**

```tsx
'use client';

import { motion } from 'framer-motion';
import type { OnboardingStep } from '@/app/onboarding/onboarding-flow';

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'volume',
  'bombshell',
  'bridge',
  'how-it-works',
  'upload',
  'generating',
  'result',
];

const CEREMONY_STEPS = new Set<OnboardingStep>(['generating', 'result']);

function percentFor(step: OnboardingStep): number {
  const idx = STEP_ORDER.indexOf(step);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}

interface OnboardingProgressBarProps {
  step: OnboardingStep;
}

export function OnboardingProgressBar({ step }: OnboardingProgressBarProps) {
  if (CEREMONY_STEPS.has(step)) return null;
  const pct = percentFor(step);
  return (
    <div
      className="absolute left-0 right-0 top-0 h-[2px] bg-brand-navy/10 z-20"
      aria-hidden
    >
      <motion.div
        className="h-full bg-brand-teal"
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        initial={false}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/onboarding-progress-bar.tsx
git commit -m "feat(onboarding): OnboardingProgressBar — thin top-positioned step indicator"
```

---

## Task 3: Rewrite `WelcomeScreen` to the cinematic design

**Files:**
- Modify: `src/components/onboarding/welcome-screen.tsx` (full replacement)

Replace the current plain centered copy with a full-frame cinematic welcome. Blurred admin-gen Hamptons hero + navy/teal gradient + DM Serif welcome + staggered entry + teal "Begin" button.

- [ ] **Step 1: Replace the contents of `src/components/onboarding/welcome-screen.tsx`** with:

```tsx
'use client';

import { motion } from 'framer-motion';

interface WelcomeScreenProps {
  userName: string;
  onContinue: () => void;
}

export function WelcomeScreen({ userName, onContinue }: WelcomeScreenProps) {
  // Admin-generated thumbnail — reuses existing landing asset. Matches the
  // admin-only-public-images rule. Warm Hamptons living-room palette
  // (navy/white/timber) meshes with the navy/teal gradient overlay.
  const heroSrc = '/style-thumbnails/living-room/hamptons.jpg';

  return (
    <section className="relative w-full h-full overflow-hidden bg-brand-navy sm:rounded-2xl">
      {/* Ghost photo — static, no ken-burns */}
      <img
        src={heroSrc}
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
        style={{
          filter: 'blur(32px) brightness(0.65) saturate(0.85)',
          transform: 'scale(1.08)',
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />

      {/* Gradient overlay — slightly darker than the concierge wait
          because the welcome text is bigger and needs more contrast */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(15, 29, 46, 0.6) 0%, rgba(15, 29, 46, 0.82) 100%)',
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="max-w-[52ch] flex flex-col items-center text-center gap-5">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.3 }}
            className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/60"
          >
            Welcome to StageRight
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.5 }}
            className="font-heading text-white text-[40px] sm:text-[56px] leading-[1.08] tracking-tight"
          >
            Let&apos;s stage your first listing, {userName}.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.7 }}
            className="text-[17px] sm:text-[19px] font-medium text-white/80 leading-snug max-w-[44ch]"
          >
            Seven quick taps and you&apos;ll see it staged.
          </motion.p>

          <motion.button
            type="button"
            onClick={onContinue}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.9 }}
            className="mt-3 inline-flex items-center justify-center gap-2 bg-brand-teal text-brand-navy font-semibold text-[17px] sm:text-[19px] px-8 py-4 rounded-xl hover:bg-brand-teal/90 active:scale-[0.98] transition-all duration-150 shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Begin
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Watch for `react/no-unescaped-entities` — `Let&apos;s` and `you&apos;ll` should already be HTML-escaped per `feedback_apostrophes.md`.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/welcome-screen.tsx
git commit -m "feat(onboarding): cinematic Welcome screen with blurred hero + staggered entry"
```

---

## Task 4: Wire `OnboardingFlow` — progress bar, generating + result ceremony, remove step-count text

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Six targeted edits:

- [ ] **Step 1: Add new imports at the top of the file**

Find the existing imports section. Add these alongside the others:

```ts
import { OnboardingProgressBar } from '@/components/onboarding/onboarding-progress-bar';
import { StagingWaitConcierge, type ConciergeNote } from '@/components/staging/staging-wait-concierge';
import { EditorialNameplate } from '@/components/staging/editorial-nameplate';
import { ConciergeNotesExpander } from '@/components/staging/concierge-notes-expander';
import { FirstStageWelcomeToast } from '@/components/staging/first-stage-welcome-toast';
import { buildConciergeNotes } from '@/lib/ai/prompts';
```

Then REMOVE the `StagingLoader` import (onboarding no longer uses it):

```ts
// DELETE this line:
import { StagingLoader } from '@/components/staging/staging-loader';
```

- [ ] **Step 2: Add welcome-toast state and sub-job concierge-notes state**

Inside `OnboardingFlow`, alongside the existing state hooks, add:

```ts
// Welcome toast visible on the onboarding result — by definition this is the
// user's first stage (onboarding only runs once per account). Local state so
// dismiss is instant; server-side firstStageAt is set by /api/jobs/batch's
// markFirstStage on the first completed sub-job (PR #3).
const [showWelcomeToast, setShowWelcomeToast] = useState(true);

// Per-variant concierge notes captured from the batch poll response when
// the sub-job transitions to done. Used by ConciergeNotesExpander on the
// result step — combined with style-base notes via buildConciergeNotes.
const [subJobConciergeNotes, setSubJobConciergeNotes] = useState<string[]>([]);
```

- [ ] **Step 3: Capture `conciergeNotes` from the poll response**

Find the polling success branch (inside the `useEffect` that watches `step === 'generating'`):

```ts
if (sub.status === 'done' && sub.imageUrl) {
  if (cancelled) return;
  setStagedUrl(sub.imageUrl);
  setOriginalUrl(heroPreview);
  await markComplete();
  if (cancelled) return;
  setStep('result');
}
```

Replace with (add the `setSubJobConciergeNotes` line before `markComplete`):

```ts
if (sub.status === 'done' && sub.imageUrl) {
  if (cancelled) return;
  setStagedUrl(sub.imageUrl);
  setOriginalUrl(heroPreview);
  // Capture per-variant concierge notes for the result expander. Empty
  // array if the Lambda didn't persist notes (older deploy), in which
  // case the expander falls back to 5 style-base notes only.
  setSubJobConciergeNotes(Array.isArray(sub.conciergeNotes) ? sub.conciergeNotes : []);
  await markComplete();
  if (cancelled) return;
  setStep('result');
}
```

- [ ] **Step 4: Add `relative` to the outer wrapper + render `<OnboardingProgressBar>`**

Find the return's outer wrapper:

```tsx
<div
  className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
  <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
```

Replace with (add `relative` to className, add progress bar as first child):

```tsx
<div
  className="relative h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
  <OnboardingProgressBar step={step} />
  <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
```

- [ ] **Step 5: Remove the hardcoded `Step 7 of 8` text on the upload step**

Find on the upload step (around line 223):

```tsx
<p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
  Step 7 of 8
</p>
<h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
  Your turn. Upload and pick a style.
</h1>
```

Replace with (drop the step-count paragraph; the progress bar carries that information now):

```tsx
<h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
  Your turn. Upload and pick a style.
</h1>
```

- [ ] **Step 6: Replace the `generating` step with `<StagingWaitConcierge>`**

Find:

```tsx
{step === 'generating' && (
  <div className="w-full max-w-xl mx-auto px-5 text-center">
    <StagingLoader />
  </div>
)}
```

Replace with:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    heroImageUrl={heroPhoto?.preview ?? ''}
    conciergeNotes={buildConciergeNotes({
      style: activeStyle,
      roomTypes: [],
      analyserNotes: [],
    }).map<ConciergeNote>((note) => ({ note, style: activeStyle }))}
  />
)}
```

- [ ] **Step 7: Replace the `result` step with the full reveal ceremony**

Find the entire `step === 'result'` block (roughly lines 276–314 in the pre-change file):

```tsx
{step === 'result' && stagedUrl && originalUrl && (
  <div className="w-full h-full max-w-4xl mx-auto px-5 overflow-y-auto py-6">
    <p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
      Step 8 of 8 &middot; Done
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
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        Try another style
      </Link>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        Go to dashboard
      </Link>
    </div>
  </div>
)}
```

Replace with:

```tsx
{step === 'result' && stagedUrl && originalUrl && (
  <div className="w-full h-full max-w-4xl mx-auto px-5 overflow-y-auto py-6">
    <EditorialNameplate style={activeStyle} roomTypes={[]} />

    <div className="mt-4">
      <BeforeAfterSlider
        key={stagedUrl}
        beforeSrc={originalUrl}
        afterSrc={stagedUrl}
        beforeLabel="Empty"
        afterLabel={activeStyle}
        autoReveal
        onRevealPeak={() => {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate(12);
          }
        }}
      />
    </div>

    <div className="mt-4 flex justify-center">
      <ConciergeNotesExpander
        notes={buildConciergeNotes({
          style: activeStyle,
          roomTypes: [],
          analyserNotes: subJobConciergeNotes,
        })}
        style={activeStyle}
      />
    </div>

    <RegenerationPrimer />

    <p className="mt-6 text-[15px] text-ink-muted font-medium text-center">
      That used 1 of your 15 free credits. 14 left.
    </p>

    <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
      <Link
        href="/stage"
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        Try another style
      </Link>
      <Link
        href="/dashboard"
        className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        Go to dashboard
      </Link>
    </div>

    <AnimatePresence>
      {showWelcomeToast && (
        <FirstStageWelcomeToast onDismiss={() => setShowWelcomeToast(false)} />
      )}
    </AnimatePresence>
  </div>
)}
```

Changes vs the original result block:
- Removed the `Step 8 of 8 · Done` text and the `Your first staged listing.` headline — the nameplate + welcome toast carry that now.
- Added `<EditorialNameplate style={activeStyle} roomTypes={[]} />` at the top.
- Replaced the plain slider with the full ceremony slider (`key={stagedUrl}`, `autoReveal`, `onRevealPeak` for haptic).
- Added `<ConciergeNotesExpander>` combining style-base + analyser-derived notes (from `subJobConciergeNotes`).
- Moved the credits counter AFTER the `RegenerationPrimer`, smaller (`text-[15px] text-ink-muted`).
- Added `<AnimatePresence>`-wrapped `<FirstStageWelcomeToast>` at the bottom.

- [ ] **Step 8: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Watch for any `react/no-unescaped-entities` errors (this file already uses `&middot;` in the removed step-count, and `&apos;` in JSX text — the new code has no new contractions in JSX).

- [ ] **Step 9: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): progress bar + generating/result ceremony wiring"
```

---

## Task 5: Manual acceptance + push + PR

**Files:** (verification + ship)

Local dev verification requires AWS env vars per `.env.local` (same constraint as earlier PRs). If `.env.local` is not configured, skip Step 1 and rely on the Amplify preview deploy after merge for manual verification.

- [ ] **Step 1 (optional — skip if `.env.local` isn't set): Start dev server and walk the checklist**

Run: `npm run dev`

Then sign up a fresh account (or reset an existing account's `onboardingCompletedAt` to null via `aws dynamodb update-item`) and walk through onboarding:

**Welcome screen:**
- [ ] Full-frame blurred Hamptons-living-room hero behind white DM Serif headline with your name
- [ ] Staggered entry: eyebrow, headline, subtitle, button appear in sequence over ~600ms
- [ ] Clicking Begin advances to role-picker

**Progress bar:**
- [ ] Thin 2px teal bar at the top fills ~11% on welcome
- [ ] Width animates smoothly between steps
- [ ] Upload step (7/9) fills ~78%
- [ ] Bar DISAPPEARS on generating and result

**Generating step:**
- [ ] Full-frame StagingWaitConcierge (not the old StagingLoader)
- [ ] Style-specific rotating notes (e.g. "Layering clean lines and neutral tones through your room." for Modern)
- [ ] Style-label eyebrow `· MODERN` above each note

**Result step:**
- [ ] EditorialNameplate at top showing the chosen style in DM Serif
- [ ] Slider runs the 2s lid-lift sweep on mount
- [ ] ConciergeNotesExpander shows "N things we watched for…"
- [ ] RegenerationPrimer still renders
- [ ] Credits counter ("14 left") appears smaller, below the primer
- [ ] Welcome toast slides up 1.5s after reveal, auto-dismisses at 8s, slides out cleanly
- [ ] "Try another style" routes to `/stage`; "Go to dashboard" routes to `/dashboard`

**Regression:**
- [ ] `/stage` single-style flow unchanged
- [ ] `/stage` multi-style (batch) flow unchanged
- [ ] No visual regressions on middle-screen pickers

- [ ] **Step 2: Final type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS cleanly.

- [ ] **Step 3: Push the branch and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(onboarding): ceremony pass — cinematic Welcome + progress bar + reveal ceremony on steps 8-9" --body "$(cat <<'EOF'
## Summary
Applies the gift-framework ceremony to onboarding's three emotional peaks:
- Cinematic Welcome screen (blurred Hamptons hero + navy/teal gradient +
  DM Serif name personalisation + staggered entry animations)
- Unified top-positioned 2px progress bar across steps 1-7; hidden on
  steps 8-9 where the reveal ceremony takes over
- Full reveal ceremony reuse on generating + result:
  StagingWaitConcierge replaces StagingLoader, EditorialNameplate +
  BeforeAfterSlider autoReveal + ConciergeNotesExpander on the result,
  FirstStageWelcomeToast fires here (the user's only welcome-toast moment)

Middle screens (role/volume/bombshell/bridge/how-it-works) unchanged
except for inheriting the shared progress bar.

No backend, no Lambda, no new types. Single PR.

Spec: docs/superpowers/specs/2026-04-24-onboarding-ceremony-design.md
Plan: docs/superpowers/plans/2026-04-24-onboarding-ceremony.md

## Test plan
- [x] Type-check + build clean
- [ ] Manual (Amplify preview): fresh account → cinematic Welcome → middle
      steps with progress bar → upload → generating (new concierge wait)
      → result (full reveal ceremony + welcome toast)
- [ ] Manual: progress bar animates smoothly between steps 1-7, disappears
      on 8-9
- [ ] Manual: welcome toast fires once; subsequent stages (single or batch)
      do not re-trigger it
- [ ] Regression: /stage single-style + batch flows unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope reminders

- **Middle-screen redesigns.** RolePicker, VolumePicker, BombshellScreen, BridgeScreen, HowItWorksScreen are untouched.
- **prefers-reduced-motion support.** Follow-up spec.
- **Swap for a different admin-gen hero photo.** If the Hamptons living-room feels wrong for the first impression, the image path is a one-line change in `welcome-screen.tsx`. Candidates in `public/style-thumbnails/`: `coastal.jpg`, `scandinavian.jpg`, `mid-century-modern.jpg`, `contemporary-australian.jpg`.
- **Sound design.** Silent, same rule.

---

*End of plan.*
