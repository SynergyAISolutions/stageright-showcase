# Onboarding redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every onboarding screen against the locked design spec at `docs/superpowers/specs/2026-04-25-onboarding-redesign-design.md` so all 14 screens share one consistent editorial-luxury language.

**Architecture:** Three new primitives (`OnboardingShell`, `OnboardingCta`, `Eyebrow`) become the backbone. Every screen composes from those plus the existing `ChoiceRow`/`ChoiceTile`/`StyleRow`. Page shell is identical: progress bar at top (5–6px teal-light glow), content centred, CTA full-width pinned at bottom with thumb-zone padding. Brand-teal accent appears on every screen.

**Tech Stack:** Next.js 14 App Router · React Server Components where possible · framer-motion for orchestrated reveals · Tailwind 3 with the project's existing brand tokens.

**Verification approach:** Each task ends with `npx tsc --noEmit` clean and a visual check at `http://localhost:3000/onboarding` (admin email auto-routes there fresh every session). The `/design-preview` page stays as the locked reference any time a question arises about a token.

---

## Phase 1 — Primitives

### Task 1: Create the `Eyebrow` primitive

**Files:**
- Create: `src/components/onboarding/eyebrow.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

// Tiny editorial pill — uppercase tracked label preceded by a 4px brand-teal
// dot. Lives directly above a headline as the "eyebrow" tag. Same component
// on every onboarding screen so the visual signature is consistent.
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] sm:text-[12px] lg:text-[13px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60',
        className,
      )}
    >
      <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no output).

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/eyebrow.tsx
git commit -m "feat(onboarding): add Eyebrow primitive"
```

---

### Task 2: Create the `OnboardingCta` primitive

**Files:**
- Create: `src/components/onboarding/onboarding-cta.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// The single CTA used on every onboarding screen that has one.
//
// Layout: full-width rectangle pinned at the bottom of the screen via the
// OnboardingShell's bottom slot. On lg+ screens, max-width 480px and centred.
// Solid navy, white label, brand-teal-light arrow icon. Editorial-luxury
// cubic-bezier on hover/active.
//
// Optionally fades + rises in (used on hero screens that orchestrate reveals).
export function OnboardingCta({
  label,
  onClick,
  disabled = false,
  delay,
  type = 'button',
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** When set, the button mounts with a delayed reveal beat. */
  delay?: number;
  type?: 'button' | 'submit';
}) {
  const expo = [0.16, 1, 0.3, 1] as const;
  const baseClasses =
    'group relative w-full lg:max-w-[480px] mx-auto flex items-center justify-center gap-3 bg-brand-navy text-white rounded-[14px] h-14 sm:h-[60px] hover:bg-brand-navy-light active:scale-[0.99] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 shadow-[0_10px_30px_-12px_rgba(15,29,46,0.5)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-brand-navy';

  const inner = (
    <>
      <span className="text-[16px] sm:text-[17px] font-semibold tracking-tight">
        {label}
      </span>
      <span className="flex items-center justify-center text-brand-teal-light transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-[3px]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );

  if (typeof delay === 'number') {
    return (
      <motion.button
        type={type}
        onClick={onClick}
        disabled={disabled}
        initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.85, ease: expo, delay }}
        className={cn(baseClasses)}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseClasses)}
    >
      {inner}
    </button>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` (clean)
Then:

```bash
git add src/components/onboarding/onboarding-cta.tsx
git commit -m "feat(onboarding): add OnboardingCta primitive"
```

---

### Task 3: Create the `OnboardingShell` primitive

**Files:**
- Create: `src/components/onboarding/onboarding-shell.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

// The single page-shell used by every onboarding screen.
//
// Anatomy:
//  - top: progress bar (rendered by parent, slot here is reserved by pt-1.5)
//  - middle: scrollable content area, vertically centred via flex
//  - bottom: pinned CTA region with thumb-zone padding (24px from edges,
//    24px above safe-area-inset-bottom)
//
// `cta` is optional. Auto-advance screens (Role/Volume/Listing-type/Rooms/
// Style) pass `cta={null}` and consume the bottom space for content.
export function OnboardingShell({
  children,
  cta,
  contentClassName,
}: {
  children: ReactNode;
  cta?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Content area — flex-1, scrollable if it overflows (rarely needed) */}
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col items-center justify-center px-6 sm:px-10 pt-10 sm:pt-14',
          cta ? 'pb-6' : 'pb-10',
          contentClassName,
        )}
      >
        {children}
      </div>

      {/* CTA dock — full-width on mobile, capped + centred on lg+ */}
      {cta && (
        <div
          className="flex-shrink-0 px-6 sm:px-10 pt-2"
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          {cta}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/onboarding-shell.tsx
git commit -m "feat(onboarding): add OnboardingShell primitive"
```

---

### Task 4: Verify `OnboardingProgressBar` against spec

