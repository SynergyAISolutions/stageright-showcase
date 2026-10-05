# Onboarding Upload Split — Design

**Date:** 2026-04-24
**Status:** Design draft; pending spec review
**Scope:** Split onboarding's single "upload + pick style" step into three focused screens — Upload (photo only), Rooms (single-select room type), Style (single-select style, stage trigger). Onboarding grows from 9 → 11 steps. Collecting room type plumbs through to `/api/stage/batch` so the Lambda runs room-type-calibrated analysis (functional furniture checklists, room-specific concierge notes, room-showing editorial nameplate eyebrow). Welcome copy tweaks from `Seven quick taps` to the more durable `A few taps`.
**Out of scope:** Changes to any other onboarding screen (role, volume, bombshell, bridge, how-it-works, generating, result). Changes to the main `/stage` wizard. Changes to `/api/stage/batch` route code (already accepts `roomTypes`). No Lambda changes. No new DDB schema. Returning-user skip flow.

---

## 1. Background & motivation

PR #5 shipped the onboarding ceremony. Post-ship testing surfaced a gap: onboarding collects `style` but NOT `roomType`. Consequences downstream:

- `/api/stage/batch` receives `roomTypes: []`, which means the Lambda's `ROOM_TYPE_CHECKLISTS` (living-room → 3-seater sofa, coffee table, rug; bedroom → queen bed, nightstands, headboard wall; kitchen → barstools; etc.) is NOT applied to the staging prompt. Nano Banana Pro gets a generic "stage this room" instruction with no per-room-type functional anchoring.
- The analyser's `styleCalibrationBlock` + `buildAnalysisUserContext` still runs, but without room-type context the analysis lacks the per-zone focal-point guidance that elevates real outputs.
- Concierge notes fall back to `"your room"` (generic) in the base-note interpolation. User loses the personal cue.
- The result-step `<EditorialNameplate style={activeStyle} roomTypes={[]} />` shows just `STAGED` with no room-specific eyebrow.
- The `StyleRow` on the upload step is hardcoded to `roomCategory="living"`, so users picking a bedroom see living-room thumbnails. Mismatch.

The fix splits the one-page upload step into three screens mirroring the main `/stage` wizard's pattern (Upload → Rooms → Style). This:

- Aligns onboarding's staging preface with the real product flow — users learn the cadence they'll use every day.
- Cuts cognitive load per screen (one task, one screen).
- Gives the Lambda real inputs to work with (room-calibrated staging + analysis).
- Means the `StyleRow` thumbnails on the new Style step can reflect the actual room the user just picked.
- Removes the "seven quick taps" honesty problem — the copy becomes `A few taps and you'll see it staged.`, durable against future step-count changes.

---

## 2. Positioning & locked decisions

- **Onboarding grows from 9 → 11 steps.** `welcome → role → volume → bombshell → bridge → how-it-works → upload → rooms → style → generating → result`.
- **Upload (step 7) = photo only.** No style picker on this screen. One task per screen.
- **Rooms (step 8) = single-select.** The 11 existing `RoomType` values. Uses the same `<RoomTypeSelector>` component as the main wizard — but semantically single-select (one room at a time). The component already accepts `selected: RoomType[]` + `onToggle` — we feed it a single-element array and swap on toggle.
- **Style (step 9) = single-select + stage trigger.** The "Stage this room (1 credit)" button moves to this screen. Uses `<StyleRow>` with `roomCategory` derived from the picked room (living/dining/studio → `'living'`, everything else → `'bedroom'`).
- **Extracted to their own component files.** `upload-screen.tsx`, `rooms-screen.tsx`, `style-screen.tsx` under `src/components/onboarding/`. Matches the existing pattern of `welcome-screen.tsx`, `role-picker.tsx`, `volume-picker.tsx`, `bombshell-screen.tsx`, `bridge-screen.tsx`, `how-it-works-screen.tsx`. The old inline JSX block in `onboarding-flow.tsx` for the upload step is deleted.
- **Progress bar updates for 11 steps.** Welcome ~9%, role ~18%, volume ~27%, bombshell ~36%, bridge ~45%, how-it-works ~55%, upload ~64%, rooms ~73%, style ~82%. Generating + result hidden (ceremony still takes over).
- **Welcome copy:** `Seven quick taps and you'll see it staged.` → `A few taps and you'll see it staged.` Durable.
- **All downstream improvements cascade automatically** once `activeRoomType` is plumbed through: Lambda analysis is room-calibrated, concierge notes interpolate actual room name, `EditorialNameplate` shows `STAGED · LIVING ROOM`.

