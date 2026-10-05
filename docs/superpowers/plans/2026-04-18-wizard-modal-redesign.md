# Wizard Modal Redesign + Flag-for-Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full wizard redesign (5 steps in one consistent card shell with clickable progress), extract reference upload into its own step, rebuild the result screen as a cohesive card with a flag-for-review link, and add an `/admin/reviews` page with accept/decline + auto credit refund.

**Architecture:**
- Single reusable `WizardCard` shell wraps every step (pinned header, internal-scroll body, pinned footer). `WizardProgress` turns every segment into a keyboard-reachable button that jumps to that step.
- Flag-for-review is a new entity on the existing single-table DynamoDB schema, gated by 5 eligibility rules, with a bottom-sheet dialog on mobile and centred modal on desktop. A new `/admin/reviews` page (email-gated) handles triage + auto refund.
- Emails use AWS SES in the Sydney region. The Notes step's final Continue button says "Stage this room · 1 credit"; the old standalone Review step is eliminated.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Tailwind · framer-motion · @aws-sdk/lib-dynamodb · @aws-sdk/client-ses · Cognito session cookies · vitest (tests for logic only; UI verified via dev server).

**Spec:** `docs/superpowers/specs/2026-04-18-wizard-modal-redesign-design.md`

---

## Ground rules

1. **No contractions in JSX strings.** Amplify's React build fails on `it's`, `doesn't`, etc. (`react/no-unescaped-entities`). Use `it is`, `does not`, or HTML entities. Per Tara's memory.
2. **Run `npm run build` before committing any UI change** — `tsc --noEmit` passes more than Amplify does.
3. **No changes to unrelated files.** This plan touches the wizard, one upload component split, flag-review data/API, admin page. Nothing else.
4. **Frequent commits.** One per task minimum.
5. **Use design skills** (`soft-skill`, `taste-skill`) for styling decisions — reuse existing `brand-navy`, `brand-teal`, `surface-*`, `ink-*` tokens.
6. **Verification discipline.** Never claim a UI task is "done" without running `npm run dev` and walking the flow.

## File structure (decomposition)

Before diving into tasks, here is the shape. Each file has one responsibility.

### New files

| File | Responsibility |
|---|---|
| `src/components/wizard/wizard-card.tsx` | The reusable card shell — header/body/footer slots, pinned chrome, internal scroll with fades |
| `src/components/wizard/wizard-progress.tsx` | Clickable segmented progress bar with ARIA |
| `src/components/wizard/hero-upload.tsx` | Step 1 content (extracted from `MultiImageUpload`) |
| `src/components/wizard/reference-upload.tsx` | Step 2 content with "When this helps" explainer |
| `src/components/wizard/notes-step.tsx` | Step 5 content — textarea + summary chips |
| `src/components/staging/flag-review-dialog.tsx` | Desktop modal / mobile bottom sheet for flag submission |
| `src/components/staging/flagged-pill.tsx` | Replacement pill shown after flag submitted |
| `src/lib/db/flag-reviews.ts` | DynamoDB CRUD for `FlagReview` entity |
| `src/lib/aws/ses.ts` | Thin SES client wrapper |
| `src/lib/email/flag-emails.ts` | Email templates (admin-new, user-accepted, user-declined) |
| `src/app/api/reviews/route.ts` | `POST /api/reviews` + `GET /api/reviews/eligibility` |
| `src/app/api/admin/reviews/route.ts` | `GET /api/admin/reviews?status=pending` |
| `src/app/api/admin/reviews/[id]/accept/route.ts` | Accept → refund → email |
| `src/app/api/admin/reviews/[id]/decline/route.ts` | Decline → email |
| `src/app/admin/layout.tsx` | Admin email gate (redirect to /dashboard if not admin) |
| `src/app/admin/reviews/page.tsx` | Admin queue page (desktop + mobile) |
| `src/components/admin/review-row.tsx` | Row component used on the admin page |
| `src/components/admin/review-lightbox.tsx` | Full-size before/staged inspection overlay |
| `tests/lib/db/flag-reviews.test.ts` | Eligibility logic unit tests |
| `tests/api/reviews.test.ts` | API endpoint tests (auth, eligibility, happy path) |

### Modified files

| File | Change |
|---|---|
| `src/app/stage/page.tsx` | Swap the full-page sections for `WizardCard`-wrapped steps, add `reference` step, remove `review` step, add clickable progress segments, new result layout with flag link, update `WizardStep` type |
| `src/components/upload/multi-image-upload.tsx` | **Delete** after extraction (splitted into `hero-upload.tsx` + `reference-upload.tsx`) |
| `src/types/index.ts` | Add `FlagReview` interface + key patterns |
| `src/lib/db/users.ts` | No change — `addCredits` already exists |

---

## Task breakdown

Tasks are sequenced so each leaves the project in a working state. Tasks 1–7 are the wizard redesign (ships independently). Tasks 8–12 add flag-for-review user-side. Tasks 13–15 add the admin side. Task 16 is mobile/a11y polish. Task 17 is ship.

---

### Task 1: Build `WizardCard` shell

**Files:**
- Create: `src/components/wizard/wizard-card.tsx`

- [ ] **Step 1: Create the component**

Write:

```tsx
// src/components/wizard/wizard-card.tsx
'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface WizardCardProps {
  tag?: string;                 // e.g. "Step 2 · Optional"
  tagTone?: 'navy' | 'teal';    // teal for optional steps / done
  question: string;
  subtitle?: string;
  children: ReactNode;          // body content (centered vertically, internal scroll)
  footerLeft?: ReactNode;       // usually <BackButton />
  footerRight?: ReactNode;      // usually <ContinueButton /> or action row
  className?: string;
}

export function WizardCard({
  tag,
  tagTone = 'teal',
  question,
  subtitle,
  children,
  footerLeft,
  footerRight,
  className,
}: WizardCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'mx-auto w-full sm:max-w-[640px] sm:h-[720px]',
        'flex flex-col bg-white sm:rounded-2xl sm:border sm:border-surface-border sm:shadow-medium overflow-hidden',
        'min-h-[100dvh] sm:min-h-0',
        className,
      )}
    >
      <header className="flex-shrink-0 px-6 pt-6 pb-4 text-center border-b border-surface-border/60 bg-white">
        {tag && (
          <span
            className={cn(
              'inline-block text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full mb-2',
              tagTone === 'navy'
                ? 'bg-brand-navy text-white'
                : 'bg-brand-teal/10 text-brand-teal',
            )}
          >
            {tag}
          </span>
        )}
        <h1 className="font-heading text-2xl sm:text-3xl text-brand-navy tracking-tight leading-tight">
          {question}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-ink-secondary">{subtitle}</p>
        )}
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center px-6 py-5">
            <div className="w-full">{children}</div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent" />
      </div>

      {(footerLeft || footerRight) && (
        <footer
          className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-surface-border/60 bg-white"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-2">{footerLeft}</div>
          <div className="flex items-center gap-2">{footerRight}</div>
        </footer>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npm run type-check`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/wizard/wizard-card.tsx
git commit -m "feat(wizard): WizardCard shell — fixed dimensions, pinned chrome, internal scroll"
```

---

### Task 2: Build `WizardProgress` clickable bar

**Files:**
- Create: `src/components/wizard/wizard-progress.tsx`

- [ ] **Step 1: Create the component**

Write:

```tsx
// src/components/wizard/wizard-progress.tsx
'use client';

import { cn } from '@/lib/utils/cn';

export interface WizardProgressStep {
  id: string;
  label: string;       // e.g. "Upload", "Reference"
  reached: boolean;    // user has been here (can jump back)
}

interface WizardProgressProps {
  steps: WizardProgressStep[];
  currentIndex: number;
  onJump: (index: number) => void;
}

