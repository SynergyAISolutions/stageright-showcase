# Onboarding Ceremony — Design

**Date:** 2026-04-24
**Status:** Design draft; pending spec review
**Scope:** Apply the gift framework to the 9-step onboarding flow's three emotional peaks: (1) cinematic Welcome screen with staggered entry + blurred admin-gen hero + DM Serif name personalisation, (2) unified top-positioned progress bar across steps 1-7 (welcome through upload) replacing per-screen "Step N of 8" text, (3) full reveal ceremony on steps 8-9 (generating + result) — `StagingWaitConcierge` replaces the old `StagingLoader`, result gets `EditorialNameplate` + `BeforeAfterSlider.autoReveal` + `ConciergeNotesExpander` + `FirstStageWelcomeToast`. Middle screens (role, volume, bombshell, bridge, how-it-works) get unified chrome via the progress bar but no individual screen changes.
**Out of scope:** Redesigning the middle screen content (role picker, volume picker, bombshell, bridge, how-it-works). Changing onboarding's routing / gating / completion semantics. Changing the API routes `/api/onboarding/progress`, `/api/onboarding/complete`, `/api/stage/batch`, `/api/jobs/batch`. No Lambda changes. No new backend code.

---

## 1. Background & motivation

The onboarding at `/onboarding` functionally works end-to-end — it collects role + volume, primes the user with the bombshell + bridge + how-it-works teaching moments, then runs a real first stage using `/api/stage/batch`. But two surfaces don't benefit from the reveal ceremony shipped in PR #1/#3:

1. **Step 8 (generating)** renders the old generic `<StagingLoader />` — no ghost-hero, no rotating style-derived notes, no progress line, no concierge narration. A new user's FIRST impression of the staging wait is the old loader they'll never see again in the real wizard.
2. **Step 9 (result)** uses a plain `<BeforeAfterSlider>` with no `autoReveal`, no editorial nameplate, no expander. The emotional peak of the onboarding — the first time a new user sees the staged image — lands as a flat 200ms opacity fade.