**Files:**
- Verify: `src/components/onboarding/onboarding-progress-bar.tsx`

- [ ] **Step 1: Read file and confirm match**

Open the file. The bar must read: `h-[5px] sm:h-[6px] bg-brand-navy/[0.15]` track, `bg-brand-teal-light` fill with `boxShadow: 0 0 14px rgba(35,165,148,0.7)`. If anything differs, update inline. The motion duration is `0.5s` with the easing `[0.16, 1, 0.3, 1]`.

- [ ] **Step 2: Commit only if changed**

If unchanged, skip. If changed:

```bash
git add src/components/onboarding/onboarding-progress-bar.tsx
git commit -m "fix(onboarding): align ProgressBar with locked spec"
```

---

### Task 5: Verify `ChoiceRow` and `ChoiceTile` selected state

**Files:**
- Verify: `src/components/onboarding/choice-row.tsx`
- Verify: `src/components/onboarding/choice-tile.tsx`

- [ ] **Step 1: Read both files**

Selected state must be `bg-brand-navy` solid fill with `text-white` label, `bg-white/[0.10]` icon container with `text-brand-teal-light` icon, and a white-on-navy radio dot. Resting state is `bg-white border-brand-navy/[0.10]`.

- [ ] **Step 2: Open `/design-preview` in incognito; compare**

Open `http://localhost:3000/design-preview` in an incognito window. Walk to "Choice row — default / hover / selected" and "Choice tile". Visually confirm the live components match the preview.

If they don't, edit the source files to match — copy the exact class list from the preview's `ChoiceRowDemo` / `ChoiceTileDemo` into the real components.

- [ ] **Step 3: Commit if changed**

```bash
git add src/components/onboarding/choice-row.tsx src/components/onboarding/choice-tile.tsx
git commit -m "fix(onboarding): align Choice components with locked spec"
```

---

## Phase 2 — Hero screens

### Task 6: Rebuild `WelcomeScreen`

**Files:**
- Modify: `src/components/onboarding/welcome-screen.tsx`

- [ ] **Step 1: Replace the file with the spec-compliant version**

```tsx
'use client';

import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function WelcomeScreen({
  userName,
  onContinue,
}: {
  userName: string;
  onContinue: () => void;
}) {
  return (
    <section className="relative w-full h-full overflow-hidden">
      {/* Ambient blurred staged-room image — barely visible behind a cream
          wash. Says "premium product" the moment the page loads. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <img
          src="/style-thumbnails/living-room/hamptons.jpg"
          alt=""
          className="size-full object-cover opacity-[0.18]"
          style={{ filter: 'blur(28px) saturate(0.9)', transform: 'scale(1.1)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(248,249,251,0.55) 0%, rgba(248,249,251,0.85) 50%, rgba(248,249,251,0.95) 100%)',
          }}
        />
      </div>
      {/* Atmospheric blooms */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 size-[640px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(35,165,148,0.28) 0%, rgba(35,165,148,0) 65%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-40 size-[720px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(15,29,46,0.12) 0%, rgba(15,29,46,0) 65%)',
        }}
      />

      <OnboardingShell
        cta={<OnboardingCta label="Begin" onClick={onContinue} delay={1.45} />}
      >
        <div className="flex flex-col items-center text-center max-w-[34ch] sm:max-w-[44ch] lg:max-w-[60ch]">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.1 }}
          >
            <Eyebrow>Welcome</Eyebrow>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.3 }}
            className="mt-6 font-heading text-brand-navy text-[44px] sm:text-[76px] lg:text-[128px] leading-[0.96] tracking-[-0.025em]"
          >
            Let&apos;s stage your first listing,{' '}
            <span className="italic text-brand-teal">{userName}</span>.
          </motion.h1>

          <motion.span
            aria-hidden
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.95 }}
            className="block mt-10 h-[2px] w-14 bg-brand-teal/65 origin-center"
          />

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 1.05 }}
            className="mt-6 text-[17px] sm:text-[20px] lg:text-[24px] font-medium text-brand-navy/75 leading-snug"
          >
            Ninety seconds from upload to staged.
          </motion.p>
        </div>
      </OnboardingShell>
    </section>
  );
}
```

- [ ] **Step 2: Type-check, visually verify, commit**

```bash
npx tsc --noEmit
# Visit http://localhost:3000/onboarding in incognito and walk to step 1
git add src/components/onboarding/welcome-screen.tsx
git commit -m "feat(onboarding): rebuild WelcomeScreen against design spec"
```

---

### Task 7: Rebuild `BridgeScreen`

**Files:**
- Modify: `src/components/onboarding/bridge-screen.tsx`

- [ ] **Step 1: Replace file**