export function WizardProgress({ steps, currentIndex, onJump }: WizardProgressProps) {
  return (
    <nav
      aria-label="Wizard progress"
      className="mx-auto max-w-6xl px-5 sm:px-8 pb-3"
    >
      <ol className="flex items-center gap-1.5">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex && step.reached;
          const canJump = step.reached && i !== currentIndex;
          return (
            <li key={step.id} className="flex-1">
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && onJump(i)}
                aria-label={`${isDone ? 'Edit ' : ''}Step ${i + 1}: ${step.label}${isCurrent ? ' (current)' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'group relative block w-full py-3 -my-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal rounded',
                  canJump ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <div
                  className={cn(
                    'h-1 w-full rounded-full transition-all duration-300',
                    isDone
                      ? 'bg-brand-teal group-hover:bg-brand-teal/80'
                      : isCurrent
                      ? 'bg-brand-navy'
                      : 'bg-surface-border',
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/wizard/wizard-progress.tsx
git commit -m "feat(wizard): clickable segmented WizardProgress bar"
```

---

### Task 3: Extract `HeroUpload` and `ReferenceUpload` from `MultiImageUpload`

**Files:**
- Create: `src/components/wizard/hero-upload.tsx`
- Create: `src/components/wizard/reference-upload.tsx`
- Reference (do not modify yet): `src/components/upload/multi-image-upload.tsx`

- [ ] **Step 1: Create `HeroUpload`**

Write:

```tsx
// src/components/wizard/hero-upload.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { compressImage } from '@/lib/utils/compress-image';
import type { RoomPhoto } from '@/components/upload/multi-image-upload';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

async function fileToRoomPhoto(file: File): Promise<RoomPhoto> {
  const isImage = file.type.startsWith('image/') || file.type === '';
  if (!isImage) throw new Error('Please select an image file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Image must be under 20MB.');
  const compressed = await compressImage(file);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    preview: compressed.preview,
    base64: compressed.base64,
    mimeType: compressed.mimeType,
  };
}

interface HeroUploadProps {
  heroPhoto: RoomPhoto | null;
  onChange: (photo: RoomPhoto | null) => void;
}

export function HeroUpload({ heroPhoto, onChange }: HeroUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setIsProcessing(true);
    try {
      const photo = await fileToRoomPhoto(file);
      onChange(photo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read that photo.';
      setError(msg.includes('Failed to load image') ? 'This photo format is not supported. Try JPG or PNG.' : msg);
    } finally {
      setIsProcessing(false);
    }
  }, [onChange]);

  if (heroPhoto) {
    return (
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-surface-border shadow-soft">
        <img src={heroPhoto.preview} alt="Room to stage" className="size-full object-cover" />
        <div className="absolute top-3 left-3 bg-brand-navy/80 backdrop-blur-sm text-[10px] font-bold text-white px-2.5 py-1 rounded-lg uppercase tracking-wider">
          Photo to stage
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 to-transparent">
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-white/80 hover:text-white bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            Change photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onClick={() => !isProcessing && inputRef.current?.click()}
        className={cn(
          'relative aspect-[4/3] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-brand-teal bg-brand-teal/5 scale-[1.01]'
            : 'border-surface-border bg-surface-secondary hover:border-ink-muted hover:bg-surface-tertiary',
          isProcessing && 'pointer-events-none opacity-80',
        )}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {isProcessing ? (
            <>
              <div className="size-10 border-[3px] border-brand-teal border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-base font-medium text-ink">Processing photo…</p>
            </>
          ) : (
            <>
              <div className="size-14 rounded-2xl bg-surface-tertiary border border-surface-border flex items-center justify-center mb-4">
                <svg viewBox="0 0 24 24" fill="none" className="size-7 text-ink-muted">
                  <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 6V5a2 2 0 012-2h4a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="text-base font-medium text-ink">Tap to take a photo or choose one</p>
              <p className="mt-1.5 text-sm text-ink-muted">This is the photo that will be furnished</p>
            </>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
        className="hidden"
      />
      {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `ReferenceUpload`**

Write:

```tsx
// src/components/wizard/reference-upload.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { compressImage } from '@/lib/utils/compress-image';
import type { RoomPhoto } from '@/components/upload/multi-image-upload';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REFERENCES = 3;

interface ReferenceUploadProps {
  photos: RoomPhoto[];
  onChange: (photos: RoomPhoto[]) => void;
}

export function ReferenceUpload({ photos, onChange }: ReferenceUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const fileArray = Array.from(files);
    if (photos.length + fileArray.length > MAX_REFERENCES) {
      setError(`Maximum ${MAX_REFERENCES} reference photos.`);
      return;
    }
    setIsProcessing(true);
    try {
      const added: RoomPhoto[] = [];
      for (const f of fileArray) {
        try {
          if (!f.type.startsWith('image/') && f.type !== '') continue;
          if (f.size > MAX_FILE_SIZE) continue;
          const compressed = await compressImage(f);
          added.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file: f,
            preview: compressed.preview,
            base64: compressed.base64,
            mimeType: compressed.mimeType,
          });
        } catch { /* skip bad files */ }
      }
      if (added.length === 0) {
        setError('Could not read any of those photos. Try JPG or PNG.');
        return;
      }
      onChange([...photos, ...added]);
    } finally {
      setIsProcessing(false);
    }
  }, [photos, onChange]);

  return (
    <div>
      <div className="mb-5 rounded-xl border border-brand-teal/20 bg-brand-teal/5 p-4 sm:p-5">
        <p className="text-[11px] font-bold tracking-widest uppercase text-brand-teal">When this helps</p>
        <p className="mt-2 text-sm text-ink leading-relaxed">
          Extra photos of the <b>same room</b> from different angles help the AI understand the layout before placing furniture. Worth adding when:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-ink list-disc pl-5">
          <li>Your main photo <b className="text-brand-navy">cuts off a doorway</b> or connecting room (open-plan)</li>
          <li>A <b className="text-brand-navy">window, alcove, or fireplace</b> is not visible from the main angle</li>
          <li>The room has <b className="text-brand-navy">unusual lighting</b> or multiple light sources</li>
          <li>It is a <b className="text-brand-navy">long or irregular-shaped</b> room the main photo cannot capture in one frame</li>
        </ul>
        <p className="mt-3 text-xs text-ink-muted">The AI only furnishes your main photo — extra angles are just for context.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {photos.map((photo, i) => (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-24 sm:w-28 aspect-[4/3] rounded-xl overflow-hidden border border-surface-border shadow-soft group"
          >
            <img src={photo.preview} alt={`Reference ${i + 1}`} className="size-full object-cover" />
            <div className="absolute top-1 left-1 size-5 rounded-full bg-black/55 backdrop-blur-sm grid place-items-center">
              <span className="text-[9px] font-bold text-white">R{i + 1}</span>
            </div>
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              aria-label="Remove reference image"
              className="absolute top-1 right-1 size-6 rounded-full bg-black/50 backdrop-blur-sm grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1l-6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        ))}
        {photos.length < MAX_REFERENCES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            className="w-24 sm:w-28 aspect-[4/3] rounded-xl border-2 border-dashed border-surface-border hover:border-ink-muted bg-surface-secondary hover:bg-surface-tertiary flex flex-col items-center justify-center gap-1 transition-all duration-200"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4 text-ink-muted">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-ink-muted font-medium">Add angle</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />

      {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/wizard/hero-upload.tsx src/components/wizard/reference-upload.tsx
git commit -m "feat(wizard): extract HeroUpload + ReferenceUpload with explainer block"
```

---

### Task 4: Rewire `stage/page.tsx` state machine

**Files:**
- Modify: `src/app/stage/page.tsx`

This task reshapes state and the step order. We intentionally keep the body identical for now — all steps still render the old inline content. The next tasks replace each step body with `WizardCard` + extracted components.

- [ ] **Step 1: Update `WizardStep` + `STEP_ORDER`**

In `src/app/stage/page.tsx`, replace:

```ts
type WizardStep = 'upload' | 'rooms' | 'style' | 'notes' | 'review' | 'generating' | 'result';

const STEP_ORDER: WizardStep[] = ['upload', 'rooms', 'style', 'notes', 'review'];
```

with:

```ts
type WizardStep = 'upload' | 'reference' | 'rooms' | 'style' | 'notes' | 'generating' | 'result';

const STEP_ORDER: WizardStep[] = ['upload', 'reference', 'rooms', 'style', 'notes'];

const STEP_LABELS: Record<Exclude<WizardStep, 'generating' | 'result'>, string> = {
  upload: 'Upload',
  reference: 'Reference',
  rooms: 'Room type',
  style: 'Style',
  notes: 'Notes',
};
```

- [ ] **Step 2: Track reached steps**

Add this state near the other `useState` calls:

```ts
const [reachedSteps, setReachedSteps] = useState<Set<WizardStep>>(new Set(['upload']));

const advanceTo = useCallback((next: WizardStep) => {
  setReachedSteps((prev) => new Set(prev).add(next));
  setStep(next);
}, []);
```

Replace every `setStep('rooms')` / `setStep('style')` / etc. with `advanceTo('rooms')` / `advanceTo('style')` etc. in the existing handlers (NOT including `setStep('upload')` inside `startOver`, and NOT `setStep('generating' | 'result')` inside `runStaging`).

- [ ] **Step 3: Rewrite `goBack` for new order**

Replace the existing `goBack` callback with:

```ts
const goBack = useCallback(() => {
  if (step === 'reference') setStep('upload');
  else if (step === 'rooms') setStep('reference');
  else if (step === 'style') setStep(preloadedFromGallery ? 'style' : 'rooms');
  else if (step === 'notes') setStep('style');
  else if (step === 'result') setStep('notes');
}, [step, preloadedFromGallery]);
```

- [ ] **Step 4: Rewrite `runStaging` error path**

Find the `catch` block inside `runStaging` and replace:

```ts
setStep(stagedImage ? 'result' : 'review');
```

with:

```ts
setStep(stagedImage ? 'result' : 'notes');
```

- [ ] **Step 5: Update gallery preload to jump to `style`**

The existing query-param preload logic already sets `setStep('style')`. Add `setReachedSteps(new Set(['upload', 'reference', 'rooms', 'style']))` right before that line, so progress segments reflect the preload.

- [ ] **Step 6: Remove the entire `review` JSX block**

Delete the `{step === 'review' && (...)}` motion.section. The rest of the old sections stay until Tasks 5-7 replace them.

- [ ] **Step 7: Verify TypeScript + dev**

Run: `npm run type-check`
Expected: PASS.

Run: `npm run dev` — walk the flow. Expected: five visible steps (upload → reference → rooms → style → notes → generate → result), clicking Continue on Notes runs staging, result still renders old layout.

- [ ] **Step 8: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "refactor(wizard): add reference step, drop standalone review, track reached steps"
```

---

### Task 5: Swap Upload + Reference steps to use `WizardCard`

**Files:**
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 1: Import the new components**

Add near the top of `src/app/stage/page.tsx`:

```ts
import { WizardCard } from '@/components/wizard/wizard-card';
import { WizardProgress } from '@/components/wizard/wizard-progress';
import { HeroUpload } from '@/components/wizard/hero-upload';
import { ReferenceUpload } from '@/components/wizard/reference-upload';
```

Remove the existing import of `MultiImageUpload` (we will delete that file in Task 7).

- [ ] **Step 2: Replace the old `step === 'upload'` block**

Replace the entire existing `{step === 'upload' && (...)}` section with:

```tsx
{step === 'upload' && (
  <WizardCard
    key="upload"
    tag="Step 1"
    tagTone="navy"
    question="Upload your room photo"
    subtitle="JPG or PNG, up to 20MB."
    footerRight={
      <ContinueButton
        onClick={() => advanceTo('reference')}
        disabled={!heroS3Key || isUploadingHero}
        label={isUploadingHero ? 'Uploading…' : 'Continue'}
      />
    }
  >
    <HeroUpload heroPhoto={heroPhoto} onChange={handleHeroChange} />
    {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
  </WizardCard>
)}
```

- [ ] **Step 3: Add the `reference` step block** (right after `upload`)

```tsx
{step === 'reference' && (
  <WizardCard
    key="reference"
    tag="Step 2 · Optional"
    question="Want to add more angles?"
    subtitle="Optional — helpful in specific situations."
    footerLeft={<BackButton onClick={goBack} />}
    footerRight={
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => advanceTo('rooms')}
          className="text-sm font-medium text-ink-muted hover:text-brand-navy underline underline-offset-2 px-3 py-2"
        >
          Skip for now
        </button>
        <ContinueButton
          onClick={() => advanceTo('rooms')}
          label={referencePhotos.length > 0 ? `Continue with ${referencePhotos.length}` : 'Continue'}
        />
      </div>
    }
  >
    <ReferenceUpload photos={referencePhotos} onChange={handleReferencesChange} />
  </WizardCard>
)}
```

- [ ] **Step 4: Verify in dev server**

Run: `npm run dev`
Expected: Upload step renders inside the card shell. Clicking Continue advances to the new Reference step. Reference step shows the teal "When this helps" block, upload area, Skip + Continue buttons. Back returns to Upload.

- [ ] **Step 5: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): Upload + Reference steps in WizardCard shell"
```

---

### Task 6: Swap Rooms + Style + Notes + Result into `WizardCard`

**Files:**
- Modify: `src/app/stage/page.tsx`
- Create: `src/components/wizard/notes-step.tsx`

- [ ] **Step 1: Create `NotesStep` component**

Write:

```tsx
// src/components/wizard/notes-step.tsx
'use client';

import type { RoomType } from '@/components/staging/room-type-selector';
import type { StagingStyle } from '@/lib/ai/prompts';

interface NotesStepProps {
  notes: string;
  onNotesChange: (v: string) => void;
  roomTypes: RoomType[];
  style: StagingStyle;
  referenceCount: number;
  onJumpTo: (step: 'upload' | 'reference' | 'rooms' | 'style') => void;
}

export function NotesStep({
  notes, onNotesChange, roomTypes, style, referenceCount, onJumpTo,
}: NotesStepProps) {
  const summaryChips: { label: string; target: 'upload' | 'reference' | 'rooms' | 'style' }[] = [
    { label: roomTypes.join(' · ') || 'No room', target: 'rooms' },
    { label: style, target: 'style' },
  ];
  if (referenceCount > 0) {
    summaryChips.push({
      label: `${referenceCount} reference${referenceCount === 1 ? '' : 's'}`,
      target: 'reference',
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-surface-border p-5">
        <label htmlFor="notes-textarea" className="block text-sm font-medium text-brand-navy mb-2">
          Notes for the AI (optional)
        </label>
        <textarea
          id="notes-textarea"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="e.g. this is a nursery, not a master; avoid glass furniture; client has a dog"
          className="w-full text-sm text-ink bg-surface-secondary rounded-xl px-4 py-3 resize-none border border-transparent focus:border-brand-teal focus:bg-white focus:outline-none transition-colors"
        />
      </div>

      <div className="bg-brand-navy/[0.02] rounded-2xl border border-surface-border p-5">
        <p className="text-[11px] font-bold tracking-widest uppercase text-ink-muted mb-3">Your choices</p>
        <div className="flex flex-wrap gap-2">
          {summaryChips.map((chip) => (
            <button
              key={chip.target}
              type="button"
              onClick={() => onJumpTo(chip.target)}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-navy bg-white border border-surface-border rounded-full hover:border-brand-teal transition-colors"
            >
              {chip.label}
              <span className="text-brand-teal opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the `rooms` step block**

```tsx
{step === 'rooms' && (
  <WizardCard
    key="rooms"
    tag="Step 3"
    tagTone="navy"
    question="What type of room is this?"
    subtitle="Tap one. Tap more if open-plan."
    footerLeft={<BackButton onClick={goBack} />}
    footerRight={
      <ContinueButton
        onClick={() => advanceTo('style')}
        disabled={roomTypes.length === 0}
        label={roomTypes.length >= 2 ? `Continue with ${roomTypes.length} selected` : 'Continue'}
      />
    }
  >
    <RoomTypeSelector selected={roomTypes} onToggle={handleRoomTypeToggle} className="justify-center" />
  </WizardCard>
)}
```

- [ ] **Step 3: Replace the `style` step block**

```tsx
{step === 'style' && (
  <WizardCard
    key="style"
    tag="Step 4"
    tagTone="navy"
    question="Pick a style"
    subtitle="Scroll for more. Tap to select."
    footerLeft={!preloadedFromGallery ? <BackButton onClick={goBack} /> : undefined}
    footerRight={<ContinueButton onClick={() => advanceTo('notes')} label="Continue" />}
  >
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {STAGING_STYLES.map((s) => (
        <StyleTile
          key={s}
          style={s}
          selected={style === s}
          onPick={() => handleStylePick(s)}
          palette={STYLE_PALETTES[s]}
          roomCategory={roomCategoryFor(roomTypes)}
        />
      ))}
    </div>
  </WizardCard>
)}
```

- [ ] **Step 4: Replace the `notes` step block**

Import `NotesStep` at the top:

```ts
import { NotesStep } from '@/components/wizard/notes-step';
```

Then:

```tsx
{step === 'notes' && (
  <WizardCard
    key="notes"
    tag="Step 5 · Optional"
    question="Anything else we should know?"
    subtitle="Helps when the photo does not say everything."
    footerLeft={<BackButton onClick={goBack} />}
    footerRight={
      <button
        type="button"
        onClick={() => runStaging()}
        disabled={isGenerating || roomTypes.length === 0}
        className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-medium text-base px-6 py-3 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-soft"
      >
        Stage this room
        <span className="text-xs font-normal text-white/60 ml-1">· 1 credit</span>
      </button>
    }
  >
    <NotesStep
      notes={notes}
      onNotesChange={setNotes}
      roomTypes={roomTypes}
      style={style}
      referenceCount={referencePhotos.length}
      onJumpTo={(t) => setStep(t)}
    />
  </WizardCard>
)}
```

- [ ] **Step 5: Replace `generating` + `result` step blocks**

For `generating`, just wrap in a `WizardCard`:

```tsx
{step === 'generating' && (
  <WizardCard
    key="generating"
    tag="Staging"
    tagTone="teal"
    question="Creating your staged room"
    subtitle="This takes 20–40 seconds. Keep this tab open."
  >
    <StagingLoader />
  </WizardCard>
)}
```

For `result`, temporarily keep the existing JSX but wrap it in a WizardCard (we refine in Task 7):

```tsx
{step === 'result' && stagedImage && (
  <WizardCard
    key="result"
    tag="✓ Done"
    tagTone="teal"
    question="Your staged room is ready"
    subtitle={`${style} · ${roomTypes.join(' · ')}`}
    footerLeft={
      <BackButton onClick={() => setStep('notes')} />
    }
    footerRight={
      lastStagedS3Key ? (
        <a
          href={`/api/download?key=${encodeURIComponent(lastStagedS3Key)}&style=${encodeURIComponent(style)}${roomTypes.length > 0 ? `&rooms=${encodeURIComponent(roomTypes.join(','))}` : ''}`}
          className="inline-flex items-center gap-2 bg-brand-navy text-white font-medium text-sm px-5 py-3 rounded-xl hover:bg-brand-navy-light active:scale-[0.98] transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download
        </a>
      ) : undefined
    }
  >
    <div className="space-y-5">
      {(heroSignedUrl || heroPhoto?.preview) ? (
        <BeforeAfterSlider
          beforeSrc={heroSignedUrl || heroPhoto?.preview || ''}
          afterSrc={stagedImage}
          beforeLabel="Empty"
          afterLabel="Staged"
        />
      ) : (
        <img src={stagedImage} alt="Staged room" className="w-full h-auto rounded-xl" />
      )}
      {/* Task 7 adds: design score, action row, flag link, try-another style expander */}
    </div>
  </WizardCard>
)}
```

- [ ] **Step 6: Wire `WizardProgress` into the header**

Replace the existing progress bar JSX inside the header with:

```tsx
{progressActive && (
  <WizardProgress
    steps={STEP_ORDER.map((id) => ({
      id,
      label: STEP_LABELS[id as keyof typeof STEP_LABELS],
      reached: reachedSteps.has(id),
    }))}
    currentIndex={visibleStepIndex}
    onJump={(i) => setStep(STEP_ORDER[i])}
  />
)}
```

- [ ] **Step 7: Verify in dev server**

Run: `npm run dev`
Expected: Every step renders inside the same-sized card. Progress segments are clickable once a step has been reached. Style step grid scrolls inside the card when >6 tiles exceed the viewport. Notes step shows the "Your choices" chip row. Clicking a chip jumps to that step with state intact.

- [ ] **Step 8: Run full build to catch JSX issues**

Run: `npm run build`
Expected: PASS. If it fails on `react/no-unescaped-entities`, find the offending apostrophe and replace with `does not`, `it is`, or `&apos;`.

- [ ] **Step 9: Commit**

```bash
git add src/app/stage/page.tsx src/components/wizard/notes-step.tsx
git commit -m "feat(wizard): rooms/style/notes/result in WizardCard + WizardProgress clickable"
```

---

### Task 7: Redesign Result card (action row + inline style picker, flag link placeholder)

**Files:**
- Modify: `src/app/stage/page.tsx` (the `step === 'result'` block)

- [ ] **Step 1: Replace the result block body with the final layout**

Replace the `<WizardCard key="result" ...>` body from Task 6 with:

```tsx
{step === 'result' && stagedImage && (
  <WizardCard
    key="result"
    tag="✓ Done"
    tagTone="teal"
    question="Your staged room is ready"
    subtitle={`${style} · ${roomTypes.join(' · ')} · 1 credit used`}
  >
    <div className="space-y-5">
      {/* Before/After */}
      <div className="rounded-xl overflow-hidden border border-surface-border">
        {(heroSignedUrl || heroPhoto?.preview) ? (
          <BeforeAfterSlider
            beforeSrc={heroSignedUrl || heroPhoto?.preview || ''}
            afterSrc={stagedImage}
            beforeLabel="Empty"
            afterLabel="Staged"
          />
        ) : (
          <img src={stagedImage} alt="Staged room" className="w-full h-auto" />
        )}
      </div>

      {/* Primary action row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {lastStagedS3Key && (
          <a
            href={`/api/download?key=${encodeURIComponent(lastStagedS3Key)}&style=${encodeURIComponent(style)}${roomTypes.length > 0 ? `&rooms=${encodeURIComponent(roomTypes.join(','))}` : ''}`}
            className="inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-medium text-sm px-5 py-3 rounded-xl hover:bg-brand-navy-light transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Download
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowTryAnother((v) => !v)}
          className="inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm px-5 py-3 rounded-xl hover:bg-surface-secondary transition-colors"
        >
          Try another style
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm px-5 py-3 rounded-xl hover:bg-surface-secondary transition-colors"
        >
          Go to gallery
        </Link>
      </div>

      {/* Inline style picker (expandable) */}
      {showTryAnother && (
        <div className="rounded-xl border border-surface-border bg-surface-secondary p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STAGING_STYLES.map((s) => (
              <StyleTile
                key={s}
                style={s}
                selected={style === s}
                onPick={() => runStaging(s)}
                palette={STYLE_PALETTES[s]}
                compact
                roomCategory={roomCategoryFor(roomTypes)}
              />
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-ink-muted">Each re-stage uses 1 credit.</p>
        </div>
      )}

      {/* Tertiary row — flag link (placeholder) + start over */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-dashed border-surface-border">
        <div id="flag-slot" />{/* Task 12 mounts the flag link here */}
        <button
          type="button"
          onClick={startOver}
          className="text-xs font-medium text-ink-muted hover:text-brand-navy underline underline-offset-2"
        >
          Start new upload
        </button>
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
    </div>
  </WizardCard>
)}
```

Add the `showTryAnother` state near the top of the component:

```ts
const [showTryAnother, setShowTryAnother] = useState(false);
```

And reset it inside `startOver` (add `setShowTryAnother(false);`).

- [ ] **Step 2: Remove the now-unused result-sprawl JSX**

The old inline "Try another style" section outside the card is gone, replaced by the expander above. Double-check nothing references it.

- [ ] **Step 3: Verify in dev server**

Run: `npm run dev` → stage a room → land on the result screen.
Expected: Card shows before/after, 3 action buttons in a row, clicking "Try another style" toggles the grid. No scattered layout below.

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): result card redesign — action row + inline try-another expander"
```

---

### Task 8: Delete `MultiImageUpload` (cleanup)

**Files:**
- Delete: `src/components/upload/multi-image-upload.tsx`
- Modify: `src/components/wizard/hero-upload.tsx` + `src/components/wizard/reference-upload.tsx` (replace the import of `RoomPhoto`)

The `RoomPhoto` type was exported from the deleted file. We move it to a shared place.

- [ ] **Step 1: Move the `RoomPhoto` type**

Create `src/components/wizard/types.ts`:

```ts
export interface RoomPhoto {
  id: string;
  file: File;
  preview: string;
  base64: string;
  mimeType: string;
}
```

- [ ] **Step 2: Update imports**

In `src/components/wizard/hero-upload.tsx`, `src/components/wizard/reference-upload.tsx`, and `src/app/stage/page.tsx`, replace:

```ts
import type { RoomPhoto } from '@/components/upload/multi-image-upload';
```

with:

```ts
import type { RoomPhoto } from '@/components/wizard/types';
```

(Also the non-type import in `stage/page.tsx`: `import { MultiImageUpload, type RoomPhoto } ...` → just the type line above, no `MultiImageUpload`.)

- [ ] **Step 3: Delete the old file**

```bash
rm "src/components/upload/multi-image-upload.tsx"
rmdir "src/components/upload" 2>/dev/null || true
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(wizard): drop MultiImageUpload; RoomPhoto moved to wizard/types"
```

---

### Task 9: Add `FlagReview` entity + DynamoDB helpers

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/db/flag-reviews.ts`
- Create: `tests/lib/db/flag-reviews.test.ts`

- [ ] **Step 1: Add `FlagReview` interface + key-pattern comment**

Append to `src/types/index.ts`:

```ts
// ---------- Flag Reviews ----------

export interface FlagReview extends BaseEntity {
  id: string;
  userId: string;
  userEmail: string;
  sessionId: string;
  originalS3Key: string;
  stagedS3Key: string;
  style: string;
  roomTypes: string[];
  userNote?: string;
  status: 'pending' | 'accepted' | 'declined';
  adminNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  creditRefunded: boolean;
}

// Key patterns:
// FlagReview:  pk=REVIEW#{id}              sk=META
//              gsi1pk=REVIEWS#{status}     gsi1sk={createdAt}
//              (second row for user-lookup)
//              pk=USER#{userId}            sk=REVIEW#{createdAt}#{id}
```

- [ ] **Step 2: Write unit tests for eligibility**

Create `tests/lib/db/flag-reviews.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/db/flag-reviews';

const base = {
  sessionId: 'sess-1',
  userId: 'u1',
  session: {
    sessionId: 'sess-1',
    referenceS3Keys: [] as string[],
    createdAt: new Date().toISOString(),
  },
  userPendingCount: 0,
  duplicateExists: false,
  secondsSinceResult: 120,
};

describe('checkEligibility', () => {
  it('allows a fresh no-reference session with no pending', () => {
    expect(checkEligibility(base).eligible).toBe(true);
  });

  it('blocks when references were used', () => {
    const r = checkEligibility({ ...base, session: { ...base.session, referenceS3Keys: ['k'] } });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('references-used');
  });

  it('blocks when user already has a pending review', () => {
    const r = checkEligibility({ ...base, userPendingCount: 1 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('pending-exists');
  });

  it('blocks when staging is older than 30 days', () => {
    const d = new Date(); d.setDate(d.getDate() - 31);
    const r = checkEligibility({ ...base, session: { ...base.session, createdAt: d.toISOString() } });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('too-old');
  });

  it('blocks duplicates for same session', () => {
    const r = checkEligibility({ ...base, duplicateExists: true });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('already-flagged');
  });

  it('blocks within 60s cool-down', () => {
    const r = checkEligibility({ ...base, secondsSinceResult: 30 });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('cool-down');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- flag-reviews`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `flag-reviews.ts`**

Write:

```ts
// src/lib/db/flag-reviews.ts
import {
  GetCommand, PutCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { FlagReview } from '@/types';

interface EligibilityInput {
  sessionId: string;
  userId: string;
  session: { sessionId: string; referenceS3Keys: string[]; createdAt: string };
  userPendingCount: number;
  duplicateExists: boolean;
  secondsSinceResult: number;
}

export type EligibilityReason =
  | 'references-used' | 'pending-exists' | 'too-old' | 'already-flagged' | 'cool-down';

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const COOL_DOWN_SECS = 60;

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  if (input.session.referenceS3Keys.length > 0) return { eligible: false, reason: 'references-used' };
  if (input.userPendingCount > 0) return { eligible: false, reason: 'pending-exists' };
  if (input.duplicateExists) return { eligible: false, reason: 'already-flagged' };
  const age = Date.now() - new Date(input.session.createdAt).getTime();
  if (age > THIRTY_DAYS_MS) return { eligible: false, reason: 'too-old' };
  if (input.secondsSinceResult < COOL_DOWN_SECS) return { eligible: false, reason: 'cool-down' };
  return { eligible: true };
}

export async function createFlagReview(data: Omit<FlagReview, 'pk' | 'sk' | 'gsi1pk' | 'gsi1sk' | 'id' | 'createdAt' | 'updatedAt' | 'status' | 'creditRefunded'>): Promise<FlagReview> {
  const id = ulid();
  const now = new Date().toISOString();
  const review: FlagReview = {
    pk: `REVIEW#${id}`,
    sk: 'META',
    gsi1pk: 'REVIEWS#pending',
    gsi1sk: now,
    id,
    ...data,
    status: 'pending',
    creditRefunded: false,
    createdAt: now,
    updatedAt: now,
  };

  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: review }));

  // secondary row for user-scoped queries
  await dynamodb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `USER#${data.userId}`,
      sk: `REVIEW#${now}#${id}`,
      reviewId: id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  }));

  return review;
}

export async function getFlagReview(id: string): Promise<FlagReview | null> {
  const r = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME, Key: { pk: `REVIEW#${id}`, sk: 'META' },
  }));
  return (r.Item as FlagReview) || null;
}