---

## 3. Design principles

1. **One decision per screen.** Don't stack. Upload is about the photo; Rooms is about the room; Style is about the style. Each has one primary action + one back button.
2. **Mirror the real product flow.** Onboarding's staging preface matches `/stage`'s Upload → Rooms → Style cadence. Agent learns the tool they'll actually use.
3. **Room choice drives later UX, not just the Lambda.** The Style step's thumbnails reflect the user's room. The result screen's nameplate eyebrow reads `STAGED · BEDROOM` (or whatever they picked). Room is a first-class citizen, not just a Lambda param.
4. **Back button works all the way back.** Every new screen has a Back button that goes to the previous step. No "you can't un-pick" dead-ends.
5. **Sizing matches the other onboarding screens.** Headlines in DM Serif `text-3xl sm:text-4xl`, subtitles in medium ink-muted, Continue buttons in brand-navy matching the existing pattern. No new component vocabulary.

---

## 4. Architecture & data flow

```
OnboardingFlow
  │
  ├── state additions:
  │     const [activeRoomType, setActiveRoomType] = useState<RoomType | null>(null);
  │     (existing state unchanged: heroPhoto, activeStyle, batchId, stagedUrl, …)
  │
  ├── step switch (new order):
  │     welcome → role → volume → bombshell → bridge → how-it-works
  │     → upload → rooms → style → generating → result
  │
  ├── <UploadScreen heroPhoto={heroPhoto} onChange={setHeroPhoto} onBack={→ how-it-works} onContinue={→ rooms} />
  │
  ├── <RoomsScreen activeRoomType={activeRoomType} onPick={setActiveRoomType} onBack={→ upload} onContinue={→ style} />
  │
  ├── <StyleScreen
  │     activeStyle={activeStyle}
  │     onPickStyle={setActiveStyle}
  │     roomCategory={roomCategoryFor(activeRoomType)}
  │     isStaging={isStaging}
  │     stageError={stageError}
  │     onBack={→ rooms}
  │     onStage={startFirstStage} />
  │
  └── startFirstStage now reads activeRoomType and passes it to /api/stage/batch:
        body: { ..., roomTypes: activeRoomType ? [activeRoomType] : [], ... }
```

No API, no Lambda, no DDB, no type-library changes needed for this spec. All downstream plumbing (Lambda uses `roomTypes`, route already accepts it, types already exist) is already in place from PR #3.

---

## 5. Data & type changes

**`OnboardingStep` type** (`src/app/onboarding/onboarding-flow.tsx`) — add `'rooms'` and `'style'`:

```ts
export type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'volume'
  | 'bombshell'
  | 'bridge'
  | 'how-it-works'
  | 'upload'
  | 'rooms'     // NEW
  | 'style'     // NEW
  | 'generating'
  | 'result';
```

**No other type changes.** `RoomType` already exists (`src/components/staging/room-type-selector.tsx` exports it). `StagingStyle` already exists.

---

## 6. Detailed component-by-component spec

### 6.1 Backend

No changes.

### 6.2 Client — new components

#### 6.2.1 `UploadScreen` (new)

**File:** `src/components/onboarding/upload-screen.tsx`

Lifts just the hero upload UI out of the current inline upload-step block. Photo upload, headline, subtitle, Back + Continue footer.

**Props:**

```ts
import type { RoomPhoto } from '@/components/wizard/types';

interface UploadScreenProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
  onBack: () => void;
  onContinue: () => void;
}
```

**Markup:**

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

#### 6.2.2 `RoomsScreen` (new)

**File:** `src/components/onboarding/rooms-screen.tsx`

Single-select room picker reusing `<RoomTypeSelector>`. The component accepts `selected: RoomType[]` + `onToggle`; we feed a single-element array and overwrite on toggle (not toggle, despite the name).

**Props:**

```ts
import type { RoomType } from '@/components/staging/room-type-selector';

interface RoomsScreenProps {
  activeRoomType: RoomType | null;
  onPick: (type: RoomType) => void;
  onBack: () => void;
  onContinue: () => void;
}
```

**Markup:**

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