The Welcome screen is also missing. It's content-complete (`Hi {userName}. In 60 seconds you'll have your first staged listing.`) but visually generic — black text on white, no first-impression ceremony. For a premium real-estate tool, the handshake moment needs editorial weight.

Finally, the flow has a unification gap: each step has its own `Step N of 8` text, positioned differently on different screens, and the count is actually wrong (the flow is 9 steps). There's no single visual thread tying the 9 screens together as one arc.

This spec applies the gift framework's visual vocabulary (DM Serif + full-frame dark gradient + tracked caps + teal accents) to those three moments and adds a unified top-positioned progress bar. The middle screens (role/volume/bombshell/bridge/how-it-works) are untouched — their copy is fine; they just benefit from consistent top chrome rising with the tide.

---

## 2. Positioning & locked decisions

Settled during brainstorming; not to be re-litigated:

- **Scope = bookends.** Welcome + generating + result get ceremony. Middle screens unchanged except for inheriting the shared progress bar.
- **Welcome visual = blurred admin-gen hero photo** with navy/teal gradient overlay + DM Serif welcome text, STATIC (no ken-burns, no rotating content). Same visual language as `StagingWaitConcierge` but static for first-impression gravity.
- **Progress indicator = top-positioned thin 2px bar**, navy track + teal fill, width animates by step index. Visible on steps 1–7, hidden on steps 8–9 where the reveal ceremony has its own chrome. Replaces hardcoded "Step N of 8" text.
- **Step 8 (generating) reuses `StagingWaitConcierge`** with client-side style-base notes tagged with the chosen style (no analyser notes — the API doesn't surface them during the wait).
- **Step 9 (result) reuses `EditorialNameplate` + keyed `BeforeAfterSlider autoReveal` + `ConciergeNotesExpander` + `FirstStageWelcomeToast`** — same components as the main wizard. Keeps onboarding-specific copy (`RegenerationPrimer`, "14 credits left", 2-button CTAs).
- **`FirstStageWelcomeToast` fires ONCE per account across all surfaces.** `markFirstStage` already runs in `/api/jobs/batch` (PR #3), so onboarding's first batch completion sets `firstStageAt`. The toast shows in onboarding; future stages of any kind won't re-fire it. Onboarding IS the user's welcome-toast moment.

---

## 3. Design principles

1. **Visual language is singular.** The welcome screen, the generating wait, and the result reveal all use the same aesthetic — blurred hero + navy/teal gradient + DM Serif + tracked caps + teal accents. No dialect switching across the flow.
2. **Middle screens inherit chrome, not get redesigned.** The progress bar pulls them together; their content stays as-is. We don't re-author copy or layout mid-spec.
3. **First-impression ceremony is static.** No rotation, no ken-burns on the welcome screen. Motion is in the staggered ENTRY of text, not in the background. A static first screen feels confident; animation here would feel nervous.
4. **Reveal ceremony earns its cue.** Progress bar hides on steps 8–9 because the ceremony takes over. No competing chrome.
5. **Onboarding welcome toast is the user's only welcome toast.** By design, `markFirstStage` fires on the first successful stage and never again. Onboarding is where it lives.

---

## 4. Architecture & data flow

```
/onboarding (OnboardingFlow)
  │
  ├── state: step ∈ { welcome, role, volume, bombshell, bridge, how-it-works, upload, generating, result }
  │
  ├── <OnboardingProgressBar step={step} />  ◄─ NEW, visible only for welcome…upload
  │
  └── <AnimatePresence mode="wait"> — existing step switcher, unchanged
      │
      ├── welcome:  <WelcomeScreen userName={userName} onContinue={…} />  ◄─ rewritten
      ├── role:     <RolePicker …/>         (unchanged)
      ├── volume:   <VolumePicker …/>       (unchanged)
      ├── bombshell:  <BombshellScreen …/>  (unchanged)
      ├── bridge:     <BridgeScreen …/>     (unchanged)
      ├── how-it-works: <HowItWorksScreen …/>  (unchanged)
      ├── upload:   (existing custom JSX — "Step 7 of 8" text REMOVED; progress bar carries it)
      ├── generating: <StagingWaitConcierge heroImageUrl={…} conciergeNotes={…} />  ◄─ NEW (replaces StagingLoader)
      └── result: (full reveal ceremony — see §6)
```

No backend changes. `/api/stage/batch` and `/api/jobs/batch` already return the data needed. `markFirstStage` already fires on the batch poll's first `completed > 0` transition (shipped PR #3).

---

## 5. Data & type changes

**None required.**

- `User.firstStageAt` already exists (PR #1, wired PR #3 for batch).
- `/api/jobs/batch` already returns `isFirstStage` (PR #3) and `conciergeNotes` per sub-job (PR #3).
- `buildConciergeNotes` already exists and accepts the single-style use case (PR #1).
- `ConciergeNote` type already exported from `StagingWaitConcierge` (yesterday's polish PR).

This spec is purely presentational.

---

## 6. Detailed component-by-component spec

### 6.1 Backend

No changes.

### 6.2 Client — new component

#### 6.2.1 `OnboardingProgressBar` (new)

**File:** `src/components/onboarding/onboarding-progress-bar.tsx`

A thin top-positioned progress bar that animates its fill based on the user's current onboarding step. Visible on steps 1–7 (welcome through upload); hidden on steps 8–9 (generating + result — the reveal ceremony has its own chrome).

**Props:**

```ts
import type { OnboardingStep } from '@/app/onboarding/onboarding-flow';