export async function listPendingReviews(): Promise<FlagReview[]> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME, IndexName: 'GSI1',
    KeyConditionExpression: 'gsi1pk = :p',
    ExpressionAttributeValues: { ':p': 'REVIEWS#pending' },
    ScanIndexForward: false, // newest first
  }));
  return (r.Items || []) as FlagReview[];
}

export async function countUserPending(userId: string): Promise<number> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'REVIEW#' },
    FilterExpression: '#s = :s',
    ExpressionAttributeNames: { '#s': 'status' },
    Select: 'COUNT',
  }));
  return r.Count ?? 0;
}

export async function userAlreadyFlaggedSession(userId: string, sessionId: string): Promise<boolean> {
  const r = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'REVIEW#' },
  }));
  const rows = r.Items || [];
  if (rows.length === 0) return false;
  // fetch the main rows to read sessionId (we did not denormalize it into the user row — fetch)
  const reviews = await Promise.all(rows.map((row) => getFlagReview(row.reviewId as string)));
  return reviews.some((rev) => rev?.sessionId === sessionId);
}

export async function updateReviewStatus(
  id: string,
  patch: { status: 'accepted' | 'declined'; adminNote?: string; resolvedBy: string; creditRefunded: boolean },
): Promise<FlagReview> {
  const now = new Date().toISOString();
  const r = await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `REVIEW#${id}`, sk: 'META' },
    UpdateExpression: 'SET #s = :s, adminNote = :a, resolvedBy = :rb, resolvedAt = :rt, creditRefunded = :cr, updatedAt = :u, gsi1pk = :g',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s': patch.status,
      ':a': patch.adminNote ?? null,
      ':rb': patch.resolvedBy,
      ':rt': now,
      ':cr': patch.creditRefunded,
      ':u': now,
      ':g': `REVIEWS#${patch.status}`,
    },
    ReturnValues: 'ALL_NEW',
  }));
  return r.Attributes as FlagReview;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- flag-reviews`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/db/flag-reviews.ts tests/lib/db/flag-reviews.test.ts
git commit -m "feat(reviews): FlagReview entity + eligibility logic + DDB CRUD"
```

