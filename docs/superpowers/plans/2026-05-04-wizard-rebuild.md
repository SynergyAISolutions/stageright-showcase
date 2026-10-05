# Wizard Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the staging wizard (`/stage`) — header chrome, 6 input-step shells, all step body components, paywall card, and submit treatment — onto the StageRight design language. This is Plan 2 of 4 in the broader interior visual consistency cluster.

**Architecture:** Refactor `WizardCard` → `WizardShell` (rename + restyle), replace segmented `WizardProgress` with a terra hairline, replace top-of-page nav (logo + Gallery link) with the IA-clean version (logo + credits + close-X). Step body components (`HeroUpload`, `ReferenceUpload`, `RoomTypeSelector`, `TakeCountStep`, `NotesStep`, `ListingPill`) all get token-swapped + structural micro-tweaks. Submit button on Step 6 turns terra (high-stakes treatment). Generating + Result states are out of scope (Plan 3).

**Tech Stack:** Same as Plan 1. Reuses Plan 1 primitives: `<TerraPillButton>`, `<DarkPillButton>`, `<EditorialPageTitle>` (used minimally), `<EmptyEditorial>` (not used here).

**Spec:** `docs/superpowers/specs/2026-05-04-app-interior-visual-consistency-design.md`

**Branch base:** `feat/interior-foundation` (Plan 1's branch). Once Plan 1 (PR #25) merges to master, rebase this plan's branch onto master.

---

## File Structure

### New files
- `src/components/wizard/wizard-shell.tsx` — replaces `wizard-card.tsx` (full rewrite, sr-* tokens, eyebrow + Fraunces question + subtitle + body + footer pattern)
- `src/components/wizard/wizard-progress-hairline.tsx` — terra hairline replaces the segmented `wizard-progress.tsx`
- `src/components/wizard/wizard-buttons.tsx` — `<WizardBackButton>` + `<WizardContinueButton>` extracted from inline definitions in `stage/page.tsx`

### Modified files
- `src/app/stage/page.tsx` — top header swap (drop "Gallery" link, add close-X), import + use new shell + progress + buttons, restyle inline back/continue, restyle paywall card, terra submit button on Step 6
- `src/components/wizard/hero-upload.tsx` — terra drop zone, sr-* tokens
- `src/components/wizard/reference-upload.tsx` — sr-* tokens
- `src/components/wizard/notes-step.tsx` — sr-* tokens, terra suggest pills
- `src/components/staging/take-count-step.tsx` — sr-* tokens on bundle option cards
- `src/components/staging/room-type-selector.tsx` — sr-* tokens on room cards
- `src/components/staging/listing-pill.tsx` — sr-* tokens on the listing-picker control

### Deleted files
- `src/components/wizard/wizard-card.tsx` — replaced by wizard-shell.tsx
- `src/components/wizard/wizard-progress.tsx` — replaced by wizard-progress-hairline.tsx

---

## Task ordering rationale

1. Shell + progress + buttons FIRST (Tasks 1-3) — no behavior changes, just visual primitives that downstream tasks consume.
2. `stage/page.tsx` header chrome + button wiring (Task 4) — references new primitives but doesn't yet touch step bodies.
3. Step body components (Tasks 5-9) — each is independent, can be batched.
4. Paywall card + Submit terra treatment (Task 10) — both inside Step 6's render block in `stage/page.tsx`.
5. Build / verify / push / PR (Tasks 11-13).

---

## Task 1: New `<WizardShell>` (replaces `<WizardCard>`)

**Files:**
- Create: `src/components/wizard/wizard-shell.tsx`

**Context:** The current `WizardCard` is the per-step container — header (tag + question + subtitle), body, footer. New design language: eyebrow + Fraunces question (with terra italic on a key word), subtitle, body, footer with back/continue. Card sits on sr-cream interior background; mobile = full-bleed; desktop = max-width pill with rounded corners.

- [ ] **Step 1: Implement**

```tsx
// src/components/wizard/wizard-shell.tsx
'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface WizardShellProps {
  /** Eyebrow text — e.g. "Step 1 of 6 · Upload" or "Step 6 of 6 · Notes · Optional" */
  eyebrow: string;
  /** ReactNode so callers can compose terra italic accents inline. */
  question: ReactNode;
  subtitle?: string;
  size?: 'default' | 'wide';
  children: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

export function WizardShell({
  eyebrow,
  question,
  subtitle,
  size = 'default',
  children,
  footerLeft,
  footerRight,
  className,
}: WizardShellProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'w-full h-full flex flex-col bg-white overflow-hidden',
        'sm:mx-auto sm:rounded-2xl sm:border sm:border-sr-hairline sm:shadow-[0_8px_32px_-12px_rgba(31,53,57,0.12)]',
        'sm:h-auto sm:max-h-full',
        size === 'wide' ? 'sm:max-w-[1200px]' : 'sm:max-w-[640px]',
        className,
      )}
    >
      <header className="flex-shrink-0 px-6 pt-6 pb-4 text-center bg-white">
        <p className="text-[10px] sm:text-[11px] font-bold tracking-[0.10em] uppercase text-sr-terra mb-2.5">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl lg:text-[34px] text-sr-ink tracking-[-0.02em] leading-[1.05] font-normal">
          {question}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-sr-ink-soft leading-snug mt-2.5 max-w-[36ch] mx-auto">
            {subtitle}
          </p>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4">
        {children}
      </div>

      {(footerLeft || footerRight) && (
        <footer
          className="flex-shrink-0 px-5 sm:px-6 py-4 border-t border-sr-hairline bg-white flex justify-between items-center gap-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </footer>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify type-check** — `npm run type-check`
- [ ] **Step 3: Commit**
```bash
git add src/components/wizard/wizard-shell.tsx
git commit -m "feat(wizard): add WizardShell — sr-* tokens, eyebrow + Fraunces question + subtitle"
```

---

## Task 2: New `<WizardProgressHairline>` (replaces segmented `<WizardProgress>`)

**Files:**
- Create: `src/components/wizard/wizard-progress-hairline.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/wizard/wizard-progress-hairline.tsx
'use client';

import { motion } from 'framer-motion';

interface WizardProgressHairlineProps {
  /** 0-indexed step index (0 = first step). */
  currentIndex: number;
  /** Total number of steps. */
  total: number;
}

/**
 * Thin terra progress bar at the top of the wizard. Replaces the previous
 * segmented + labeled progress bar — eyebrow on each step now carries the
 * label, this is a pure pacing signal.
 */
export function WizardProgressHairline({ currentIndex, total }: WizardProgressHairlineProps) {
  // Show full when on the last step (or beyond — generating/result).
  const pct = Math.min(1, Math.max(0, (currentIndex + 1) / total));
  return (
    <div className="h-[2px] w-full bg-sr-hairline relative">
      <motion.div
        className="absolute top-0 left-0 h-full bg-sr-terra rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**
```bash
npm run type-check
git add src/components/wizard/wizard-progress-hairline.tsx
git commit -m "feat(wizard): add WizardProgressHairline — terra fill replaces segmented bar"
```

---

## Task 3: Extract `<WizardBackButton>` + `<WizardContinueButton>`

**Files:**
- Create: `src/components/wizard/wizard-buttons.tsx`

**Context:** `BackButton` and `ContinueButton` are currently defined as helpers at the bottom of `src/app/stage/page.tsx`. Extract them into a shared module so they can be imported and the page file can shrink.

- [ ] **Step 1: Implement**

```tsx
// src/components/wizard/wizard-buttons.tsx
'use client';

import { cn } from '@/lib/utils/cn';

export function WizardBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-sr-ink-mute hover:text-sr-ink transition-colors"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M7 2L3 5l4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

export function WizardContinueButton({
  onClick,
  disabled,
  label,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-semibold tracking-[0.02em] whitespace-nowrap',
        'bg-sr-ink text-white border border-sr-ink',
        'hover:bg-sr-ink-2 active:scale-[0.98]',
        'transition-all disabled:opacity-50 disabled:cursor-not-allowed',
        'px-5 py-2.5 text-xs sm:text-sm',
        className,
      )}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
        <path d="M3 5.5h5M6 3.5l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Type-check + commit**
```bash
npm run type-check
git add src/components/wizard/wizard-buttons.tsx
git commit -m "feat(wizard): extract WizardBackButton + WizardContinueButton"
```

---

## Task 4: Refactor `src/app/stage/page.tsx` — header swap + new shell wiring

**Files:**
- Modify: `src/app/stage/page.tsx`

**Context:** This is the largest single edit in Plan 2. The page file currently wires `WizardCard` + `WizardProgress` + inline `BackButton`/`ContinueButton`. We're swapping them all to the new primitives, plus replacing the page header.

- [ ] **Step 1: Update imports** at the top of the file

```tsx
// Replace:
import { WizardCard } from '@/components/wizard/wizard-card';
import { WizardProgress } from '@/components/wizard/wizard-progress';
// With:
import { WizardShell } from '@/components/wizard/wizard-shell';
import { WizardProgressHairline } from '@/components/wizard/wizard-progress-hairline';
import { WizardBackButton, WizardContinueButton } from '@/components/wizard/wizard-buttons';
```

- [ ] **Step 2: Replace the page header**

Find the `<header>` block (around line 615 — it has the logo + "Gallery" link). Replace its contents with:

```tsx
<header className="flex-shrink-0 bg-sr-cream border-b border-sr-hairline z-40">
  <div className="mx-auto max-w-6xl px-5 sm:px-8 h-14 flex items-center justify-between gap-3">
    <Link href="/dashboard" className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/android/logo-mark-light.png" alt="StageRight" className="size-9 object-contain" />
      <span className="font-display text-lg text-sr-ink tracking-tight hidden sm:inline">StageRight</span>
    </Link>
    <div className="flex items-center gap-3 sm:gap-4">
      {user && (
        <CreditBalance
          credits={user.creditsRemaining ?? 0}
          plan={user.plan ?? 'free'}
          pulse={pulseCreditBalance}
        />
      )}
      <Link
        href="/dashboard"
        aria-label="Exit to dashboard"
        className="size-8 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none"
      >
        ×
      </Link>
    </div>
  </div>
  {progressActive && (
    <WizardProgressHairline currentIndex={visibleStepIndex} total={STEP_ORDER.length} />
  )}
</header>
```

(Drops the previous `<Link href="/dashboard">Gallery</Link>` text link in favor of a close-X icon. Keeps logo as the home affordance.)

- [ ] **Step 3: Replace each `<WizardCard>` use with `<WizardShell>`**

For each step (`upload`, `reference`, `rooms`, `take-count`, `style`, `notes`):
- Change `<WizardCard tag="Step 1" tagTone="navy" question="Upload your room photo" subtitle="...">` → `<WizardShell eyebrow={`Step ${n} of 6 · ${stepLabel}`} question={<>Upload your <em className="text-sr-terra italic">room</em>.</>} subtitle="...">`
- Update questions to use the new editorial copy + terra italic per the spec table:

| Step | Old `question` | New `question` JSX |
|---|---|---|
| upload | "Upload your room photo" | `<>Upload your <em className="text-sr-terra italic">room</em>.</>` |
| reference | "Want to add more angles?" | `<>Want more <em className="text-sr-terra italic">angles</em>?</>` |
| rooms | "What type of room is this?" | `<>What kind of <em className="text-sr-terra italic">room</em>?</>` |
| take-count | "How many takes per style?" | `<>How many <em className="text-sr-terra italic">takes</em> per style?</>` |
| style | "Pick your styles" | `<>Pick your <em className="text-sr-terra italic">styles</em>.</>` |
| notes | "Anything else we should know?" | `<>Anything <em className="text-sr-terra italic">else</em>?</>` |

- For each step's eyebrow, use the format `"Step N of 6 · Stepname"` or `"Step N of 6 · Stepname · Optional"` for steps 2 and 6.
- The `tag` and `tagTone` props are gone — eyebrow replaces them.
- `WizardShell` accepts `question` as ReactNode, so the JSX with terra italic works directly.

- [ ] **Step 4: Replace `<BackButton>` and `<ContinueButton>` usages with the extracted versions**

Find every `<BackButton onClick={goBack} />` and `<ContinueButton .../>` usage. Replace with `<WizardBackButton onClick={goBack} />` and `<WizardContinueButton ... />` (same prop shape).

- [ ] **Step 5: Delete the inline `BackButton` and `ContinueButton` definitions** at the bottom of the file (after the `StagePageInner` component, before the export default `StagePage`).

- [ ] **Step 6: Build to verify**

```bash
npm run build
```

Apostrophes in JSX text: any `we'll`, `don't`, `it's` etc. that appear in the new question/subtitle copy MUST use `&apos;` to avoid Amplify build failure (`react/no-unescaped-entities`). Scan and fix.

- [ ] **Step 7: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): swap header chrome + every WizardCard → WizardShell with editorial copy"
```

---

## Task 5: Restyle `<HeroUpload>`

**Files:**
- Modify: `src/components/wizard/hero-upload.tsx`

**Context:** Drop zone visual. Currently uses `border-brand-teal`, `bg-surface-secondary`. Migrate to terra-bordered drop zone on white card.

- [ ] **Step 1: Read the file** — see what classes are currently in use.
- [ ] **Step 2: Token swap**

Replace tokens systematically:
- `border-brand-teal/...` → `border-sr-terra/...` (40% for default, 60% for hover/drag-over)
- `bg-brand-teal/...` → `bg-sr-terra/...` (4% for default tint, 8% for hover)
- `text-brand-navy` / `font-heading` → `text-sr-ink` / `font-display`
- `text-ink-muted` → `text-sr-ink-mute`
- `text-ink-secondary` → `text-sr-ink-soft`
- `text-brand-teal` (any UI accent) → `text-sr-terra`
- `bg-surface-secondary` → `bg-sr-cream`
- `border-surface-border` → `border-sr-hairline`

The dashed border becomes terra-tinted: `border-2 border-dashed border-sr-terra/40 hover:border-sr-terra/60`.

For the filled-state img display (when a hero photo is selected), keep the `max-h-[65vh] sm:max-h-[70vh]` per the existing memory — don't touch internal sizing.

- [ ] **Step 3: Type-check + build + commit**

```bash
npm run type-check
npm run build
git add src/components/wizard/hero-upload.tsx
git commit -m "feat(wizard): migrate HeroUpload tokens to sr-* — terra dashed drop zone"
```

---

## Task 6: Restyle `<ReferenceUpload>`

**Files:**
- Modify: `src/components/wizard/reference-upload.tsx`

Same token-swap pattern as Task 5. Reference uploads sit alongside the hero — visually similar but smaller cards.

- [ ] **Step 1: Token swap** — same patterns as Task 5
- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/wizard/reference-upload.tsx
git commit -m "feat(wizard): migrate ReferenceUpload tokens to sr-*"
```

---

## Task 7: Restyle `<RoomTypeSelector>`

**Files:**
- Modify: `src/components/staging/room-type-selector.tsx`

**Context:** Multi-select cards for room types (Living Room, Bedroom, Kitchen, etc.). Current selected state uses navy/teal; new uses the soft-teal-style terra treatment per `feedback_choice_highlight_soft_teal.md` interpreted as terra (the spec confirms terra-tinted bg + terra border + retained ink text).

- [ ] **Step 1: Read the file**, identify the card markup + selected/unselected classes
- [ ] **Step 2: Token swap + selection state**
  - Default: `bg-white border border-sr-ink/[0.10] text-sr-ink hover:border-sr-terra hover:bg-sr-terra/[0.04]`
  - Selected: `bg-sr-terra/[0.10] border-sr-terra/40 text-sr-ink shadow-[0_4px_16px_-8px_rgba(199,111,78,0.35)]` (no white-on-terra; ink text retained)
  - Checkmark/dot when selected: `text-sr-terra`
- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/room-type-selector.tsx
git commit -m "feat(wizard): migrate RoomTypeSelector to sr-* + terra selection treatment"
```

---

## Task 8: Restyle `<TakeCountStep>`

**Files:**
- Modify: `src/components/staging/take-count-step.tsx`

**Context:** Bundle picker — Single Take vs Three Takes radio cards. Same selection treatment as RoomTypeSelector.

- [ ] **Step 1: Read the file**
- [ ] **Step 2: Token swap** — same selection treatment as Task 7. Keep the descriptive copy and credit-cost annotations; only change the visual tokens.
- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/take-count-step.tsx
git commit -m "feat(wizard): migrate TakeCountStep to sr-* + terra selection"
```

---

## Task 9: Restyle `<ListingPill>` and `<NotesStep>`

**Files:**
- Modify: `src/components/staging/listing-pill.tsx`
- Modify: `src/components/wizard/notes-step.tsx`

### ListingPill

The listing-picker control on Step 1 (Upload). Currently navy chrome. Restyle:
- Pill background: `bg-white border border-sr-ink/[0.10]`
- Selected listing label: `text-sr-ink`
- Caret/chevron: `text-sr-ink-mute`
- Open state dropdown card: `bg-white border-sr-hairline shadow-[0_18px_48px_-12px_rgba(31,53,57,0.18)]`
- Hover on a listing item: `hover:bg-sr-cream`
- Selected item: `bg-sr-terra/[0.10] text-sr-terra` (small accent, since this picker is utility not editorial)

### NotesStep

- Textarea: `bg-white border border-sr-ink/[0.10] focus:border-sr-terra focus:ring-2 focus:ring-sr-terra/20 text-sr-ink placeholder-sr-ink-mute`
- Suggest pills (style-derived): `bg-sr-terra/[0.06] border border-sr-terra/25 text-sr-terra hover:bg-sr-terra/[0.12]`
- Eyebrow / hint copy: `text-sr-ink-mute`

- [ ] **Step 1: Token swap both files**
- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/listing-pill.tsx src/components/wizard/notes-step.tsx
git commit -m "feat(wizard): migrate ListingPill + NotesStep to sr-*"
```

---

## Task 10: Step 6 paywall card + terra submit button

**Files:**
- Modify: `src/app/stage/page.tsx` (Step 6 render block + paywall card)

**Context:** Two changes inside the `step === 'notes'` branch of `stage/page.tsx`. The paywall card (when `!hasEnoughCredits`) needs token migration. The submit button needs to turn TERRA when hasEnoughCredits is true (high-stakes commit signaling).

### Paywall card

The current card uses `border-brand-teal bg-brand-teal/5`. Migrate to:
```tsx
<div className="rounded-xl border-[1.5px] border-sr-terra/40 bg-sr-terra/[0.06] p-5 flex items-start gap-4">
  <span
    className="flex-shrink-0 size-10 rounded-full bg-sr-terra text-white flex items-center justify-center"
    aria-hidden="true"
  >
    {/* same SVG as before */}
  </span>
  <div className="flex-1 min-w-0">
    <p className="font-display text-xl text-sr-ink leading-tight">
      {userCredits === 0 ? "You're out of credits" : `You need ${creditsNeeded} credits — you have ${userCredits}`}
    </p>
    <p className="mt-2 text-sm text-sr-ink-soft font-medium leading-snug">
      Paid plans are launching soon. Every account will get more credits when they do — we&apos;ll be in touch.
    </p>
    {userCredits > 0 && (styles.length * creditsPerStyleValue) > userCredits && (
      <button
        type="button"
        onClick={() => advanceTo('style')}
        className="mt-3 text-sm font-semibold text-sr-terra underline underline-offset-4 hover:text-sr-terra/80 transition-colors"
      >
        ← Pick fewer styles to stage now
      </button>
    )}
  </div>
</div>
```

### Submit button

The current submit button is a navy block. Replace with the terra `WizardSubmitButton` (which is just a styled variant of the continue button):

```tsx
// Within the notes-step footerRight slot:
<button
  type="button"
  onClick={handleSubmitClick}
  disabled={isGenerating || roomTypes.length === 0 || !hasEnoughCredits}
  className="h-12 px-5 inline-flex flex-col items-center justify-center bg-sr-terra text-white rounded-full hover:bg-sr-terra/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_14px_-4px_rgba(199,111,78,0.4)] font-semibold tracking-[0.02em]"
>
  {hasEnoughCredits ? (
    <>
      <span className="text-sm leading-none">
        {styles.length <= 1 ? 'Stage this room' : `Stage ${styles.length} rooms`}
      </span>
      <span className="text-[10px] font-medium text-white/80 leading-none mt-1">
        {creditsNeeded} credit{creditsNeeded === 1 ? '' : 's'}
        {bundle === 'triple' ? ` · ${styles.length * 3} versions` : ''}
      </span>
    </>
  ) : (
    <span className="text-sm leading-none">Out of credits</span>
  )}
</button>
```

The "Uses N credits · M remaining after" hint just below — keep but migrate tokens:
```tsx
<p className="text-sm text-sr-ink text-center font-medium">
  Uses {creditsNeeded} credit{creditsNeeded === 1 ? '' : 's'} · {userCredits - creditsNeeded} remaining after
</p>
```

- [ ] **Step 1: Apply both changes**
- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Apostrophe scan: ensure `we'll` etc. use `&apos;`.

- [ ] **Step 3: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): terra paywall card + terra submit button on step 6"
```

---

## Task 11: Delete old `wizard-card.tsx` and `wizard-progress.tsx`

**Files:**
- Delete: `src/components/wizard/wizard-card.tsx`
- Delete: `src/components/wizard/wizard-progress.tsx`

- [ ] **Step 1: Verify no remaining importers**

Use Grep to find any remaining imports of `wizard-card` or `wizard-progress`:
```
pattern: "from '@/components/wizard/wizard-(card|progress)'", glob: "src/**/*.{ts,tsx}"
```

If matches exist, fix the imports first.

- [ ] **Step 2: Delete the files + commit**

```bash
git rm src/components/wizard/wizard-card.tsx src/components/wizard/wizard-progress.tsx
git commit -m "chore(wizard): remove dead wizard-card.tsx + wizard-progress.tsx after Shell migration"
```

---

## Task 12: Final build + lint + test

- [ ] **Step 1: Run all checks**

```bash
npm run type-check
npm run build
npm run lint
npm run test
```

Expected: type-check + build clean, lint shows only pre-existing warnings, tests pass (no new tests added in Plan 2 — UI-only restyles).

- [ ] **Step 2: Manual visual verification on dev server**

Start dev: `npm run dev`. Walk through all 6 steps:

1. `/stage` cold-start → Step 1 (Upload) — terra drop zone, listing pill, dark Continue.
2. Continue → Step 2 (Reference) — eyebrow says "Step 2 of 6 · Reference · Optional", Skip + Continue buttons.
3. Continue → Step 3 (Rooms) — terra-selected room cards.
4. Continue → Step 4 (Takes) — bundle picker with terra selection.
5. Continue → Step 5 (Style) — counter bar + style rows.
6. Continue → Step 6 (Notes) — textarea + suggest pills, terra Submit at bottom.

If `creditsRemaining < creditsNeeded`, the paywall card surfaces above the submit button (test with a non-admin account or by temporarily setting credits to 0 via DDB).

Phone-portrait check via Chrome DevTools (iPhone 14 Pro). All steps fit. Apostrophe-free.

---

## Task 13: Push branch + open PR

- [ ] **Step 1: Push**
```bash
git push -u origin feat/wizard-rebuild
```

- [ ] **Step 2: Open PR** (depends on Plan 1's PR #25 — set base to `feat/interior-foundation` if Plan 1 hasn't merged yet, or to `master` if it has)

```bash
gh pr create --base feat/interior-foundation --title "Plan 2: wizard rebuild (shell, 6 steps, paywall, terra submit)" --body "$(cat <<'EOF'
## Summary
- New WizardShell (eyebrow + Fraunces question + subtitle + body + footer) replaces WizardCard
- New WizardProgressHairline (terra fill) replaces segmented WizardProgress
- WizardBackButton + WizardContinueButton extracted into shared module
- /stage page header: logo + credits + close-X (drops the "Gallery" link)
- All 6 step bodies token-migrated to sr-* (HeroUpload, ReferenceUpload, RoomTypeSelector, TakeCountStep, ListingPill, NotesStep)
- Paywall card on Step 6 restyled with terra-tinted card
- Submit button on Step 6 turns TERRA (high-stakes commit treatment)

## Spec
docs/superpowers/specs/2026-05-04-app-interior-visual-consistency-design.md

## Plan
docs/superpowers/plans/2026-05-04-wizard-rebuild.md

## Test plan
- [ ] Walk through all 6 steps end-to-end on phone-portrait + laptop
- [ ] Submit a single-style stage (verify it still routes through batch)
- [ ] Submit a triple-bundle stage (verify variant flow)
- [ ] Trigger out-of-credits state — paywall card surfaces, submit reads "Out of credits", disabled
- [ ] Apostrophe escapes — no Amplify build break
- [ ] Pre-Plan-1 changes still work (cover-image-on-download from /stage result)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If Plan 1 has already merged, change `--base feat/interior-foundation` to `--base master`.

---

## Self-review notes

Spec coverage:
- ✅ Wizard shell migration (Task 1)
- ✅ Progress hairline (Task 2)
- ✅ Header chrome — logo + credits + close-X (Task 4)
- ✅ Eyebrow + Fraunces question + terra italic (Task 4 step 3)
- ✅ Back / Continue buttons restyled (Tasks 3 + 4)
- ✅ HeroUpload, ReferenceUpload (Tasks 5-6)
- ✅ RoomTypeSelector, TakeCountStep (Tasks 7-8)
- ✅ ListingPill, NotesStep (Task 9)
- ✅ Paywall card polish (Task 10)
- ✅ Terra submit treatment (Task 10)

Out of scope (Plan 3+):
- StagingWaitConcierge (generating step) — Plan 3
- Result step (single-style + batch reveal) — Plan 3
- Gallery viewer — Plan 4

StyleRow is shared with the landing page already and uses `STYLE_PALETTES`. Verified during exploration that it doesn't need Plan-2-specific changes — its terra accents already match. Listed in spec but no task because there's no code change.