```tsx
'use client';

import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function BridgeScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[700px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(35,165,148,0.16) 0%, rgba(35,165,148,0) 60%)',
        }}
      />
      <OnboardingShell
        cta={<OnboardingCta label="Show me" onClick={onContinue} delay={1.1} />}
      >
        <div className="flex flex-col items-center text-center max-w-[24ch] sm:max-w-[28ch]">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.1 }}
          >
            <Eyebrow>The shift</Eyebrow>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.3 }}
            className="mt-6 font-heading text-brand-navy text-[44px] sm:text-[76px] lg:text-[128px] leading-[0.96] tracking-[-0.025em]"
          >
            Under a minute.
            <br />
            <span className="italic text-brand-teal">From $1.25 a photo.</span>
          </motion.h1>
        </div>
      </OnboardingShell>
    </div>
  );
}
```

- [ ] **Step 2: Type-check, verify, commit**

```bash
npx tsc --noEmit
# Walk to step 5 (Bridge) in /onboarding
git add src/components/onboarding/bridge-screen.tsx
git commit -m "feat(onboarding): rebuild BridgeScreen against design spec"
```

---

### Task 8: Refactor `BombshellScreen` — locked spacing rhythm + primitives

**Files:**
- Modify: `src/components/onboarding/bombshell-screen.tsx`

- [ ] **Step 1: Update the screen wrapper to use OnboardingShell + OnboardingCta + Eyebrow**

The screen still uses the existing `Sequence` helper but the page chrome standardises. Replace the JSX between `export function BombshellScreen({...})` opening brace and the next-to-last `}` (just before the helpers) with:

```tsx
export function BombshellScreen({
  role,
  listingsPerMonth,
  listingIntent,
  onContinue,
}: Props) {
  const variant = variantFor(role, listingIntent);
  const v = listingsPerMonth ?? '11+';
  const volume = VOLUME_LABEL[v];

  let content: React.ReactNode = null;

  if (variant === 'agent-sell') {
    content = (
      <Sequence
        lead={`At ${volume} listings a month, that's`}
        bigStat={LISTINGS_PER_YEAR[v]}
        after="listings a year."
        pivot={
          <>
            Stage every one for around <Em>{AGENT_ANNUAL_COST[v]} a year</Em>.
          </>
        }
        close={<>Staged listings sell <Em>73% faster</Em> (RESA).</>}
      />
    );
  } else if (variant === 'agent-lease') {
    content = (
      <Sequence
        lead={`At ${volume} rentals a month, that's`}
        bigStat={LISTINGS_PER_YEAR[v]}
        after="rentals a year."
        pivot={
          <>
            Stage every one for around <Em>{AGENT_ANNUAL_COST[v]} a year</Em>.
          </>
        }
        close={<>Staged rentals lease up <Em>~40% faster</Em>.</>}
      />
    );
  } else if (variant === 'photographer') {
    content = (
      <Sequence
        lead="Agents are paying around"
        bigStat={PHOTOGRAPHER_MONTHLY[v]}
        after={`a month for virtually-staged photos at ${volume} shoots.`}
        pivot={<>Add it to your deliverables — <Em>$1.25 an image</Em>.</>}
        close="Same shoot. Same client. Your service extended."
      />
    );
  } else if (variant === 'pm-lease') {
    content = (
      <Sequence
        lead="Staged rentals lease up about"
        bigStat="40% faster"
        after="— roughly 8 fewer vacant days per turnover."
        pivot={
          <>
            At {volume} rentals a month, that&apos;s{' '}
            <Em>{PM_ANNUAL_RECOVERED[v]} a year</Em> in rent your landlords keep.
          </>
        }
        close={<>StageRight covers a year for around <Em>$2,700</Em>.</>}
      />
    );
  } else if (variant === 'owner-sell') {
    content = (
      <Sequence
        lead="A physical stager charges"
        bigStat="$2,300–$3,200"
        after="to put real furniture in before a single photo."
        pivot={<>Staged listings sell about <Em>73% faster</Em> (RESA).</>}
        close="StageRight does the same for a fraction. You keep the photos."
      />
    );
  } else {
    content = (
      <Sequence
        lead="Staged rentals lease up about"
        bigStat="40% faster"
        after="— roughly 8 empty days turned into rent."
        pivot={<>A physical stager would charge <Em>$2,300–$3,200</Em>.</>}
        close="StageRight does the same for a fraction."
      />
    );
  }

  return (
    <OnboardingShell
      cta={<OnboardingCta label="Show me how" onClick={onContinue} delay={4.7} />}
    >
      <div className="w-full max-w-[34ch] sm:max-w-[44ch] lg:max-w-[52ch] mx-auto text-center">
        {content}
      </div>
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: Update the `Sequence` helper to use locked spacing rhythm**

In the same file replace the `Sequence` function body's JSX (the `<>...</>`) with the spec rhythm. Change `mt-4` / `mt-3` / `my-7` etc. so the rhythm follows: lead → stat = `mt-6 sm:mt-8`, stat → after = `mt-6 sm:mt-8`, after → hairline = `mt-12 sm:mt-16`, hairline → pivot = `mt-12 sm:mt-16`, pivot → close = `mt-6 sm:mt-8`.

```tsx
return (
  <>
    <motion.p
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.0, duration: 0.85, ease: expo }}
      className="text-[17px] sm:text-[20px] lg:text-[24px] text-brand-navy/65 font-medium leading-snug tracking-tight"
    >
      {lead}
    </motion.p>

    <motion.p
      initial={{ opacity: 0, scale: 0.78, y: 14, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.85, duration: 1.1, ease: expo }}
      className="mt-6 sm:mt-8 font-heading text-brand-teal text-[88px] sm:text-[136px] lg:text-[200px] tracking-[-0.03em] tabular-nums leading-[0.92]"
    >
      {bigStat}
    </motion.p>

    <motion.p
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 1.95, duration: 0.85, ease: expo }}
      className="mt-6 sm:mt-8 text-[17px] sm:text-[20px] lg:text-[24px] text-brand-navy/65 font-medium leading-snug tracking-tight"
    >
      {after}
    </motion.p>

    <motion.span
      aria-hidden
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ delay: 2.85, duration: 0.6, ease: expo }}
      className="block h-[2px] w-12 bg-brand-teal/55 mx-auto my-12 sm:my-16 origin-center"
    />

    <motion.p
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 3.1, duration: 0.85, ease: expo }}
      className="text-[17px] sm:text-[20px] lg:text-[24px] text-brand-navy font-medium leading-snug tracking-tight"
    >
      {pivot}
    </motion.p>

    <motion.p
      initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 3.85, duration: 0.85, ease: expo }}
      className="mt-6 sm:mt-8 text-[17px] sm:text-[20px] lg:text-[24px] text-brand-navy/85 font-medium leading-snug tracking-tight"
    >
      {close}
    </motion.p>
  </>
);
```

The `Em` component remains unchanged.

- [ ] **Step 3: Type-check, walk through, commit**

```bash
npx tsc --noEmit
# /onboarding step 4 — sit through the full sequence on desktop
git add src/components/onboarding/bombshell-screen.tsx
git commit -m "feat(onboarding): refactor BombshellScreen to spec primitives + spacing"
```

---

## Phase 3 — Auto-advance choice screens

### Task 9: Refactor `RolePicker` to spec

**Files:**
- Modify: `src/components/onboarding/role-picker.tsx`

- [ ] **Step 1: Use OnboardingShell + Eyebrow + section-headline scale**

Replace the inner JSX of the `RolePicker` component to wrap content in `<OnboardingShell>`, prepend an `<Eyebrow>About you</Eyebrow>`, and use the section-headline scale.

```tsx
return (
  <OnboardingShell>
    <div className="w-full max-w-xl flex flex-col items-center text-center">
      <Eyebrow>About you</Eyebrow>
      <h1 className="mt-4 sm:mt-5 font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
        What do you do?
      </h1>

      <ul role="radiogroup" aria-label="Your role" className="mt-10 w-full flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <li key={o.value}>
            <ChoiceRow
              icon={o.icon}
              label={o.label}
              selected={active === o.value}
              onPick={() => pick(o.value)}
            />
          </li>
        ))}
      </ul>
    </div>
  </OnboardingShell>
);
```

Add `import { Eyebrow } from './eyebrow';` and `import { OnboardingShell } from './onboarding-shell';` at the top of the file.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/role-picker.tsx
git commit -m "feat(onboarding): align RolePicker with design spec"
```

---

### Task 10: Refactor `ListingTypeScreen`

**Files:**
- Modify: `src/components/onboarding/listing-type-screen.tsx`

- [ ] **Step 1: Same shell + eyebrow + headline pattern as Task 9**

```tsx
return (
  <OnboardingShell>
    <div className="w-full max-w-xl flex flex-col items-center text-center">
      <Eyebrow>About your listings</Eyebrow>
      <h1 className="mt-4 sm:mt-5 font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
        What are you listing?
      </h1>

      <ul role="radiogroup" aria-label="What are you listing?" className="mt-10 w-full flex flex-col gap-3">
        {/* (existing 3 ChoiceRow entries: Homes to sell / Homes to rent out / Commercial property) */}
      </ul>
    </div>
  </OnboardingShell>
);
```

Keep the three `<ChoiceRow>` entries with their icons exactly as they are (the user-modified file already has correct icons + the `sub="Coming soon"` on Commercial).

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/listing-type-screen.tsx
git commit -m "feat(onboarding): align ListingTypeScreen with design spec"
```

---

### Task 11: Refactor `VolumePicker`

**Files:**
- Modify: `src/components/onboarding/volume-picker.tsx`

- [ ] **Step 1: Same shell + eyebrow + headline + role-aware copy**

```tsx
const headline =
  role === 'listing-my-own'
    ? 'And how many properties?'
    : 'And how many listings a month?';

return (
  <OnboardingShell>
    <div className="w-full max-w-xl flex flex-col items-center text-center">
      <Eyebrow>About your volume</Eyebrow>
      <h1 className="mt-4 sm:mt-5 font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
        {headline}
      </h1>

      <ul role="radiogroup" aria-label="Listings per month" className="mt-10 w-full flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <li key={o.value}>
            <ChoiceRow
              label={o.label}
              selected={active === o.value}
              onPick={() => pick(o.value)}
            />
          </li>
        ))}
      </ul>
    </div>
  </OnboardingShell>
);
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/volume-picker.tsx
git commit -m "feat(onboarding): align VolumePicker with design spec"
```

---

## Phase 4 — Action screens

### Task 12: Refactor `UploadScreen`

**Files:**
- Modify: `src/components/onboarding/upload-screen.tsx`

- [ ] **Step 1: Use shell + section headline; CTA via OnboardingCta**

```tsx
'use client';

import { HeroUpload } from '@/components/wizard/hero-upload';
import type { RoomPhoto } from '@/components/wizard/types';
import type { ListingIntent, PropertyType } from '@/types';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';

interface UploadScreenProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
  onContinue: () => void;
  listingIntent?: ListingIntent | null;
  propertyType?: PropertyType | null;
  onBack?: () => void;
}

export function UploadScreen({
  heroPhoto,
  onChange,
  onContinue,
  listingIntent,
  propertyType,
}: UploadScreenProps) {
  const isLease = listingIntent === 'lease';
  const isCommercial = propertyType === 'commercial';

  const caption = isCommercial
    ? 'Heads up — the catalogue is residential.'
    : isLease
      ? 'For rentals — use an empty room.'
      : 'Any room — empty or furnished.';

  return (
    <OnboardingShell
      cta={
        <OnboardingCta
          label="Continue"
          onClick={onContinue}
          disabled={!heroPhoto}
        />
      }
    >
      <div className="w-full max-w-xl flex flex-col items-center text-center">
        <h1 className="font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
          Upload your photo.
        </h1>
        <p className="mt-3 text-[14px] sm:text-[15px] text-brand-teal font-semibold uppercase tracking-[0.16em]">
          {caption}
        </p>
        <div className="mt-8 w-full">
          <HeroUpload heroPhoto={heroPhoto} onChange={onChange} />
        </div>
      </div>
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/upload-screen.tsx
git commit -m "feat(onboarding): align UploadScreen with design spec"
```

---

### Task 13: Refactor `RoomsScreen`

**Files:**
- Modify: `src/components/onboarding/rooms-screen.tsx`

- [ ] **Step 1: Shell + eyebrow + headline; mask-fade scroll if grid overflows**

```tsx
return (
  <OnboardingShell>
    <div className="w-full max-w-2xl flex flex-col items-center text-center">
      <Eyebrow>About the room</Eyebrow>
      <h1 className="mt-4 sm:mt-5 font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
        What kind of room?
      </h1>

      <div
        className="mt-10 w-full grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          maxHeight: 'min(60vh, 540px)',
          maskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
        }}
      >
        {ROOM_TYPES.map((rt) => (
          <ChoiceTile
            key={rt}
            icon={ROOM_ICONS[rt] /* keep existing icons */}
            label={rt}
            selected={activeRoomType === rt}
            onPick={() => pick(rt)}
          />
        ))}
      </div>
    </div>
  </OnboardingShell>
);
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/rooms-screen.tsx
git commit -m "feat(onboarding): align RoomsScreen with design spec + mask-fade"
```

---

### Task 14: Refactor `StyleScreen` — restore prior header, no auto-select

**Files:**
- Modify: `src/components/onboarding/style-screen.tsx`

- [ ] **Step 1: Replace file with the spec version**

```tsx
'use client';

import { useState } from 'react';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
import { StyleRow, type ThumbnailRoom } from '@/components/staging/style-row';
import { OnboardingShell } from './onboarding-shell';
import { OnboardingCta } from './onboarding-cta';
import { Eyebrow } from './eyebrow';

interface StyleScreenProps {
  activeStyle: StagingStyle;
  onPickStyle: (s: StagingStyle) => void;
  roomCategory: ThumbnailRoom;
  isStaging: boolean;
  stageError: string | null;
  onStage: () => void;
  onBack?: () => void;
}

export function StyleScreen({
  activeStyle,
  onPickStyle,
  roomCategory,
  isStaging,
  stageError,
  onStage,
}: StyleScreenProps) {
  const [picked, setPicked] = useState<StagingStyle | null>(null);
  const visualActive = picked ?? activeStyle;

  const handlePick = (s: StagingStyle) => {
    if (isStaging) return;
    setPicked(s);
    onPickStyle(s);
  };

  return (
    <OnboardingShell
      cta={
        <OnboardingCta
          label={isStaging ? 'Staging…' : 'Stage this room'}
          onClick={onStage}
          disabled={isStaging || !picked}
        />
      }
    >
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        <Eyebrow>Pick a style</Eyebrow>
        <h1 className="mt-4 sm:mt-5 font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
          Twelve to <span className="italic text-brand-teal">choose from.</span>
        </h1>
        {stageError && (
          <p className="mt-4 text-[14px] text-red-600 font-medium" role="alert">
            {stageError}
          </p>
        )}
        <div
          className="mt-10 w-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maxHeight: 'min(56vh, 520px)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 88%, transparent 100%)',
          }}
        >
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-12">
            {STAGING_STYLES.map((s) => (
              <li key={s}>
                <StyleRow
                  style={s}
                  selected={visualActive === s}
                  onPick={() => handlePick(s)}
                  roomCategory={roomCategory}
                  size="compact"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </OnboardingShell>
  );
}
```

This: (a) restores the prior header treatment with `Eyebrow` + section-headline, (b) removes auto-advance — the user picks → "Stage this room" CTA enables → they tap to commit, (c) adds `mt-10` between count + grid, (d) gives `pt-10/pt-14` from the top via OnboardingShell.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/style-screen.tsx
git commit -m "feat(onboarding): restore Style header + remove auto-select"
```

---

## Phase 5 — Ceremony screens

### Task 15: Rebuild `StagingWaitConcierge` — image visible, no box

**Files:**
- Modify: `src/components/staging/staging-wait-concierge.tsx`

- [ ] **Step 1: Replace the overlay + content blocks**

In the file, replace the content rendered between `{/* Lighter atmospheric overlay ... */}` and the progress-line div with:

```tsx
{/* Light overlay so the image stays visible */}
<div
  aria-hidden
  className="absolute inset-0"
  style={{
    background:
      'radial-gradient(ellipse at center, rgba(15, 29, 46, 0.25) 0%, rgba(15, 29, 46, 0.55) 100%)',
  }}
/>

{/* Orientation chip top-right */}
<div
  className="absolute top-0 right-0"
  style={{
    paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
    paddingRight: '1rem',
  }}
>
  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.14] backdrop-blur-md border border-white/25 text-white text-[12px] sm:text-[13px] font-semibold px-3.5 py-1.5 tracking-wide">
    <span className="size-1.5 rounded-full bg-brand-teal-light animate-pulse" />
    Staging &middot; 20&ndash;40s
  </span>