---

### Task 10: SES client + flag-email templates

**Files:**
- Create: `src/lib/aws/ses.ts`
- Create: `src/lib/email/flag-emails.ts`
- Modify: `package.json` — add `@aws-sdk/client-ses` dependency

- [ ] **Step 1: Install the SES SDK**

Run: `npm install @aws-sdk/client-ses@^3.995.0`

- [ ] **Step 2: Create the SES client**

Write:

```ts
// src/lib/aws/ses.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const client = new SESClient({
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'ap-southeast-2',
  ...(process.env.APP_AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  }),
});

const FROM = process.env.SES_FROM_ADDRESS || 'no-reply@stageright.com.au';

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  await client.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject, Charset: 'UTF-8' },
      Body: { Text: { Data: params.text, Charset: 'UTF-8' } },
    },
  }));
}
```

- [ ] **Step 3: Create email templates**

Write:

```ts
// src/lib/email/flag-emails.ts
import { sendEmail } from '@/lib/aws/ses';
import type { FlagReview } from '@/types';

const ADMIN_NOTIFY = 'taraferguson.business@gmail.com';
const REVIEW_URL = 'https://master.d88xgpqlfkk1w.amplifyapp.com/admin/reviews';

export async function sendAdminNewFlagEmail(review: FlagReview): Promise<void> {
  await sendEmail({
    to: ADMIN_NOTIFY,
    subject: `New flagged staging — ${review.userEmail}`,
    text: [
      'A user has flagged a staging for review.',
      '',
      `User: ${review.userEmail}`,
      `Room: ${review.roomTypes.join(', ')}`,
      `Style: ${review.style}`,
      `Note: ${review.userNote || '(none)'}`,
      '',
      `Review it: ${REVIEW_URL}`,
    ].join('\n'),
  });
}

export async function sendUserAcceptedEmail(userEmail: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: 'We have added a credit back to your account',
    text: [
      'Thanks for flagging that staging.',
      '',
      'We have reviewed it and agreed — the structure did not look right. We have added 1 credit back to your account so you can try again.',
      '',
      '— The StageRight team',
    ].join('\n'),
  });
}

export async function sendUserDeclinedEmail(userEmail: string, adminNote?: string): Promise<void> {
  await sendEmail({
    to: userEmail,
    subject: 'Update on your flagged staging',
    text: [
      'Thanks for flagging that staging.',
      '',
      'We have reviewed the original and the output and, on balance, we do not think the structure changed significantly.',
      adminNote ? `\n${adminNote}\n` : '',
      'If you are still not happy, reach out and we will talk it through.',
      '',
      '— The StageRight team',
    ].join('\n'),
  });
}
```