interface OnboardingProgressBarProps {
  step: OnboardingStep;
}
```

(`OnboardingStep` is already declared as a local type in `src/app/onboarding/onboarding-flow.tsx` — we need to export it from that module so the progress bar component can import it. That's a tiny refactor, not a data-type change.)

**Step-to-percentage mapping (internal constant):**

```ts
const STEP_ORDER: OnboardingStep[] = [
  'welcome',       // 1/9 = 11%
  'role',          // 2/9 = 22%
  'volume',        // 3/9 = 33%
  'bombshell',     // 4/9 = 44%
  'bridge',        // 5/9 = 56%
  'how-it-works',  // 6/9 = 67%
  'upload',        // 7/9 = 78%
  'generating',    // hidden
  'result',        // hidden
];

const CEREMONY_STEPS = new Set<OnboardingStep>(['generating', 'result']);

function percentFor(step: OnboardingStep): number {
  const idx = STEP_ORDER.indexOf(step);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}
```

**Markup:**

```tsx
'use client';

import { motion } from 'framer-motion';
import type { OnboardingStep } from '@/app/onboarding/onboarding-flow';

// (STEP_ORDER + CEREMONY_STEPS + percentFor as above)

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

**Notes:**
- Uses `bg-brand-navy/10` as the track (visible on the white/cream onboarding backgrounds, subtle) and `bg-brand-teal` as the fill (matches the concierge wait's progress line colour).
- `initial={false}` on the motion.div so the FIRST mount doesn't animate from 0; it appears at its correct percentage. Subsequent step changes animate.
- `absolute` positioning pins it to the top of the onboarding root container — §6.2.3 Change 4 adds `relative` to the outer wrapper to make this work.
- **No `marginTop` for safe-area:** the outer onboarding wrapper already has `paddingTop: 'env(safe-area-inset-top)'`, and for an absolutely-positioned child of a `relative` parent, `top: 0` resolves to the padding edge (i.e. BELOW the safe-area inset). Adding margin here would double the offset.
- `aria-hidden` — decorative; screen readers get the step information via headings/announcements.

### 6.2.2 `WelcomeScreen` rewrite

**File:** `src/components/onboarding/welcome-screen.tsx`

Replace the current implementation wholesale. Goes from plain centered text-on-white to a cinematic full-frame welcome with blurred admin-gen hero, navy/teal gradient, DM Serif name personalisation, and staggered entry animations.

**Full replacement:**

```tsx
'use client';

import { motion } from 'framer-motion';

interface WelcomeScreenProps {
  userName: string;
  onContinue: () => void;
}

export function WelcomeScreen({ userName, onContinue }: WelcomeScreenProps) {
  // Admin-generated thumbnail — reuses existing landing asset. Matches the
  // admin-only-public-images rule. Pick a warm, inviting room style for the
  // first handshake — Hamptons living-room works well (navy/white/timber).
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

      {/* Gradient overlay — same ellipse as the concierge wait, slightly darker for readability */}
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

**Design notes:**
- **Blur intensity:** `blur(32px)` — heavier than the concierge wait's `24px` because this is a STATIC screen; the heavier blur emphasises that it's atmospheric, not asked-to-be-looked-at. Also protects against any distracting detail in the hero photo.
- **Gradient:** marginally darker than the concierge wait (0.6 → 0.82 alpha vs 0.55 → 0.78) because the welcome text is bigger and gets more white pixels; need more contrast.
- **Button colour:** **teal bg with navy text** (`bg-brand-teal text-brand-navy`). Different from the concierge wait which uses no CTA — here we want the button to stand out as the "Begin" call. Teal is brand-coherent; using navy-on-white would read as generic.
- **Hero photo:** `hamptons.jpg` from the existing living-room folder — warm, inviting, timber-and-white-and-navy palette that meshes with the gradient. Admin-gen per the house rule.
- **Graceful fallback:** if the image fails to load, `onError` hides it and the `bg-brand-navy` on the section carries the screen alone. Tested-safe pattern (reused from `StagingWaitConcierge`).
- **Layout parity:** section has the same class structure as `StagingWaitConcierge` so transitions between onboarding's welcome and any future full-frame ceremony feel visually linked.
- **Apostrophes in JSX:** `Let&apos;s` and `you&apos;ll` — per `feedback_apostrophes.md` to keep Amplify build passing.

### 6.2.3 `OnboardingFlow` updates

**File:** `src/app/onboarding/onboarding-flow.tsx`

Three changes:

**Change 1 — Export `OnboardingStep` type.** The new `OnboardingProgressBar` needs it. Find:

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

**Change 2 — Add imports for the new/reused components.** At the top of the file, add:

```ts
import { OnboardingProgressBar } from '@/components/onboarding/onboarding-progress-bar';
import { StagingWaitConcierge, type ConciergeNote } from '@/components/staging/staging-wait-concierge';
import { EditorialNameplate } from '@/components/staging/editorial-nameplate';
import { ConciergeNotesExpander } from '@/components/staging/concierge-notes-expander';
import { FirstStageWelcomeToast } from '@/components/staging/first-stage-welcome-toast';
import { buildConciergeNotes } from '@/lib/ai/prompts';
```

Remove the `StagingLoader` import — the onboarding no longer uses it:

```ts
// DELETE:
import { StagingLoader } from '@/components/staging/staging-loader';
```

**Change 3 — Add welcome-toast state and derived data.** Inside the component, alongside the existing state hooks:

```ts
// Welcome toast visible on the onboarding result — by definition this is the
// user's first stage (onboarding only runs once per account). Local state so
// dismiss is instant; server-side firstStageAt is set by /api/jobs/batch's
// markFirstStage on the first completed sub-job (PR #3).
const [showWelcomeToast, setShowWelcomeToast] = useState(true);

// Sub-job conciergeNotes — populated from the poll response on step=result.
// Used by ConciergeNotesExpander (combined with style-base notes via
// buildConciergeNotes).
const [subJobConciergeNotes, setSubJobConciergeNotes] = useState<string[]>([]);
```

Update the polling effect to also capture `subJobConciergeNotes`. Find the existing success branch:

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

Replace with:

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

**Change 4 — Wire the progress bar** as a sibling of the `<main>` inside the outer onboarding wrapper:

Find the outer wrapper:

```tsx
<div
  className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
  <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
```

Change the outer div to `relative`, and add the progress bar as a first child:

```tsx
<div
  className="relative h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
  <OnboardingProgressBar step={step} />
  <main className="flex-1 min-h-0 flex overflow-hidden sm:items-center sm:justify-center sm:p-4 lg:p-6">
```

The progress bar's `absolute` positioning + `z-20` layers above the main flow content. On steps 8–9 the bar returns `null`.

**Change 5 — Remove the hardcoded step-count text on the upload step.** Find (around line 223):

```tsx
<p className="text-[19px] font-bold text-brand-teal uppercase tracking-wider mb-4 text-center">
  Step 7 of 8
</p>
<h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
  Your turn. Upload and pick a style.
</h1>
```

Replace with (drop the step-count paragraph; headline stands alone):

```tsx
<h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
  Your turn. Upload and pick a style.
</h1>
```

The progress bar now carries what the step-count text used to.

**Change 6 — Replace the `generating` branch with `<StagingWaitConcierge>`.** Find:

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

Note: the onboarding collects no `roomTypes` (empty array is passed to `/api/stage/batch` per existing code). So `buildConciergeNotes` falls back to "room" in its `{roomLabel}` interpolation, producing e.g. `"Layering clean lines and neutral tones through your room."` — still warm, still style-specific.

**Change 7 — Replace the `result` branch with the full reveal ceremony.** Find the entire `step === 'result'` block (~lines 276–314):

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

Changes from the original result block:
- **Removed** the hardcoded `Step 8 of 8 · Done` text and the `Your first staged listing.` headline — the `EditorialNameplate` + `FirstStageWelcomeToast` together convey this.
- **Added** `<EditorialNameplate style={activeStyle} roomTypes={[]} />` at the top (eyebrow reads `STAGED`, title is the style name in DM Serif).
- **Replaced** the plain slider with the full ceremony slider (`key={stagedUrl}`, `autoReveal`, `onRevealPeak` for haptic).
- **Added** `<ConciergeNotesExpander>` combining style-base + analyser-derived notes. Collapsed by default.
- **Moved** the credits counter copy to AFTER the `RegenerationPrimer` (smaller, muted) — the primer teaches the free-retry mechanic first, then the credits note reinforces.
- **Added** `<AnimatePresence>`-wrapped `FirstStageWelcomeToast`.

---

## 7. Copy library

Every new or changed user-facing string in this spec:

### Welcome screen
- Eyebrow (white/60, tracked caps): `Welcome to StageRight`
- Headline (DM Serif white): `Let's stage your first listing, {userName}.`
- Subtitle (white/80): `Seven quick taps and you'll see it staged.`
- CTA button: `Begin`

### Upload step
- Headline (unchanged from existing): `Your turn. Upload and pick a style.`
- (The `Step 7 of 8` eyebrow is removed — progress bar carries it.)

### Result step
- Editorial nameplate eyebrow (existing component — renders `STAGED` alone when `roomTypes` is empty)
- Editorial nameplate title (existing component — renders the style name)
- Welcome toast (existing `FirstStageWelcomeToast` copy, unchanged): `Your first staged room. / It lives in your gallery now.`
- Regeneration primer (existing component, unchanged)
- Credits counter: `That used 1 of your 15 free credits. 14 left.` (unchanged copy; just moved + smaller)
- CTAs: `Try another style`, `Go to dashboard` (unchanged)

No new copy authored — just existing text rearranged or removed.

---

## 8. Edge cases & error handling

| Scenario | Behaviour |
|---|---|
| Welcome screen's hero image fails to load | `onError` hides the `<img>`. `bg-brand-navy` + gradient overlay carry the screen alone. All text remains legible. Same degraded-OK pattern as `StagingWaitConcierge`. |
| User has disabled reduced-motion in the OS | Entry animations still play. No reduced-motion fallback in this spec. (System-level prefers-reduced-motion is a broader follow-up.) |
| User refreshes the page on welcome | The welcome screen renders again with staggered entry. `OnboardingFlow` re-initialises step to `'welcome'` by default — existing behaviour. Staggered entry replays; acceptable. |
| User reaches `result` but `stagedUrl` or `originalUrl` is null (shouldn't happen given the polling guard) | The existing render-guard `{step === 'result' && stagedUrl && originalUrl && (...)}` keeps the fallback behaviour. Nothing renders; AnimatePresence stays in the `result` slot but shows no content. Unlikely but not a crash. |
| Lambda didn't persist `conciergeNotes` on the sub-job (older deploy, parser failed, drift) | `sub.conciergeNotes` is undefined; `subJobConciergeNotes` stays `[]`; `buildConciergeNotes({ style, roomTypes: [], analyserNotes: [] })` returns just the 5 style-base notes. Expander renders "5 things we watched for in your room". Full graceful degradation. |
| `firstStageAt` was somehow already set on this user (e.g. they hit `/api/stage` directly before onboarding) | `markFirstStage` returns false. `isFirstStage` on the batch poll is false. BUT the onboarding renders its own `FirstStageWelcomeToast` with local `showWelcomeToast = true` state (no dependency on the server flag). The toast still shows — because onboarding is the user's promised welcome moment, not conditioned on server state. This is intentional: onboarding UI should trust that it's a welcome context. |
| User navigates back from the result step (browser back) | Existing onboarding router behaviour unchanged. If they end up back at `step === 'welcome'`, welcome screen re-animates in (fine). `showWelcomeToast` resets to `true` on mount — if they return to result, toast fires again. Acceptable since this path is rare. |
| Mobile haptic isn't supported | `onRevealPeak` callback feature-detects `'vibrate' in navigator` — silent no-op if absent. Same as single-style / batch flows. |
| User on step 7 (upload) tries to navigate to generating without uploading | Existing `disabled={!heroPhoto || isStaging}` guard on the "Stage this room" button handles it. No change. |
| `OnboardingProgressBar` renders on a step the order map doesn't know about | `percentFor` returns 0. The bar renders at 0% width. Not a crash; visually shows as empty track. Defensive. |
| Reduced-motion a11y: the staggered entry on Welcome + progress-bar animation + toast-slide may be too much for reduced-motion users | `prefers-reduced-motion` support is out of scope for this spec. Log for follow-up. |

---

## 9. Acceptance criteria

**Welcome screen:**
- [ ] Opening `/onboarding` on a fresh account renders a full-frame dark welcome with a blurred hero photo, navy/teal gradient overlay, white DM Serif headline with the user's name, subtitle, and teal "Begin" button.
- [ ] Eyebrow, headline, subtitle, button enter in staggered order (300ms / 500ms / 700ms / 900ms) on mount.
- [ ] Clicking "Begin" advances to the role-picker step.
- [ ] Hero image failing to load does not break the screen (navy fallback).
- [ ] On narrow mobile (<400px wide), the headline wraps cleanly; button is full-row-size.

**Progress bar:**
- [ ] A thin 2px teal bar on navy/10 track appears at the top of every onboarding step from welcome through upload.
- [ ] On welcome, bar shows ~11% fill.
- [ ] On role, ~22%. On volume, ~33%. On bombshell, ~44%. On bridge, ~56%. On how-it-works, ~67%. On upload, ~78%.
- [ ] Width animates smoothly (~400ms ease-out) between steps.
- [ ] On generating and result steps, the progress bar is ABSENT (the ceremony takes over).
- [ ] The hardcoded `Step 7 of 8` text on the upload step is GONE.
- [ ] The hardcoded `Step 8 of 8 · Done` text on the result step is GONE.

**Generating step:**
- [ ] Onboarding's generating step renders the full-frame `StagingWaitConcierge` (not `StagingLoader`).
- [ ] Rotating notes are style-specific (e.g. "Layering clean lines and neutral tones through your room." for Modern).
- [ ] The style-label eyebrow (`· MODERN`) appears above each rotating note (from yesterday's polish PR).
- [ ] Orientation chip "Staging · 20–40s" shows top-right.
- [ ] Thin teal progress line at the bottom animates to ~95% over 30s.

**Result step:**
- [ ] `EditorialNameplate` renders with `STAGED` eyebrow and the style name in DM Serif.
- [ ] `BeforeAfterSlider` runs the 2-second lid-lift sweep on mount (0% → 100% → 50%) with handle glow at peak and mobile haptic.
- [ ] `ConciergeNotesExpander` shows "N things we watched for in your room" — either 5 (style-base only, if Lambda didn't persist notes) or 5-9 (with analyser notes).
- [ ] `RegenerationPrimer` still renders.
- [ ] Credits counter ("That used 1 of your 15 free credits. 14 left.") appears after the primer, smaller and muted.
- [ ] "Try another style" and "Go to dashboard" CTAs still render; behaviour unchanged.
- [ ] `FirstStageWelcomeToast` slides up from the bottom 1.5s after the result renders. Auto-dismisses after 8s with a smooth slide-out (via AnimatePresence).

**Integration:**
- [ ] Full onboarding flow from fresh account: welcome → role → volume → bombshell → bridge → how-it-works → upload (hero + style) → stage → reveal → CTAs. Each transition smooth. Progress bar progresses 11% → 78% then disappears for the reveal.
- [ ] `onboardingCompletedAt` is still set via `/api/onboarding/complete` when the stage completes — existing behaviour unchanged.
- [ ] `firstStageAt` is still set via `markFirstStage` in `/api/jobs/batch` on the first completed sub-job — existing behaviour unchanged.
- [ ] Main `/stage` single-style and batch flows are unaffected.

**Regression:**
- [ ] `npm run type-check` passes clean.
- [ ] `npm run build` passes clean with no `react/no-unescaped-entities` errors (all apostrophes in JSX text use `&apos;`).
- [ ] Existing onboarding unit tests (if any exist — there aren't any currently for the screens) still pass.

---

## 10. Implementation phases (PR breakdown)

**Single PR.** All changes are coupled: the progress bar depends on the exported `OnboardingStep` type; the generating-step substitution depends on removing `StagingLoader` import which must happen together; the result-step changes depend on imports that come with the same commit. No sensible split.

Task order:
1. Export `OnboardingStep` from `src/app/onboarding/onboarding-flow.tsx` (trivial).
2. Create `src/components/onboarding/onboarding-progress-bar.tsx` (new, small component).
3. Rewrite `src/components/onboarding/welcome-screen.tsx` (full replacement).
4. Update `src/app/onboarding/onboarding-flow.tsx` — imports, state, progress-bar render, generating step swap, result step rewrite, step-count text removals.
5. Manual acceptance walkthrough + push + PR.

Approx. one afternoon end-to-end (including Amplify deploy + manual verification on the live URL).

---

## 11. Explicitly out of scope

- **Middle-screen rewrites.** `RolePicker`, `VolumePicker`, `BombshellScreen`, `BridgeScreen`, `HowItWorksScreen` are untouched. Their copy is adequate; the progress bar supplies the missing unification.
- **A second admin-gen hero photo rotation on welcome.** Single static image is the design call. If the Hamptons photo ever feels stale, swap for a different admin-gen jpg — trivial one-line change, not a design revisit.
- **Sound design.** Silent, same as the rest of the product.
- **`prefers-reduced-motion` accessibility support.** Follow-up spec if the Welcome entry animations prove uncomfortable for reduced-motion users.
- **Per-variant share export in onboarding.** The onboarding CTAs intentionally stay at "Try another style" + "Go to dashboard" for the teaching flow. Download + Share UI is for the regular `/stage` experience.
- **Skip-onboarding UX.** The secondary "I've done this before" link was considered in brainstorming and rejected — onboarding is gated by `onboardingCompletedAt`, so this screen only appears once per account.
- **Changes to `/api/onboarding/progress`, `/api/onboarding/complete`, `/api/stage/batch`, `/api/jobs/batch`, or any Lambda code.** Presentation-layer only.

---

## 12. Open implementation questions (for the plan)

1. **Admin-gen hero image availability.** The spec uses `/style-thumbnails/living-room/hamptons.jpg` — verify this exists and looks appropriate for the welcome (Glob confirms it's in `public/style-thumbnails/living-room/hamptons.jpg`). If it's visually off-brand for any reason, swap to another living-room thumbnail. No user-generated content allowed per `feedback_admin_only_images.md`.
2. **Progress bar on tiny mobile viewports.** The `top-0` position with `env(safe-area-inset-top)` margin handles notches, but verify there's no overlap with the status bar on narrow iPhones during manual acceptance.
3. **Wrapping `<div>` positioning.** The outer onboarding wrapper must be `position: relative` for the progress bar's `absolute` positioning to work. The current class list is `h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden` — needs to become `relative h-[100dvh] …`. Verify the change during implementation.
4. **`ConciergeNotesExpander` centering.** The result step's expander is wrapped in `flex justify-center` so the pill-shaped trigger is centered under the slider. Verify this reads well; alternatively left-align to match the slider's natural position.
5. **Entry-animation interruption.** If the user taps "Begin" during the staggered entry (before all 4 elements have appeared), the step transitions immediately. `AnimatePresence mode="wait"` at the parent handles the exit; nothing should appear broken. Verify during manual testing.

---

*End of spec.*
