# Onboarding Upload Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the onboarding Upload step into three focused screens (Upload / Rooms / Style) and plumb the collected room type through to `/api/stage/batch` so the Lambda runs room-calibrated analysis and the downstream ceremony surfaces (concierge notes, EditorialNameplate, StyleRow thumbnails) use real room context.

**Architecture:** Three new presentational screens under `src/components/onboarding/` mirroring the main `/stage` wizard's Upload → Rooms → Style cadence. `OnboardingFlow` gains one new state (`activeRoomType`), two new `OnboardingStep` values (`'rooms'` + `'style'`), and threads the room through `startFirstStage` + the existing generating/result ceremony props. `OnboardingProgressBar` updates to an 11-step sequence. Welcome copy shifts from `Seven quick taps` to `A few taps`. No backend, no Lambda, no DDB, no new type libraries.

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind, framer-motion. Vitest available; no new tests (presentational — matches existing onboarding test culture).

**Source spec:** `docs/superpowers/specs/2026-04-24-onboarding-upload-split-design.md`.

---

## File structure

**New files:**
- `src/components/onboarding/upload-screen.tsx` — hero-only upload screen with Back + Continue footer
- `src/components/onboarding/rooms-screen.tsx` — single-select room picker reusing `<RoomTypeSelector>`
- `src/components/onboarding/style-screen.tsx` — single-select style picker + `"Stage this room (1 credit)"` trigger

**Modified files:**
- `src/app/onboarding/onboarding-flow.tsx` — add `'rooms'` + `'style'` to `OnboardingStep`, add `activeRoomType` state, add `roomCategoryFor` helper, swap inline upload JSX for three new step branches, pass `roomTypes` through `startFirstStage` + generating/result component props
- `src/components/onboarding/onboarding-progress-bar.tsx` — insert `'rooms'` and `'style'` into `STEP_ORDER`
- `src/components/onboarding/welcome-screen.tsx` — subtitle copy change

**Files intentionally not touched:**
- `src/components/staging/room-type-selector.tsx` — reused as-is (feed single-element array + onToggle overwrite pattern)
- `src/components/wizard/hero-upload.tsx` — reused as-is
- `src/components/staging/style-row.tsx` — reused as-is
- `src/components/onboarding/role-picker.tsx`, `volume-picker.tsx`, `bombshell-screen.tsx`, `bridge-screen.tsx`, `how-it-works-screen.tsx`, `regeneration-primer.tsx` — middle screens untouched
- All staging/comparison components shipped in PR #1, #3, #5
- All API routes, Lambda, DDB helpers

---

## Task 1: `OnboardingStep` type + `activeRoomType` state + `roomCategoryFor` helper

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Foundations for the new steps. Type addition unlocks Task 2–4's imports; `activeRoomType` state is needed by Task 5's wiring; `roomCategoryFor` helper is needed by Task 4's `<StyleScreen>` component.

- [ ] **Step 1: Extend the `OnboardingStep` type**

Find at the top of `src/app/onboarding/onboarding-flow.tsx`:

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
  | 'rooms'
  | 'style'
  | 'generating'
  | 'result';