- [ ] **Step 4: Verify TypeScript**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/aws/ses.ts src/lib/email/flag-emails.ts
git commit -m "feat(reviews): SES client + transactional email templates"
```

---

### Task 11: `POST /api/reviews` + `GET /api/reviews/eligibility`

**Files:**
- Create: `src/app/api/reviews/route.ts`
- Create: `tests/api/reviews.test.ts`

- [ ] **Step 1: Write the endpoint tests**

Create `tests/api/reviews.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mocks
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/lib/db/staging-sessions', () => ({
  getStagingSession: vi.fn(),
}));
vi.mock('@/lib/db/flag-reviews', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/flag-reviews')>('@/lib/db/flag-reviews');
  return {
    ...actual,
    createFlagReview: vi.fn(async (d) => ({ id: 'rev-1', ...d, status: 'pending' })),
    countUserPending: vi.fn(async () => 0),
    userAlreadyFlaggedSession: vi.fn(async () => false),
  };
});
vi.mock('@/lib/email/flag-emails', () => ({
  sendAdminNewFlagEmail: vi.fn(async () => {}),
}));

import { POST } from '@/app/api/reviews/route';
import { getSession } from '@/lib/auth/session';
import { getStagingSession } from '@/lib/db/staging-sessions';

describe('POST /api/reviews', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'u@test.com' } as never);
  });

  it('rejects unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null as never);
    const res = await POST(new NextRequest('http://x/api/reviews', { method: 'POST', body: JSON.stringify({ sessionId: 's1' }) }));
    expect(res.status).toBe(401);
  });

  it('rejects when session used references', async () => {
    vi.mocked(getStagingSession).mockResolvedValueOnce({
      sessionId: 's1', referenceS3Keys: ['k1'], createdAt: new Date().toISOString(),
    } as never);
    const res = await POST(new NextRequest('http://x/api/reviews', {
      method: 'POST', body: JSON.stringify({ sessionId: 's1', secondsSinceResult: 120 }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('references-used');
  });

  it('creates a review on happy path', async () => {
    vi.mocked(getStagingSession).mockResolvedValueOnce({
      sessionId: 's1', referenceS3Keys: [], createdAt: new Date().toISOString(),
    } as never);
    const res = await POST(new NextRequest('http://x/api/reviews', {
      method: 'POST', body: JSON.stringify({ sessionId: 's1', userNote: 'walls moved', secondsSinceResult: 120 }),
    }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests — expect failure**

Run: `npm run test -- reviews`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Write:

```ts
// src/app/api/reviews/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStagingSession } from '@/lib/db/staging-sessions';
import {
  checkEligibility,
  countUserPending,
  createFlagReview,
  userAlreadyFlaggedSession,
} from '@/lib/db/flag-reviews';
import { sendAdminNewFlagEmail } from '@/lib/email/flag-emails';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { sessionId, userNote, secondsSinceResult = 0 } = body as {
    sessionId?: string; userNote?: string; secondsSinceResult?: number;
  };
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const stagingSession = await getStagingSession(sessionId);
  if (!stagingSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const [pending, dup] = await Promise.all([
    countUserPending(session.userId),
    userAlreadyFlaggedSession(session.userId, sessionId),
  ]);

  const elig = checkEligibility({
    sessionId,
    userId: session.userId,
    session: stagingSession,
    userPendingCount: pending,
    duplicateExists: dup,
    secondsSinceResult,
  });
  if (!elig.eligible) return NextResponse.json({ error: 'Not eligible', reason: elig.reason }, { status: 400 });

  const review = await createFlagReview({
    userId: session.userId,
    userEmail: session.email,
    sessionId,
    originalS3Key: stagingSession.heroS3Key,
    stagedS3Key: stagingSession.turns.find((t) => t.role === 'model' && t.imageS3Key)?.imageS3Key || '',
    style: stagingSession.style,
    roomTypes: stagingSession.roomTypes,
    userNote: userNote?.slice(0, 500),
  });

  await sendAdminNewFlagEmail(review).catch(() => { /* non-fatal */ });

  return NextResponse.json({ reviewId: review.id, status: review.status });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const secondsSinceResult = Number(req.nextUrl.searchParams.get('secondsSinceResult') || 0);
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const stagingSession = await getStagingSession(sessionId);
  if (!stagingSession) return NextResponse.json({ eligible: false, reason: 'not-found' });

  const [pending, dup] = await Promise.all([
    countUserPending(session.userId),
    userAlreadyFlaggedSession(session.userId, sessionId),
  ]);
  const elig = checkEligibility({
    sessionId, userId: session.userId, session: stagingSession,
    userPendingCount: pending, duplicateExists: dup, secondsSinceResult,
  });
  return NextResponse.json(elig);
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm run test -- reviews`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reviews tests/api/reviews.test.ts
git commit -m "feat(reviews): POST /api/reviews + GET eligibility"
```

---

### Task 12: `FlagReviewDialog` + `FlaggedPill` + wire into result card

**Files:**
- Create: `src/components/staging/flag-review-dialog.tsx`
- Create: `src/components/staging/flagged-pill.tsx`
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 1: Create `FlagReviewDialog`**

Write:

```tsx
// src/components/staging/flag-review-dialog.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface FlagReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  sessionId: string;
  secondsSinceResult: number;
}

export function FlagReviewDialog({
  open, onClose, onSubmitted, sessionId, secondsSinceResult,
}: FlagReviewDialogProps) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = useCallback(async () => {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userNote: note, secondsSinceResult }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not submit review');
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, note, secondsSinceResult, onSubmitted]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-navy/50 backdrop-blur-sm z-50"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Flag this staging for review"
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: '0%' }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed z-50 left-1/2 -translate-x-1/2',
              'bottom-0 w-full sm:w-[440px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2',
              'bg-white rounded-t-3xl sm:rounded-2xl shadow-hard p-5 sm:p-6',
            )}
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-surface-border mb-4" aria-hidden />
            <div className="flex justify-between items-start gap-3 mb-2">
              <h2 className="font-heading text-lg sm:text-xl text-brand-navy">Flag this staging for review</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-brand-navy text-xl leading-none px-1">×</button>
            </div>
            <p className="text-sm text-ink-secondary leading-relaxed mb-4">
              Our team will review the original and staged photos. If we agree the structure was changed, <b className="text-brand-navy">your credit will be refunded</b> and we will let you know by email within 24 hours.
            </p>
            <label htmlFor="flag-note" className="block text-[11px] font-bold tracking-widest uppercase text-brand-navy mb-2">
              What changed? (optional)
            </label>
            <textarea
              id="flag-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. the window has moved / the kitchen splashback is different / a new doorway appeared"
              className="w-full text-sm text-ink bg-surface-secondary rounded-xl px-3 py-2.5 resize-none border border-transparent focus:border-brand-teal focus:bg-white focus:outline-none transition-colors"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="text-sm font-medium text-ink-muted hover:text-brand-navy px-4 py-2 rounded-xl border border-surface-border bg-white">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={submitting} className="text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-light px-5 py-2 rounded-xl disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Create `FlaggedPill`**

Write:

```tsx
// src/components/staging/flagged-pill.tsx
export function FlaggedPill() {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-brand-teal bg-brand-teal/10 border border-brand-teal/20 rounded-full px-3 py-1.5">
      <span className="size-1.5 rounded-full bg-brand-teal" />
      Under review — we will email you within 24h
    </span>
  );
}
```

- [ ] **Step 3: Wire into `stage/page.tsx`**

Add near the imports:

```ts
import { FlagReviewDialog } from '@/components/staging/flag-review-dialog';
import { FlaggedPill } from '@/components/staging/flagged-pill';
```

Add state near the other result state:

```ts
const [flagDialogOpen, setFlagDialogOpen] = useState(false);
const [flagSubmitted, setFlagSubmitted] = useState(false);
const [flagEligible, setFlagEligible] = useState(false);
const [resultRenderedAt, setResultRenderedAt] = useState<number | null>(null);
```

When the result step opens, track the time and check eligibility:

```ts
useEffect(() => {
  if (step !== 'result' || !sessionId) { setFlagEligible(false); return; }
  setResultRenderedAt(Date.now());
  setFlagSubmitted(false);
  const tick = () => {
    const secondsSinceResult = resultRenderedAt ? Math.floor((Date.now() - resultRenderedAt) / 1000) : 0;
    fetch(`/api/reviews/eligibility?sessionId=${encodeURIComponent(sessionId)}&secondsSinceResult=${secondsSinceResult}`)
      .then((r) => r.ok ? r.json() : { eligible: false })
      .then((d) => setFlagEligible(!!d.eligible))
      .catch(() => setFlagEligible(false));
  };
  tick();
  const id = setInterval(tick, 15000); // re-check as cool-down elapses
  return () => clearInterval(id);
}, [step, sessionId, resultRenderedAt]);
```

Replace the `<div id="flag-slot" />` placeholder from Task 7 with:

```tsx
<div>
  {flagSubmitted ? (
    <FlaggedPill />
  ) : flagEligible ? (
    <button
      type="button"
      onClick={() => setFlagDialogOpen(true)}
      className="inline-flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-brand-navy transition-colors"
    >
      <span className="size-1.5 rounded-full bg-amber-500" />
      Walls or structure changed? Flag for review
    </button>
  ) : null}
</div>
```

At the end of the component's returned JSX (right before closing `</div>` of the root), add:

```tsx
{sessionId && (
  <FlagReviewDialog
    open={flagDialogOpen}
    onClose={() => setFlagDialogOpen(false)}
    onSubmitted={() => { setFlagDialogOpen(false); setFlagSubmitted(true); }}
    sessionId={sessionId}
    secondsSinceResult={resultRenderedAt ? Math.floor((Date.now() - resultRenderedAt) / 1000) : 0}
  />
)}
```

- [ ] **Step 4: Verify in dev**

Run: `npm run dev` → complete a staging WITHOUT references → land on result.
Expected: after 60 seconds the "Flag for review" link appears. Clicking opens the dialog. Submitting replaces the link with "Under review" pill.

Run: `npm run dev` → complete a staging WITH references → land on result.
Expected: the flag link never appears.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/staging/flag-review-dialog.tsx src/components/staging/flagged-pill.tsx src/app/stage/page.tsx
git commit -m "feat(reviews): flag-for-review dialog, pill, eligibility polling, result integration"
```

---

### Task 13: Admin layout guard + admin API endpoints

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/api/admin/reviews/route.ts`
- Create: `src/app/api/admin/reviews/[id]/accept/route.ts`
- Create: `src/app/api/admin/reviews/[id]/decline/route.ts`

- [ ] **Step 1: Admin layout guard**

Write:

```tsx
// src/app/admin/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.email.toLowerCase())) {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: List endpoint**

Write:

```ts
// src/app/api/admin/reviews/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { listPendingReviews } from '@/lib/db/flag-reviews';

export async function GET() {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const reviews = await listPendingReviews();
  return NextResponse.json({ reviews });
}
```

- [ ] **Step 3: Accept endpoint**

Write:

```ts
// src/app/api/admin/reviews/[id]/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getFlagReview, updateReviewStatus } from '@/lib/db/flag-reviews';
import { addCredits } from '@/lib/db/users';
import { sendUserAcceptedEmail } from '@/lib/email/flag-emails';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const review = await getFlagReview(params.id);
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 400 });

  await addCredits(review.userId, 1);

  const updated = await updateReviewStatus(params.id, {
    status: 'accepted',
    resolvedBy: session.email,
    creditRefunded: true,
  });

  sendUserAcceptedEmail(review.userEmail).catch(() => { /* non-fatal */ });

  return NextResponse.json({ review: updated });
}
```

- [ ] **Step 4: Decline endpoint**

Write:

```ts
// src/app/api/admin/reviews/[id]/decline/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getFlagReview, updateReviewStatus } from '@/lib/db/flag-reviews';
import { sendUserDeclinedEmail } from '@/lib/email/flag-emails';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const review = await getFlagReview(params.id);
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { adminNote } = body as { adminNote?: string };

  const updated = await updateReviewStatus(params.id, {
    status: 'declined',
    adminNote: adminNote?.slice(0, 500),
    resolvedBy: session.email,
    creditRefunded: false,
  });

  sendUserDeclinedEmail(review.userEmail, adminNote).catch(() => { /* non-fatal */ });

  return NextResponse.json({ review: updated });
}
```

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/layout.tsx src/app/api/admin
git commit -m "feat(admin): layout guard + list/accept/decline endpoints (auto refund)"
```