**Semantics on `onToggle`:** the underlying `<RoomTypeSelector>` fires `onToggle(type)` on any row click. For multi-select contexts, the caller uses it to add/remove from the array. For this single-select context, `onPick` simply **sets** the value (via the parent's `setActiveRoomType(type)`), overwriting any previous pick. Clicking the already-selected row re-sets the same value (harmless no-op visually — the row stays active).

Edge case: user clicks the selected row hoping to DESELECT. With the overwrite pattern, the row stays active. To support deselect, we'd need `onPick` to toggle to null. I'll leave this out — the Continue button is the commitment, and deselect doesn't fit a "one-per-user" single-select UX. If the user wants a different room, they click a different row.

#### 6.2.3 `StyleScreen` (new)

**File:** `src/components/onboarding/style-screen.tsx`

Single-select style picker + the staging trigger. The "Stage this room (1 credit)" button moves here from the old upload step.

**Props:**

```ts
import type { StagingStyle } from '@/lib/ai/prompts';
import type { ThumbnailRoom } from '@/components/staging/style-row';

interface StyleScreenProps {
  activeStyle: StagingStyle;
  onPickStyle: (s: StagingStyle) => void;
  roomCategory: ThumbnailRoom;
  isStaging: boolean;
  stageError: string | null;
  onBack: () => void;
  onStage: () => void;
}
```

**Markup:**

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

### 6.3 Client — modified components

#### 6.3.1 `OnboardingFlow` changes (`src/app/onboarding/onboarding-flow.tsx`)

**Change 1 — `OnboardingStep` type** gains `'rooms'` and `'style'` entries (per §5).

**Change 2 — Imports.** Remove the now-deleted inline-upload-step deps that are no longer referenced directly (`HeroUpload`, `StyleRow`, `STAGING_STYLES`). Add imports for the three new screen components + `RoomType`:

```ts
// Remove (no longer referenced directly by the flow; UploadScreen / StyleScreen own them now):
// import { HeroUpload } from '@/components/wizard/hero-upload';
// import { StyleRow } from '@/components/staging/style-row';
// import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';

// Keep the StagingStyle type import (still used for activeStyle state + Lambda concierge notes):
import { type StagingStyle } from '@/lib/ai/prompts';

// Add:
import { UploadScreen } from '@/components/onboarding/upload-screen';
import { RoomsScreen } from '@/components/onboarding/rooms-screen';
import { StyleScreen } from '@/components/onboarding/style-screen';
import { type RoomType } from '@/components/staging/room-type-selector';
```

**Change 3 — New state.** Alongside existing state:

```ts
const [activeRoomType, setActiveRoomType] = useState<RoomType | null>(null);
```

**Change 4 — Room-category helper.** Small pure helper inside the file (near the top, outside the component):

```ts
import type { ThumbnailRoom } from '@/components/staging/style-row';

function roomCategoryFor(roomType: RoomType | null): ThumbnailRoom {
  const livingTypes: RoomType[] = ['Living Room', 'Dining Room', 'Studio'];
  return roomType && livingTypes.includes(roomType) ? 'living' : 'bedroom';
}
```

This mirrors the main `/stage` wizard's same-named helper. Different signatures because onboarding is single-select; wizard is array.

**Change 5 — `startFirstStage` passes `roomTypes`.** Find the `/api/stage/batch` fetch body:

```ts
body: JSON.stringify({
  heroS3Key: s3Key,
  referenceS3Keys: [],
  roomTypes: [],
  styles: [activeStyle],
  notes: '',
  quality: 'standard',
}),
```

Replace with:

```ts
body: JSON.stringify({
  heroS3Key: s3Key,
  referenceS3Keys: [],
  roomTypes: activeRoomType ? [activeRoomType] : [],
  styles: [activeStyle],
  notes: '',
  quality: 'standard',
}),
```

**Change 6 — Delete the inline `step === 'upload'` block** (the big JSX block currently inside `AnimatePresence`, lines ~221–269 in the current file). Replace with three new step branches:

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

**Change 7 — Downstream integration with the generating + result steps** (small, keeps what we have but now has real `activeRoomType`):

Inside the generating step's `<StagingWaitConcierge>`, the `buildConciergeNotes` call now gets real `roomTypes`. Find:

```tsx
conciergeNotes={buildConciergeNotes({
  style: activeStyle,
  roomTypes: [],
  analyserNotes: [],
}).map<ConciergeNote>((note) => ({ note, style: activeStyle }))}
```

Replace with:

```tsx
conciergeNotes={buildConciergeNotes({
  style: activeStyle,
  roomTypes: activeRoomType ? [activeRoomType] : [],
  analyserNotes: [],
}).map<ConciergeNote>((note) => ({ note, style: activeStyle }))}
```

Inside the result step, both the `<EditorialNameplate>` and the `<ConciergeNotesExpander>` need the room too. Find:

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

#### 6.3.2 `OnboardingProgressBar` (`src/components/onboarding/onboarding-progress-bar.tsx`)

**Change — update `STEP_ORDER` array** to include the new steps in their position:

```ts
const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'volume',
  'bombshell',
  'bridge',
  'how-it-works',
  'upload',
  'rooms',         // NEW
  'style',         // NEW
  'generating',
  'result',
];
```

The `percentFor` helper already uses `indexOf / length` arithmetic, so percentages recompute automatically:

- welcome → 1/11 ≈ 9%
- role → 2/11 ≈ 18%
- volume → 3/11 ≈ 27%
- bombshell → 4/11 ≈ 36%
- bridge → 5/11 ≈ 45%
- how-it-works → 6/11 ≈ 55%
- upload → 7/11 ≈ 64%
- rooms → 8/11 ≈ 73%
- style → 9/11 ≈ 82%
- generating, result → hidden (CEREMONY_STEPS unchanged)

No other logic changes.

#### 6.3.3 `WelcomeScreen` copy (`src/components/onboarding/welcome-screen.tsx`)

**Change — subtitle copy.** Find:

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

Replace with:

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

---

## 7. Copy library

### Upload screen
- Headline: `Upload your photo.`
- Subtitle: `Any empty or furnished room. JPG or PNG, up to 20MB.`
- Back button: `Back`
- Continue button: `Continue`

### Rooms screen
- Headline: `What kind of room?`
- Subtitle: `So we can place the right furniture for the space.`
- Back button: `Back`
- Continue button: `Continue`

### Style screen
- Headline: `Pick a style.`
- Subtitle: `You can try others after — 1 credit each, you have 15.`
- Back button: `Back`
- Primary button (idle): `Stage this room (1 credit)`
- Primary button (busy): `Staging…`

### Welcome screen
- Subtitle (changed): `A few taps and you'll see it staged.` (was `Seven quick taps and you'll see it staged.`)

No other copy changes.

---

## 8. Edge cases & error handling

| Scenario | Behaviour |
|---|---|
| User clicks Continue on Upload without uploading a photo | Button is `disabled={!heroPhoto}`. Can't advance. Same pattern as the current upload step. |
| User clicks Continue on Rooms without picking a room | Button is `disabled={!activeRoomType}`. Can't advance. |
| User clicks the already-selected room row on the Rooms screen | `onPick` overwrites with the same value. Harmless no-op visually; row stays active. No "deselect" path — user has to pick a different room or hit Back. |
| User clicks Back from Style → Rooms → Upload | State preserved on each step (heroPhoto, activeRoomType, activeStyle all persist). User can come forward and see the same choices. |
| Staging fails (`stageError` set) | Error message appears on the Style screen (only surface where staging is triggered). User can adjust or retry. Behaviour matches the current upload step's error handling; just lives on Style now. |
| Window-reload mid-onboarding | State resets to welcome (pre-existing behaviour — onboarding isn't persisted between page loads). User walks through again. |
| `roomCategoryFor(null)` on the Style screen before a room is picked | Returns `'bedroom'` (the fallback branch). Shouldn't happen in practice because the user can't reach Style without picking a room (Rooms' Continue is disabled). Defensive fallback. |
| Progress bar renders for an unknown `step` value | `percentFor` returns 0. No crash. |
| `RoomTypeSelector`'s `aria-pressed` on the selected row | Handled natively by the component. No extra work. |

---

## 9. Acceptance criteria

**Upload screen:**
- [ ] Step 7 shows ONLY the hero upload + headline + subtitle + Back/Continue footer
- [ ] Headline reads `Upload your photo.`
- [ ] Continue button disabled when no photo uploaded
- [ ] Back button returns to how-it-works step

**Rooms screen:**
- [ ] Step 8 shows all 11 room types as selectable rows (reuses `<RoomTypeSelector>`)
- [ ] Headline reads `What kind of room?`
- [ ] Clicking a row selects it (teal border, teal bg tint, check icon on the right)
- [ ] Clicking a different row switches the selection (single-select behaviour)
- [ ] Continue disabled until a room is picked
- [ ] Back returns to upload; the uploaded photo is preserved

**Style screen:**
- [ ] Step 9 shows all 12 styles with thumbnails matching the PICKED ROOM (e.g. pick Bedroom → thumbnails are bedroom variants)
- [ ] Headline reads `Pick a style.`
- [ ] Subtitle reads `You can try others after — 1 credit each, you have 15.`
- [ ] Clicking a style row selects it
- [ ] Default `activeStyle` is still `'Modern'` (existing behaviour) — user can change or accept
- [ ] "Stage this room (1 credit)" button triggers the stage flow
- [ ] Button shows `Staging…` with `aria-busy` while running
- [ ] Error messages still appear above the footer on failure
- [ ] Back returns to rooms; all picks preserved

**Downstream improvements (verify via a real stage):**
- [ ] `/api/stage/batch` receives `roomTypes: ["Bedroom"]` (or whichever) in the request body
- [ ] Lambda's analysis runs with room-calibrated prompts (functional furniture checklist applied)
- [ ] Generating screen's rotating notes interpolate the actual room (e.g. "through your bedroom" not "through your room")
- [ ] Result screen's `EditorialNameplate` eyebrow shows `STAGED · BEDROOM` (or whichever)
- [ ] Result screen's expander reads "N things we watched for in your bedroom" (not "your room")

**Progress bar:**
- [ ] 11-step sequence reflects correctly in the `STEP_ORDER` constant
- [ ] Welcome shows ~9% (was ~11%); upload shows ~64% (was ~78%)
- [ ] Rooms shows ~73%, style shows ~82%
- [ ] Generating + result still hide the bar

**Welcome copy:**
- [ ] Subtitle reads `A few taps and you'll see it staged.` (apostrophe JSX-escaped as `&apos;`)

**Regression:**
- [ ] `npm run type-check && npm run build` clean
- [ ] Main `/stage` wizard flow unaffected
- [ ] Middle onboarding screens (role/volume/bombshell/bridge/how-it-works) unaffected

---

## 10. Implementation phases (PR breakdown)

**Single PR.** All changes are tightly coupled — the step enum, the three new screens, the flow wiring, the progress bar's STEP_ORDER, the downstream plumbing (generating + result steps' room-aware props) must all land together for the build to pass.

Task order:
1. Add `'rooms'` and `'style'` to the `OnboardingStep` type.
2. Create `UploadScreen`, `RoomsScreen`, `StyleScreen` under `src/components/onboarding/`.
3. Wire `OnboardingFlow` — state additions, step-branch rewrites, imports, `startFirstStage` roomTypes plumbing, generating + result's room-aware props.
4. Update `OnboardingProgressBar`'s `STEP_ORDER`.
5. Update `WelcomeScreen` subtitle copy.
6. Manual acceptance + push + PR.

~1 hour of work end-to-end (including Amplify deploy).

---

## 11. Explicitly out of scope

- **Changes to main `/stage` wizard.** Its rooms/style pattern is the reference we're matching; no work there.
- **Multi-select in onboarding Rooms or Style.** Single-select is the intentional design call.
- **Skip / "I've done this before" path.** Onboarding is gated by `onboardingCompletedAt` and only appears once per account. No skip needed.
- **`RoomType`-specific copy on the Rooms screen** (e.g. "Living Rooms are the most staged — good start."). Flat subtitle reads fine.
- **Room inference from the uploaded photo via analyser.** Explicit user choice is simpler and more reliable.

---

## 12. Open implementation questions (for the plan)

1. **`RoomTypeSelector` click-to-deselect semantics.** The component's name implies toggle; in our single-select context we overwrite rather than toggle. Clicking the already-selected row is a harmless no-op. If testing reveals users WANT to deselect, change `onPick` to toggle to `null` when the clicked type matches. Spec defers to single-set-only; revisit if complaints.

2. **`HeroUpload` inside onboarding's Upload screen.** Component exists at `src/components/wizard/hero-upload.tsx`. Reuse as-is; no changes. Verify during implementation that the component renders correctly within the onboarding's overflow-scroll container.

3. **`StyleRow`'s `size="compact"` prop.** Existing onboarding passes this; new Style screen keeps it. Verify visual rhythm matches the Rooms screen's `<RoomTypeSelector>` row heights — if they diverge noticeably, drop `size="compact"` or align with a small tweak. Non-blocking.

4. **`ThumbnailRoom` type export.** Already exported from `src/components/staging/style-row.tsx` per the main `/stage` wizard's usage. Verify during implementation.

---

*End of spec.*