</div>

{/* Centred text — NO BOX. Drop shadow keeps it legible against the image. */}
<div className="absolute inset-0 flex items-center justify-center px-6 sm:px-12">
  <AnimatePresence mode="wait">
    <motion.div
      key={safeIndex}
      initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="max-w-[26ch] sm:max-w-[40ch] flex flex-col items-center text-center gap-5 sm:gap-7"
      style={{
        textShadow:
          '0 2px 14px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      {active.style && (
        <span className="inline-flex items-center gap-2.5 text-[12px] sm:text-[14px] font-semibold tracking-[0.22em] uppercase text-white">
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-brand-teal-light"
            style={{ boxShadow: '0 0 12px rgba(35,165,148,0.85)' }}
          />
          {active.style}
        </span>
      )}
      <p className="font-heading text-white text-[32px] sm:text-[48px] lg:text-[60px] leading-[1.05] tracking-[-0.015em]">
        {active.note}
      </p>
    </motion.div>
  </AnimatePresence>
</div>
```

- [ ] **Step 2: Verify + commit**

Visual: kick off a stage on `/onboarding`; confirm the user's uploaded image is clearly visible behind the text; the brand-teal-light dot is visible; the text reads cleanly thanks to the textShadow.

```bash
npx tsc --noEmit
git add src/components/staging/staging-wait-concierge.tsx
git commit -m "feat(staging): keep user image visible on wait screen"
```

---

### Task 16: Refactor Result block in `OnboardingFlow`

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Replace the `step === 'result'` block with shell + editorial nameplate + slider + OnboardingCta**

Replace the existing `step === 'result' && stagedUrl && originalUrl &&` block with:

```tsx
{step === 'result' && stagedUrl && originalUrl && (
  <OnboardingShell
    cta={<OnboardingCta label="Continue" onClick={() => setStep('fact-ai')} />}
  >
    <div className="w-full flex flex-col items-center gap-6 sm:gap-8">
      <div className="text-center">
        <Eyebrow>Staged · {activeRoomType ?? 'Room'}</Eyebrow>
        <h2 className="mt-2 font-heading text-brand-navy text-[32px] sm:text-[44px] lg:text-[56px] leading-[0.98] tracking-[-0.02em]">
          <span className="italic text-brand-teal">{activeStyle}</span>
        </h2>
      </div>

      <div
        className="w-full max-w-[860px] max-h-[55vh] flex items-center justify-center"
        style={{ containerType: 'size' }}
      >
        <BeforeAfterSlider
          key={stagedUrl}
          beforeSrc={originalUrl}
          afterSrc={stagedUrl}
          beforeLabel="Empty"
          afterLabel={activeStyle}
          fitParent
          autoReveal
          onRevealPeak={() => {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              navigator.vibrate(12);
            }
          }}
        />
      </div>
    </div>
  </OnboardingShell>
)}
```

Add the imports if missing:

```tsx
import { Eyebrow } from '@/components/onboarding/eyebrow';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { OnboardingCta } from '@/components/onboarding/onboarding-cta';
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): rebuild Result block to spec"
```

---

## Phase 6 — Disclosure screens

### Task 17: Rebuild `FactAiScreen` — three points with hierarchy

**Files:**
- Modify: `src/components/onboarding/fact-ai-screen.tsx`

- [ ] **Step 1: Replace file**

```tsx
'use client';