---

### Task 14: Admin reviews page + `ReviewRow`

**Files:**
- Create: `src/components/admin/review-row.tsx`
- Create: `src/app/admin/reviews/page.tsx`

- [ ] **Step 1: Create `ReviewRow`**

Write:

```tsx
// src/components/admin/review-row.tsx
'use client';

import { useState } from 'react';
import type { FlagReview } from '@/types';
import { cn } from '@/lib/utils/cn';

interface ReviewRowProps {
  review: FlagReview;
  onResolved: (id: string) => void;
  onInspect: (review: FlagReview) => void;
}

export function ReviewRow({ review, onResolved, onInspect }: ReviewRowProps) {
  const [working, setWorking] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeAgo = (() => {
    const s = (Date.now() - new Date(review.createdAt).getTime()) / 1000;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  })();

  const act = async (verb: 'accept' | 'decline') => {
    setWorking(verb); setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}/${verb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to ${verb}`);
      onResolved(review.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${verb}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="bg-white border border-surface-border rounded-xl p-4 sm:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start">
        <button
          type="button"
          onClick={() => onInspect(review)}
          className="flex gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal rounded-lg"
          aria-label="Open full-size comparison"
        >
          <Thumb s3Key={review.originalS3Key} label="ORIG" />
          <Thumb s3Key={review.stagedS3Key} label="STAGED" />
        </button>

        <div className="min-w-0">
          <h3 className="font-semibold text-brand-navy text-sm">
            {review.userEmail} · {review.roomTypes.join(', ')} · {review.style}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">{timeAgo}</p>
          {review.userNote && (
            <blockquote className="mt-2 text-sm text-ink italic border-l-2 border-brand-teal pl-3 py-1 bg-surface-secondary rounded-r">
              {review.userNote}
            </blockquote>
          )}
        </div>

        <div className="flex gap-2 sm:flex-col sm:w-auto">
          <button
            type="button"
            disabled={!!working}
            onClick={() => act('accept')}
            className={cn(
              'flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-colors',
              'bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-50',
            )}
          >
            {working === 'accept' ? 'Refunding…' : 'Accept · refund'}
          </button>
          <button
            type="button"
            disabled={!!working}
            onClick={() => act('decline')}
            className={cn(
              'flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-colors',
              'bg-white border border-surface-border text-ink-secondary hover:border-ink-muted disabled:opacity-50',
            )}
          >
            {working === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Thumb({ s3Key, label }: { s3Key: string; label: string }) {
  return (
    <div className="relative w-16 h-12 sm:w-20 sm:h-16 rounded-md overflow-hidden border border-surface-border bg-surface-secondary">
      {s3Key ? (
        <img
          src={`/api/upload/signed?key=${encodeURIComponent(s3Key)}&preview=true`}
          alt={label}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : null}
      <span className="absolute top-0.5 left-0.5 text-[8px] font-bold bg-black/60 text-white px-1 rounded">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create the admin reviews page**

Write:

```tsx
// src/app/admin/reviews/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { FlagReview } from '@/types';
import { ReviewRow } from '@/components/admin/review-row';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<FlagReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/reviews?status=pending');
      if (r.ok) {
        const data = await r.json();
        setReviews(data.reviews);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolved = useCallback((id: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <header className="bg-white border-b border-surface-border sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 h-14 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl text-brand-navy">Flagged stagings</h1>
          </div>
          <a href="/dashboard" className="text-sm font-medium text-ink-muted hover:text-brand-navy">
            Dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 sm:px-8 py-8">
        <div className="mb-6 flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-sm text-ink-secondary">
            Review submissions from users who flagged a structural mismatch. Accept to refund 1 credit.
          </p>
          <div className="flex gap-2 overflow-x-auto">
            <Stat label="pending" value={reviews.length} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white border border-surface-border rounded-xl py-16 text-center">
            <p className="font-heading text-2xl text-brand-teal">All caught up</p>
            <p className="text-sm text-ink-muted mt-1">No pending reviews. Check back later.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} onResolved={handleResolved} onInspect={() => { /* Task 15 */ }} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="bg-white border border-surface-border rounded-lg px-3 py-1.5 text-xs text-ink-muted whitespace-nowrap">
      <b className="text-brand-navy text-sm font-semibold mr-1">{value}</b>{label}
    </span>
  );
}
```

- [ ] **Step 3: Verify the page loads**

Run: `npm run dev` → log in as `taraferguson.business@gmail.com` → visit `/admin/reviews`.
Expected: page loads, shows empty state or any pending reviews you have in DynamoDB.

Log in as a non-admin → visit `/admin/reviews`. Expected: redirects to `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin src/app/admin/reviews
git commit -m "feat(admin): /admin/reviews queue page with ReviewRow + stats"
```

---

### Task 15: `ReviewLightbox` — full-size inspection overlay

**Files:**
- Create: `src/components/admin/review-lightbox.tsx`
- Modify: `src/app/admin/reviews/page.tsx`

- [ ] **Step 1: Create the lightbox**

Write:

```tsx
// src/components/admin/review-lightbox.tsx
'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FlagReview } from '@/types';

interface ReviewLightboxProps {
  review: FlagReview | null;
  onClose: () => void;
}

export function ReviewLightbox({ review, onClose }: ReviewLightboxProps) {
  useEffect(() => {
    if (!review) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [review, onClose]);

  return (
    <AnimatePresence>
      {review && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-brand-navy/80 z-50"
            aria-hidden
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Full-size comparison"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="fixed inset-4 sm:inset-10 z-50 bg-white rounded-xl overflow-hidden flex flex-col"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
              <div>
                <h2 className="font-heading text-lg text-brand-navy">
                  {review.userEmail} · {review.style}
                </h2>
                <p className="text-xs text-ink-muted">Tap or press Escape to close</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-brand-navy text-2xl px-2">×</button>
            </header>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 overflow-auto">
              <ImgCard label="Original" s3Key={review.originalS3Key} />
              <ImgCard label="Staged" s3Key={review.stagedS3Key} />
            </div>
            {review.userNote && (
              <footer className="border-t border-surface-border px-4 py-3 bg-surface-secondary">
                <p className="text-xs font-bold tracking-widest uppercase text-ink-muted mb-1">User note</p>
                <p className="text-sm text-ink italic">{review.userNote}</p>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ImgCard({ label, s3Key }: { label: string; s3Key: string }) {
  return (
    <div className="relative bg-surface-secondary rounded-lg overflow-hidden">
      <span className="absolute top-2 left-2 text-[10px] font-bold tracking-widest uppercase bg-black/60 text-white px-2 py-1 rounded z-10">{label}</span>
      {s3Key && (
        <img
          src={`/api/upload/signed?key=${encodeURIComponent(s3Key)}`}
          alt={label}
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the admin page**

In `src/app/admin/reviews/page.tsx`, add:

```ts
import { ReviewLightbox } from '@/components/admin/review-lightbox';
// ...
const [inspecting, setInspecting] = useState<FlagReview | null>(null);
```

Replace the placeholder `onInspect={() => {}}` with `onInspect={setInspecting}`.

At the end of the page JSX (after `</main>`), add:

```tsx
<ReviewLightbox review={inspecting} onClose={() => setInspecting(null)} />
```

- [ ] **Step 3: Verify**

Run: `npm run dev` → visit `/admin/reviews` → click a thumbnail pair.
Expected: full-screen lightbox opens with original + staged side by side. Escape or outside-tap closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/review-lightbox.tsx src/app/admin/reviews/page.tsx
git commit -m "feat(admin): full-size review lightbox with keyboard dismiss"
```

---

### Task 16: Mobile + a11y hardening

**Files:**
- Modify: `src/app/stage/page.tsx`
- Modify: `src/components/wizard/wizard-card.tsx`
- Modify: `src/components/staging/flag-review-dialog.tsx`
- Modify: `src/app/globals.css` (if needed for safe-area helpers)

- [ ] **Step 1: Safe-area insets on the page container**

In `src/app/stage/page.tsx`, change the root `<div>` className:

```tsx
<div
  className="min-h-[100dvh] bg-surface-secondary flex flex-col"
  style={{ paddingTop: 'env(safe-area-inset-top)' }}
>
```

The card's footer already includes `padding-bottom: env(safe-area-inset-bottom)` from Task 1.

- [ ] **Step 2: Keyboard-aware textarea on Notes step**

In `src/components/wizard/notes-step.tsx`, wrap the textarea's container with a `max-h` that responds to `visualViewport`:

Add this hook helper at the top of the file:

```tsx
import { useEffect, useState } from 'react';

function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const diff = window.innerHeight - vv.height;
      setOffset(diff > 80 ? diff : 0);
    };
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);
  return offset;
}
```

Inside `NotesStep`:

```tsx
const keyboardOffset = useKeyboardOffset();
// ... inside render, outer wrapper:
<div style={{ paddingBottom: keyboardOffset }} className="space-y-5 transition-[padding]">
```

- [ ] **Step 3: Focus trap on the flag dialog**

Update `flag-review-dialog.tsx` — add auto-focus to the textarea on open and restore focus on close:

```tsx
import { useRef } from 'react';
// ...
const textareaRef = useRef<HTMLTextAreaElement>(null);
const lastFocusRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (!open) return;
  lastFocusRef.current = document.activeElement as HTMLElement | null;
  textareaRef.current?.focus();
  return () => { lastFocusRef.current?.focus(); };
}, [open]);

// ... give the textarea `ref={textareaRef}`
```

- [ ] **Step 4: A11y pass on other interactives**

- Progress-bar buttons already have `aria-label` and `aria-current` (Task 2).
- Admin `ReviewRow` thumbnail button has `aria-label="Open full-size comparison"` (Task 14).
- `WizardCard` header has the question as an `<h1>`/`<h2>`. This is fine.
- Every `<button>` has a `type="button"` attribute — audit once and fix any missing.

Run this to find unmarked buttons:

```bash
grep -rn "<button" src/components/wizard src/components/staging src/components/admin src/app/stage src/app/admin | grep -v "type="
```

Fix any that lack `type=`.

- [ ] **Step 5: Build + dev smoke**

Run: `npm run build`
Expected: PASS.

Run: `npm run dev` on a phone (or Chrome devtools device emulation) and walk every step.
Expected: No horizontal scroll. Notes textarea focus lifts Continue above keyboard. Flag dialog rises as a bottom sheet with rounded top corners.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wizard,a11y): safe-area insets, keyboard-aware notes, focus trap on flag dialog"
```

---

### Task 17: Ship — final QA checklist + deploy

**Files:**
- None to modify; this is verification.

- [ ] **Step 1: Type + lint + build + tests**

Run all four:

```bash
npm run type-check
npm run lint
npm run build
npm run test
```

Expected: all PASS.

- [ ] **Step 2: Full user-flow walkthrough on dev server**

Run: `npm run dev`. Execute each of the following end-to-end, noting any issue:

1. Log in → Stage page → Upload a photo → progress bar shows step 1 active.
2. Continue → Reference step → see "When this helps" block → Skip → Rooms.
3. Pick a room type → Continue → Style → scroll the grid (fades top/bottom) → pick one → Continue.
4. Notes: add a sentence → see "Your choices" chips → tap a chip → jumps to that step → come back.
5. "Stage this room · 1 credit" → Generating → Result card.
6. Download works. "Try another style" expander toggles. "Go to gallery" navigates.
7. Back through progress segments — all reachable, all preserve state.
8. After 60s on the result (no references), "Flag for review" appears → open dialog → submit → pill replaces link.
9. Attempt a staging WITH references → result screen has no flag link (ever).
10. Log in as admin → `/admin/reviews` → see the pending flag → click thumbs → lightbox → close → Accept. Check that the user receives an email and their credit count increased by 1.
11. Log in as non-admin → `/admin/reviews` → redirect to `/dashboard`.

- [ ] **Step 3: Mobile walkthrough**

In Chrome devtools, switch to iPhone 14 Pro viewport. Repeat the key steps:
- Card fills the viewport, corners round at top.
- Notes textarea focus lifts content above keyboard.
- Flag dialog is a bottom sheet with drag-handle.
- Admin row restacks vertically with full-width Accept/Decline.

- [ ] **Step 4: Commit the plan-complete marker (optional)**

No code changes here. Skip if unnecessary.

- [ ] **Step 5: Deploy**

Push to `master` — Amplify auto-deploys.

```bash
git push origin master
```

After ~3 minutes, visit `https://master.d88xgpqlfkk1w.amplifyapp.com/stage` and re-verify the key flows on prod. Focus on:
- SES email delivery (real flag → real email to `taraferguson.business@gmail.com`).
- `/api/reviews` returns 200 (not 500 from missing SES IAM policy — if it fails, add `ses:SendEmail` to the `content-producer-vercel` IAM user).

---

## Self-review

After the plan was written:

**Spec coverage:**
- Design language (card shell, pinned chrome, internal scroll, responsive) → Task 1
- Clickable progress bar → Task 2
- Reference step with copy → Task 3, 5
- Steps in card shells → Tasks 5-6
- Notes with summary chips + final "Stage this room · 1 credit" → Task 6
- Result card with flag link placeholder, action row, inline try-another → Task 7
- Delete MultiImageUpload → Task 8
- FlagReview entity + eligibility → Task 9
- SES + emails → Task 10
- `/api/reviews` POST + GET eligibility → Task 11
- FlagReviewDialog + FlaggedPill → Task 12
- Admin layout + accept/decline endpoints → Task 13
- Admin page + ReviewRow → Task 14
- Lightbox → Task 15
- Mobile + a11y → Task 16
- Ship → Task 17

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "handle edge cases" strings. Every task has either complete code or an exact command with expected output.

**Type consistency:** `FlagReview` type used consistently across tasks 9 → 17. `checkEligibility` signature matches between test (task 9 step 2) and implementation (task 9 step 4). `EligibilityReason` union consistent. `RoomPhoto` relocation handled once in task 8.

**Scope note:** Tasks 1-8 ship the wizard redesign as an independent working deliverable. Tasks 9-15 add flag-for-review + admin. This lets you deploy after Task 8 if you want to take the redesign live before the flag feature lands.