```

- [ ] **Step 2: Add `RoomType` + `ThumbnailRoom` imports at the top of the file**

Find the existing `@/components/staging/...` imports. Add:

```ts
import { type RoomType } from '@/components/staging/room-type-selector';
import { type ThumbnailRoom } from '@/components/staging/style-row';
```

- [ ] **Step 3: Add the `roomCategoryFor` helper** above the `OnboardingFlow` function (module-level pure function):

```ts
function roomCategoryFor(roomType: RoomType | null): ThumbnailRoom {
  const livingTypes: RoomType[] = ['Living Room', 'Dining Room', 'Studio'];
  return roomType && livingTypes.includes(roomType) ? 'living' : 'bedroom';
}
```

- [ ] **Step 4: Add the `activeRoomType` state hook** inside `OnboardingFlow`, near the existing state (alongside `activeStyle`):

```ts
const [activeRoomType, setActiveRoomType] = useState<RoomType | null>(null);
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS (imports wire up; no existing code breaks since new step values aren't rendered yet).

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "types(onboarding): add rooms + style steps, activeRoomType state, roomCategoryFor helper"
```

---

## Task 2: `UploadScreen` component

**Files:**
- Create: `src/components/onboarding/upload-screen.tsx`

Hero-only upload screen. One task per screen.

- [ ] **Step 1: Create `src/components/onboarding/upload-screen.tsx`**

```tsx
'use client';

import { HeroUpload } from '@/components/wizard/hero-upload';
import type { RoomPhoto } from '@/components/wizard/types';

interface UploadScreenProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function UploadScreen({ heroPhoto, onChange, onBack, onContinue }: UploadScreenProps) {
  return (
    <div className="w-full h-full max-w-xl mx-auto px-5 overflow-y-auto py-6">
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
        Upload your photo.
      </h1>
      <p className="mt-3 text-[17px] sm:text-[19px] text-ink-muted font-medium text-center max-w-[40ch] mx-auto">
        Any empty or furnished room. JPG or PNG, up to 20MB.
      </p>

      <div className="mt-8">
        <HeroUpload heroPhoto={heroPhoto} onChange={onChange} />
      </div>

      <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[17px] sm:text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!heroPhoto}
          className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[17px] sm:text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          Continue
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/upload-screen.tsx
git commit -m "feat(onboarding): UploadScreen — photo-only upload step with Back/Continue footer"
```

---

## Task 3: `RoomsScreen` component

**Files:**
- Create: `src/components/onboarding/rooms-screen.tsx`

Single-select room picker. Reuses `<RoomTypeSelector>` feeding a single-element array + overwrite-on-toggle.

- [ ] **Step 1: Create `src/components/onboarding/rooms-screen.tsx`**

```tsx
'use client';

import { RoomTypeSelector, type RoomType } from '@/components/staging/room-type-selector';

interface RoomsScreenProps {
  activeRoomType: RoomType | null;
  onPick: (type: RoomType) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function RoomsScreen({ activeRoomType, onPick, onBack, onContinue }: RoomsScreenProps) {
  return (
    <div className="w-full h-full max-w-xl mx-auto px-5 overflow-y-auto py-6">
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
        What kind of room?
      </h1>
      <p className="mt-3 text-[17px] sm:text-[19px] text-ink-muted font-medium text-center max-w-[40ch] mx-auto">
        So we can place the right furniture for the space.
      </p>

      <div className="mt-8">
        <RoomTypeSelector
          selected={activeRoomType ? [activeRoomType] : []}
          onToggle={onPick}
        />
      </div>

      <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[17px] sm:text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!activeRoomType}
          className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[17px] sm:text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          Continue
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/rooms-screen.tsx
git commit -m "feat(onboarding): RoomsScreen — single-select room picker using RoomTypeSelector"
```

---

## Task 4: `StyleScreen` component

**Files:**
- Create: `src/components/onboarding/style-screen.tsx`

Single-select style picker + the stage trigger. The "Stage this room (1 credit)" button moves here from the old upload step.

- [ ] **Step 1: Create `src/components/onboarding/style-screen.tsx`**

```tsx
'use client';

import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
import { StyleRow, type ThumbnailRoom } from '@/components/staging/style-row';

interface StyleScreenProps {
  activeStyle: StagingStyle;
  onPickStyle: (s: StagingStyle) => void;
  roomCategory: ThumbnailRoom;
  isStaging: boolean;
  stageError: string | null;
  onBack: () => void;
  onStage: () => void;
}

export function StyleScreen({
  activeStyle,
  onPickStyle,
  roomCategory,
  isStaging,
  stageError,
  onBack,
  onStage,
}: StyleScreenProps) {
  return (
    <div className="w-full h-full max-w-4xl mx-auto px-5 overflow-y-auto py-6">
      <h1 className="font-heading text-3xl sm:text-4xl text-brand-navy tracking-tight leading-tight text-center">
        Pick a style.
      </h1>
      <p className="mt-3 text-[17px] sm:text-[19px] text-ink-muted font-medium text-center max-w-[48ch] mx-auto">
        You can try others after — 1 credit each, you have 15.
      </p>

      <div className="mt-8">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STAGING_STYLES.map((s) => (
            <li key={s}>
              <StyleRow
                style={s}
                selected={activeStyle === s}
                onPick={() => onPickStyle(s)}
                roomCategory={roomCategory}
                size="compact"
              />
            </li>
          ))}
        </ul>
      </div>

      {stageError && (
        <p className="mt-6 text-[17px] text-red-600 font-bold text-center" role="alert">
          {stageError}
        </p>
      )}

      <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isStaging}
          className="inline-flex items-center justify-center gap-2 bg-white text-brand-navy border-2 border-brand-navy font-bold text-[17px] sm:text-[19px] px-7 py-4 rounded-xl hover:bg-brand-navy hover:text-white active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onStage}
          disabled={isStaging}
          aria-busy={isStaging}
          className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[17px] sm:text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        >
          {isStaging ? 'Staging…' : 'Stage this room (1 credit)'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/style-screen.tsx
git commit -m "feat(onboarding): StyleScreen — single-select style picker + stage trigger"
```

---

## Task 5: Wire `OnboardingFlow` — step branches, startFirstStage plumbing, generating/result room-aware props

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

Biggest task. Seven targeted edits to one file.

- [ ] **Step 1: Add the new screen imports at the top of the file**

Find the existing `@/components/onboarding/...` import block. Add:

```ts
import { UploadScreen } from '@/components/onboarding/upload-screen';
import { RoomsScreen } from '@/components/onboarding/rooms-screen';
import { StyleScreen } from '@/components/onboarding/style-screen';
```

- [ ] **Step 2: Remove imports that are no longer referenced directly by the flow**

The old inline upload step referenced `HeroUpload`, `StyleRow`, and `STAGING_STYLES`. These are now owned by `UploadScreen` + `StyleScreen`. Remove their imports from `onboarding-flow.tsx`:

```ts
// DELETE:
import { HeroUpload } from '@/components/wizard/hero-upload';
import { StyleRow } from '@/components/staging/style-row';

// CHANGE from:
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
// TO:
import { type StagingStyle } from '@/lib/ai/prompts';
```

Keep the `StagingStyle` type import — `activeStyle` state + `buildConciergeNotes` calls both need it.

- [ ] **Step 3: Update `startFirstStage` to pass `roomTypes`**

Find the `/api/stage/batch` fetch body inside `startFirstStage`:

```ts
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
```

Replace with:

```ts
const stageRes = await fetch('/api/stage/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    heroS3Key: s3Key,
    referenceS3Keys: [],
    roomTypes: activeRoomType ? [activeRoomType] : [],
    styles: [activeStyle],
    notes: '',
    quality: 'standard',
  }),
});
```

- [ ] **Step 4: Replace the inline `step === 'upload'` block with three new step branches**

Find the entire inline upload-step block (begins with `{step === 'upload' && (` and ends before `{step === 'generating' && (`). The block is roughly 48 lines in the current file and looks like:

```tsx
{step === 'upload' && (
  <div className="w-full h-full max-w-4xl mx-auto px-5 overflow-y-auto py-6">
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
        disabled={!heroPhoto || isStaging}
        onClick={startFirstStage}
        aria-busy={isStaging}
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-bold text-[19px] px-8 py-4 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all duration-150 shadow-medium disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        {isStaging ? 'Staging…' : 'Stage this room (1 credit)'}
      </button>
    </div>
  </div>
)}
```

Replace the entire block above with:

```tsx
{step === 'upload' && (
  <UploadScreen
    heroPhoto={heroPhoto}
    onChange={setHeroPhoto}
    onBack={() => setStep('how-it-works')}
    onContinue={() => setStep('rooms')}
  />
)}
{step === 'rooms' && (
  <RoomsScreen
    activeRoomType={activeRoomType}
    onPick={setActiveRoomType}
    onBack={() => setStep('upload')}
    onContinue={() => setStep('style')}
  />
)}
{step === 'style' && (
  <StyleScreen
    activeStyle={activeStyle}
    onPickStyle={setActiveStyle}
    roomCategory={roomCategoryFor(activeRoomType)}
    isStaging={isStaging}
    stageError={stageError}
    onBack={() => setStep('rooms')}
    onStage={startFirstStage}
  />
)}
```

- [ ] **Step 5: Update the `generating` step's `buildConciergeNotes` call to use the real room type**

Find:

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

Replace the `roomTypes: []` with the real value:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    heroImageUrl={heroPhoto?.preview ?? ''}
    conciergeNotes={buildConciergeNotes({
      style: activeStyle,
      roomTypes: activeRoomType ? [activeRoomType] : [],
      analyserNotes: [],
    }).map<ConciergeNote>((note) => ({ note, style: activeStyle }))}
  />
)}
```

- [ ] **Step 6: Update the `result` step's `<EditorialNameplate>` to pass the room**

Find:

```tsx
<EditorialNameplate style={activeStyle} roomTypes={[]} />
```

Replace with:

```tsx
<EditorialNameplate
  style={activeStyle}
  roomTypes={activeRoomType ? [activeRoomType] : []}
/>
```

- [ ] **Step 7: Update the `result` step's `<ConciergeNotesExpander>` call to use the real room**

Find:

```tsx
<ConciergeNotesExpander
  notes={buildConciergeNotes({
    style: activeStyle,
    roomTypes: [],
    analyserNotes: subJobConciergeNotes,
  })}
  style={activeStyle}
/>
```

Replace with:

```tsx
<ConciergeNotesExpander
  notes={buildConciergeNotes({
    style: activeStyle,
    roomTypes: activeRoomType ? [activeRoomType] : [],
    analyserNotes: subJobConciergeNotes,
  })}
  style={activeStyle}
/>
```

- [ ] **Step 8: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Watch for `react/no-unescaped-entities` — the inline upload step is gone (which had apostrophes) but none of the new code in this file adds JSX apostrophes.

- [ ] **Step 9: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): wire Upload/Rooms/Style steps + plumb roomTypes to batch + ceremony props"
```

---

## Task 6: `OnboardingProgressBar` `STEP_ORDER` update

**Files:**
- Modify: `src/components/onboarding/onboarding-progress-bar.tsx`

Insert the two new steps so percent-fill math stays honest.

- [ ] **Step 1: Update the `STEP_ORDER` constant**

Find:

```ts
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
```

Replace with:

```ts
const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'volume',
  'bombshell',
  'bridge',
  'how-it-works',
  'upload',
  'rooms',
  'style',
  'generating',
  'result',
];
```

No other logic changes needed — `percentFor` already uses `indexOf / length` arithmetic that recomputes automatically.

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/onboarding-progress-bar.tsx
git commit -m "feat(onboarding): progress bar STEP_ORDER for 11-step sequence (+ rooms, style)"
```

---

## Task 7: `WelcomeScreen` subtitle copy

**Files:**
- Modify: `src/components/onboarding/welcome-screen.tsx`

One-line copy change to make the Welcome's promise durable.

- [ ] **Step 1: Update the subtitle**

Find:

```tsx
<motion.p
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.4, ease: 'easeOut', delay: 0.7 }}
  className="text-[17px] sm:text-[19px] font-medium text-white/80 leading-snug max-w-[44ch]"
>
  Seven quick taps and you&apos;ll see it staged.
</motion.p>
```

Replace the inner text (keep the motion.p with all its props):

```tsx
<motion.p
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.4, ease: 'easeOut', delay: 0.7 }}
  className="text-[17px] sm:text-[19px] font-medium text-white/80 leading-snug max-w-[44ch]"
>
  A few taps and you&apos;ll see it staged.
</motion.p>
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/welcome-screen.tsx
git commit -m "copy(onboarding): welcome subtitle — 'Seven quick taps' → 'A few taps'"
```

---

## Task 8: Manual acceptance + push + PR

**Files:** (verification + ship)

- [ ] **Step 1 (optional if `.env.local` is set): Start dev server and walk the checklist**

Run: `npm run dev`

Reset a test account's onboarding flag:

```bash
aws dynamodb update-item --table-name stageright \
  --key '{"pk":{"S":"USER#<your-cognito-sub>"},"sk":{"S":"PROFILE"}}' \
  --update-expression "REMOVE onboardingCompletedAt, firstStageAt" \
  --region ap-southeast-2
```

Navigate to `/onboarding` and verify:

**New Upload screen (step 7):**
- [ ] Shows only the hero upload + headline `Upload your photo.` + subtitle + Back/Continue footer
- [ ] Continue disabled without a photo
- [ ] Back returns to how-it-works

**New Rooms screen (step 8):**
- [ ] 11 room rows selectable (RoomTypeSelector reused)
- [ ] Picking a row shows the teal active state + check icon
- [ ] Picking a different row switches the selection cleanly
- [ ] Continue disabled until a room is picked
- [ ] Back returns to upload; photo still there

**New Style screen (step 9):**
- [ ] 12 styles rendered with thumbnails matching the picked room (e.g. pick Bedroom → bedroom thumbnails; pick Living Room → living-room thumbnails)
- [ ] Default `activeStyle` is still Modern
- [ ] Picking a row selects it
- [ ] "Stage this room (1 credit)" is the primary CTA
- [ ] Back returns to rooms with all picks preserved

**Progress bar:**
- [ ] Welcome shows ~9% fill
- [ ] Upload shows ~64%
- [ ] Rooms ~73%, Style ~82%
- [ ] Bar disappears on generating + result (unchanged behaviour)

**Welcome copy:**
- [ ] Subtitle reads `A few taps and you'll see it staged.`

**Downstream:**
- [ ] Generating notes interpolate the real room (e.g. `Layering clean lines and neutral tones through your bedroom.` if Bedroom was picked)
- [ ] Result EditorialNameplate shows `STAGED · BEDROOM` (or whichever room)
- [ ] Result expander reads `N things we watched for in your bedroom`

**Regression:**
- [ ] `/stage` single-style + batch flows unchanged
- [ ] Middle onboarding screens unchanged

- [ ] **Step 2: Final type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(onboarding): split upload step into Upload / Rooms / Style screens" --body "$(cat <<'EOF'
## Summary
Splits the onboarding Upload step into three focused screens — Upload
(photo only), Rooms (single-select room type), Style (single-select style
+ stage trigger). Onboarding grows 9 → 11 steps.

activeRoomType plumbs through startFirstStage to /api/stage/batch, so the
Lambda's analysis runs with room-type calibration (functional furniture
checklists applied). Downstream:
- Generating screen's concierge notes now say "through your bedroom"
  (real room) instead of "your room" (generic)
- Result screen's EditorialNameplate eyebrow reads STAGED · BEDROOM
- Result expander reads "N things we watched for in your bedroom"
- Style screen's thumbnails match the picked room

Welcome subtitle: "Seven quick taps" → "A few taps" (durable).

Spec: docs/superpowers/specs/2026-04-24-onboarding-upload-split-design.md
Plan: docs/superpowers/plans/2026-04-24-onboarding-upload-split.md

## Test plan
- [x] Type-check + build clean
- [ ] Manual (Amplify): walk the new 11-step flow; verify thumbnails match picked room
- [ ] Manual: downstream room interpolation in concierge notes + nameplate
- [ ] Regression: /stage single + batch flows unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope reminders

- **Main `/stage` wizard unchanged.** This matches onboarding to the wizard's existing pattern; no changes needed to the wizard itself.
- **Multi-select on Rooms or Style in onboarding.** Single-select is intentional for the first-time flow.
- **Photo-based room inference.** Explicit choice is simpler.
- **Backend changes.** `/api/stage/batch` already accepts `roomTypes`; no route changes.
- **Lambda changes.** Already consumes `roomTypes` (from PR #3). No redeploy needed.

---

*End of plan.*