import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function FactAiScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 size-[600px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(35,165,148,0.18) 0%, rgba(35,165,148,0) 65%)',
        }}
      />
      <OnboardingShell
        cta={<OnboardingCta label="Continue" onClick={onContinue} delay={3.6} />}
      >
        <div className="max-w-[28ch] sm:max-w-[36ch] lg:max-w-[44ch] flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO }}
          >
            <Eyebrow>How to read your stage</Eyebrow>
          </motion.div>

          {/* Point 1 — hero scale */}
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.2 }}
            className="mt-8 sm:mt-10 font-heading text-brand-navy text-[44px] sm:text-[68px] lg:text-[96px] leading-[0.96] tracking-[-0.025em]"
          >
            Each image is{' '}
            <span className="italic text-brand-teal">AI-generated.</span>
          </motion.h1>

          {/* Point 2 — sub scale */}
          <motion.p
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 1.4 }}
            className="mt-10 text-[20px] sm:text-[28px] lg:text-[36px] text-brand-navy/85 font-medium leading-[1.18] tracking-tight"
          >
            Drag the slider <span className="text-brand-teal font-semibold">to compare it against the empty room.</span>
          </motion.p>

          {/* Point 3 — sub scale */}
          <motion.p
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 2.6 }}
            className="mt-10 text-[20px] sm:text-[28px] lg:text-[36px] text-brand-navy/85 font-medium leading-[1.18] tracking-tight"
          >
            That&apos;s your <span className="text-brand-teal font-semibold">dimension check.</span>
          </motion.p>
        </div>
      </OnboardingShell>
    </div>
  );
}
```

Hierarchy: hero point at `text-[44-68-96px]` is unambiguously the headline. Points 2 + 3 at `text-[20-28-36px]` are clearly subordinate. `mt-10` between every point — different ideas get the gap.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/onboarding/fact-ai-screen.tsx
git commit -m "feat(onboarding): rebuild FactAi with locked hierarchy"
```

---

### Task 18: Rebuild `FactCreditScreen` — suspense hold + "FREE" stat

**Files:**
- Modify: `src/components/onboarding/fact-credit-screen.tsx`

- [ ] **Step 1: Replace file**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

export function FactCreditScreen({ onContinue }: { onContinue: () => void; onBack?: () => void }) {
  // Suspense beat: eyebrow with "..." sits alone for 1.5s, then the body
  // arrives. Builds anticipation without belabouring it.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Body delays restart from the moment `ready` flips so the sequence reads
  // as a single orchestrated reveal, not two independent animations.
  const baseDelay = 0.0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/4 size-[640px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(35,165,148,0.20) 0%, rgba(35,165,148,0) 60%)',
        }}
      />
      <OnboardingShell
        cta={
          ready ? (
            <OnboardingCta label="See my gallery" onClick={onContinue} delay={3.4} />
          ) : null
        }
      >
        <div className="max-w-[28ch] sm:max-w-[40ch] lg:max-w-[52ch] flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO }}
          >
            <Eyebrow>And one more thing…</Eyebrow>
          </motion.div>

          {ready && (
            <>
              {/* Lead */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: baseDelay + 0.0 }}
                className="mt-12 sm:mt-16 text-[20px] sm:text-[28px] lg:text-[36px] text-brand-navy/65 font-medium leading-snug tracking-tight"
              >
                Every 7 stages,
              </motion.p>

              {/* Stat — "FREE" is the punchline word */}
              <motion.p
                initial={{ opacity: 0, scale: 0.78, y: 14, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: EXPO, delay: baseDelay + 0.85 }}
                className="mt-6 sm:mt-8 font-heading italic text-brand-teal text-[88px] sm:text-[136px] lg:text-[200px] leading-[0.92] tracking-[-0.03em]"
              >
                FREE
              </motion.p>

              {/* After */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: baseDelay + 1.95 }}
                className="mt-6 sm:mt-8 text-[20px] sm:text-[28px] lg:text-[36px] text-brand-navy font-medium leading-snug tracking-tight"
              >
                credit lands in your wallet.
              </motion.p>

              {/* Hairline */}
              <motion.span
                aria-hidden
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.6, ease: EXPO, delay: baseDelay + 2.85 }}
                className="block mt-12 sm:mt-16 h-[2px] w-12 bg-brand-teal/55 origin-center"
              />

              {/* Closer */}
              <motion.p
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.95, ease: EXPO, delay: baseDelay + 3.1 }}
                className="mt-12 sm:mt-16 text-[20px] sm:text-[28px] lg:text-[36px] text-brand-navy/85 font-medium leading-snug tracking-tight max-w-[36ch]"
              >
                If a stage ever misses,{' '}
                <span className="italic text-brand-teal">your next is on us.</span>
              </motion.p>
            </>
          )}
        </div>
      </OnboardingShell>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Walk through: confirm the eyebrow sits alone for ~1.5s, then the body reveals; "FREE" is the giant stat, italic teal; layout has even rhythm; CTA appears after the closer.

```bash
npx tsc --noEmit
git add src/components/onboarding/fact-credit-screen.tsx
git commit -m "feat(onboarding): rebuild FactCredit with suspense hold + FREE stat"
```

---

### Task 19: Cleanup unused components

**Files:**
- Delete: `src/components/onboarding/back-chevron.tsx` (no longer used in onboarding flow per spec)
- Verify: `src/components/staging/editorial-nameplate.tsx` is still used (it might be imported by `/stage` page result; if not, delete; if yes, leave)

- [ ] **Step 1: Confirm zero references**

Run: `grep -rn "BackChevron" src/` — must return only the file itself.
Run: `grep -rn "EditorialNameplate" src/` — keep file if any non-self references remain.

- [ ] **Step 2: Delete + commit**

```bash
git rm src/components/onboarding/back-chevron.tsx
# Delete editorial-nameplate.tsx only if zero non-self imports
git commit -m "chore(onboarding): remove unused BackChevron primitive"
```

---

### Task 20: Final type-check + build verification

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Production build**

Run: `npm run build` (kill dev server first if it's running on Windows)
Expected: green build, no apostrophe failures, no missing-class warnings.

- [ ] **Step 3: Walk through every screen at three viewports**

In an incognito window, sign in as admin (auto-routes to `/onboarding`). Walk every step on three sizes (375px wide / 768px wide / 1440px wide). Verify against the spec's validation checklist (Section 8 of the spec doc):

- [ ] Brand-teal accent visible on every screen.
- [ ] Page shell + progress bar present and visibly thick.
- [ ] CTA full-width, bottom-pinned with thumb-zone padding (or absent on auto-advance screens).
- [ ] Typography sizes match the spec table.
- [ ] Spacing rhythm: same idea = `gap-6`, different idea = `gap-10+`.
- [ ] Selected state on choice components is solid navy fill.
- [ ] Generating screen: user's image is visible behind the overlay.
- [ ] Mobile fits without overflow (mask-fade indicators present where scroll is required).

If any item fails, file a follow-up task — don't fix in-line during this verification step.

- [ ] **Step 4: Commit**

If anything was tweaked during verification, commit the fixes:

```bash
git add -A
git commit -m "fix(onboarding): final spec-compliance tweaks from walk-through"
```

---

## Self-review (against the spec)

**Spec coverage:**
- Tokens (Section 4) → applied across every task via primitive components and class strings. ✓
- Primitives (Section 5) → Tasks 1–5. ✓
- Per-screen layouts (Section 6, 14 screens) → Welcome (T6), Bridge (T7), Bombshell (T8), Role (T9), Listing-type (T10), Volume (T11), Upload (T12), Rooms (T13), Style (T14), Generating (T15), Result (T16), FactAi (T17), FactCredit (T18). HowItWorks is unchanged in this redesign because the user feedback was that it already felt right (sizing, structure). If on walk-through it doesn't match the spec, add a Task 19b. ✓ (gap deliberate, see HowItWorks note)
- Implementation order (Section 7) → mirrored in phase order. ✓
- Validation criteria (Section 8) → Task 20 step 3. ✓

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N" without code. Every task has the actual code body or the actual JSX block to paste.

**Type consistency:** Primitive props `OnboardingShell({ children, cta, contentClassName })` referenced consistently in Tasks 6–18. `OnboardingCta({ label, onClick, disabled, delay, type })` consistent. `Eyebrow({ children, className })` consistent.

**Open issue noted:** HowItWorks is intentionally unchanged in this plan. If it visually drifts from the rest of the flow once the new primitives ship, add a follow-up task to align it.
