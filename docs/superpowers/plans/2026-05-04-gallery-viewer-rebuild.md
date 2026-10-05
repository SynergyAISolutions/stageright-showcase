# Gallery Viewer Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the gallery viewer modal that opens when a user taps a staged room tile from listing detail. Apply the StageRight design language plus the IA pattern locked during brainstorming: headline-as-picker (no top chip strip), bottom sheet style switcher with thumbnail grid, 3-button footer (Download · Listing Copy · New style), destructive actions under the ⋯ menu. This is Plan 4 of 4 — completes the broader interior visual consistency cluster.

**Architecture:** Single modal component (`gallery-viewer.tsx`, ~487 lines) gets restructured. Style switching moves from inline chips → tappable headline + bottom sheet. Take chips (variants per style) stay below the slider when triple-bundle. Destructive actions move under a ⋯ button so users can't fat-finger Delete. The Listing Copy button (dropped from reveal in Plan 3) lands here in the footer.

**Tech Stack:** Same as Plans 1-3. Reuses Plan 1 primitives (`<TerraPillButton>`, `<DarkPillButton>`).

**Spec:** `docs/superpowers/specs/2026-05-04-app-interior-visual-consistency-design.md`

**Branch base:** `feat/interior-foundation` (Plan 1's primitives are needed; no dependency on Plan 2 wizard or Plan 3 reveal).

---

## File Structure

### New / extracted components
- `src/components/dashboard/style-switcher-sheet.tsx` — bottom sheet that slides up from below, shows 2-col grid of available styles for the current upload, plus a "+ New style" card. Tappable to switch the active style.

### Modified files
- `src/components/dashboard/gallery-viewer.tsx` — full restyle: drop old chip strip, replace with headline-as-picker; tokens migrate to sr-*; footer reduces to 3 buttons; ⋯ menu for destructive actions; in-place loading state for un-landed variants (uses `BeforeAfterSlider`'s `afterContent` prop from Plan 3 if available, otherwise falls back to no-op since this PR may merge before Plan 3).

### NOT modified (already done elsewhere)
- `src/components/dashboard/staging-gallery.tsx` — Plan 1 migrated this to use the `Tile` primitive on listing detail. Plan 4 just consumes it via `setSelected(upload)` to open the gallery-viewer modal.
- `src/app/listings/[id]/page.tsx` — Plan 1 restyled this. No Plan 4 work needed.

---

## Task ordering

1. Style switcher sheet (Task 1) — new component, independent.
2. Gallery viewer shell + header (Task 2) — restyle the outer modal chrome (close-X, ⋯ menu).
3. Headline-as-picker (Task 3) — replace chip strip with tappable headline; wire to sheet.
4. Slider area + take chips (Task 4) — restyle the image+chips group, 8px hug.
5. Footer (Task 5) — 3 buttons (Download terra · Listing copy · New style sage-deep).
6. Destructive actions sheet (Task 6) — ⋯ menu with Delete this staging / Delete the upload.
7. Verify (Task 7).
8. Push + PR (Task 8).

---

## Task 1: `<StyleSwitcherSheet>`

**File:** Create `src/components/dashboard/style-switcher-sheet.tsx`

**Context:** Bottom sheet that slides up from below. 2-column grid of style cards (each card shows the style's cover image + name + N takes). Active style has terra outline. "+ New style" card at bottom-right re-enters wizard with the current hero pre-loaded.

- [ ] **Step 1: Implement**

```tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface StyleSummary {
  /** Style name (e.g. "Modern", "Coastal"). Used as identifier + display label. */
  style: string;
  /** Cover image URL for this style — typically the first variant's staged image. */
  coverUrl: string | null;
  /** Number of takes/variants for this style. */
  takesCount: number;
}

interface StyleSwitcherSheetProps {
  open: boolean;
  onClose: () => void;
  /** All styles available for this upload group. */
  styles: StyleSummary[];
  /** Currently active style name. */
  activeStyle: string;
  /** Called when user taps a style card. */
  onPickStyle: (style: string) => void;
  /** Hero S3 key + listing id passed through to "+ New style" link. */
  newStyleHref: string;
}

export function StyleSwitcherSheet({
  open,
  onClose,
  styles,
  activeStyle,
  onPickStyle,
  newStyleHref,
}: StyleSwitcherSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-sr-ink/40 backdrop-blur-sm z-[60]"
            aria-hidden
          />
          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Switch style"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[61] bg-sr-cream rounded-t-3xl shadow-[0_-12px_36px_-8px_rgba(31,53,57,0.2)] px-4 pt-3 pb-6 max-h-[85vh] overflow-y-auto sm:max-w-[480px] sm:mx-auto"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {/* Drag handle */}
            <div className="mx-auto w-10 h-1 rounded-full bg-sr-ink/15 mb-4" aria-hidden />

            <h2 className="font-display text-xl text-sr-ink leading-tight tracking-[-0.015em]">
              Switch <em className="text-sr-terra italic">style</em>
            </h2>
            <p className="text-[11px] text-sr-ink-mute mt-0.5 mb-4">
              {styles.length} {styles.length === 1 ? 'style' : 'styles'} staged for this room.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {styles.map((s) => {
                const isActive = s.style === activeStyle;
                return (
                  <button
                    key={s.style}
                    type="button"
                    onClick={() => {
                      onPickStyle(s.style);
                      onClose();
                    }}
                    className={cn(
                      'bg-white rounded-xl overflow-hidden border flex flex-col text-left transition-all',
                      isActive
                        ? 'border-sr-terra shadow-[0_0_0_1px_rgba(199,111,78,1)_inset]'
                        : 'border-sr-ink/[0.06] hover:border-sr-terra/30',
                    )}
                  >
                    <div className="aspect-[4/3] relative bg-sr-cream-soft">
                      {s.coverUrl ? (
                        <Image
                          src={s.coverUrl}
                          alt={s.style}
                          fill
                          sizes="(max-width: 480px) 50vw, 240px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-xs text-sr-ink-mute">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="px-2.5 py-2">
                      <p className={cn(
                        'text-[11px] font-semibold leading-tight',
                        isActive ? 'text-sr-terra' : 'text-sr-ink',
                      )}>
                        {s.style}
                      </p>
                      <p className="text-[9px] text-sr-ink-mute mt-0.5">
                        {s.takesCount} {s.takesCount === 1 ? 'take' : 'takes'}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* "+ New style" card */}
              <Link
                href={newStyleHref}
                onClick={onClose}
                className="bg-sr-terra/[0.04] border border-dashed border-sr-terra/40 rounded-xl flex flex-col items-center justify-center text-sr-terra hover:bg-sr-terra/[0.08] transition-colors aspect-[4/3] text-center px-4"
              >
                <span className="text-2xl leading-none mb-1.5" aria-hidden>+</span>
                <span className="text-[10px] font-bold tracking-[0.06em] uppercase">
                  New style
                </span>
                <span className="text-[8.5px] text-sr-terra/70 mt-0.5">
                  Re-stage this room
                </span>
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/components/dashboard/style-switcher-sheet.tsx
git commit -m "feat(gallery): add StyleSwitcherSheet — bottom sheet with thumbnail grid + new-style card"
```

---

## Task 2: Gallery viewer — outer chrome + token migration

**File:** Modify `src/components/dashboard/gallery-viewer.tsx`

**Context:** ~487 lines. Read it first to understand the current structure (modal portal, slider, chip strip, footer with multiple buttons, delete actions). The shell migration is the foundation for Tasks 3-6.

- [ ] **Step 1: Read the file**

- [ ] **Step 2: Apply token migration on the OUTER chrome only** (not the inner pieces — those get rebuilt in Tasks 3-6)

- Backdrop: `bg-sr-ink/50 backdrop-blur-sm`
- Modal surface: `bg-sr-cream` (cream interior — matches dashboard)
- Header (top of modal): `bg-sr-cream` with hairline border-bottom
- Token swap throughout: `brand-navy` → `sr-ink`, `brand-teal` → `sr-terra`, `surface-secondary` → `sr-cream`, `surface-border` → `sr-hairline`, `font-heading` → `font-display`, `text-ink-secondary` → `text-sr-ink-soft`, `text-ink-muted` → `text-sr-ink-mute`

- Header layout: `⋯ button (left)` + `× close button (right)` only. No title text — the headline-as-picker (Task 3) goes in the body, not the header.

```tsx
{/* Header */}
<div className="flex items-center justify-between px-4 py-3 border-b border-sr-hairline">
  <button
    type="button"
    onClick={() => setMenuOpen(true)}
    aria-label="More actions"
    className="size-8 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none font-bold"
  >
    ⋯
  </button>
  <button
    type="button"
    onClick={onClose}
    aria-label="Close"
    className="size-8 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none"
  >
    ×
  </button>
</div>
```

Add a `menuOpen` state (`useState(false)`) for the destructive actions sheet (Task 6).

- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/dashboard/gallery-viewer.tsx
git commit -m "feat(gallery): outer chrome — sr-* tokens + ⋯/× header buttons (no title)"
```

---

## Task 3: Headline-as-picker

**File:** Modify `src/components/dashboard/gallery-viewer.tsx`

**Context:** Replace the current chip strip at the top of the modal with an editorial headline that's tappable. Tap → opens the StyleSwitcherSheet.

- [ ] **Step 1: Add the headline block** (just below the header chrome, in the body)

```tsx
import { StyleSwitcherSheet } from './style-switcher-sheet';

// State for sheet open/close
const [sheetOpen, setSheetOpen] = useState(false);

// Compute styles summary from the upload (the upload has a styles[] array)
const stylesSummary = upload.styles.map((s) => ({
  style: s.style,
  coverUrl: s.variants[0]?.stagedUrl ?? null,
  takesCount: s.variants.length,
}));

const totalVariants = upload.totalVariants;
const hasMultipleStyles = upload.styles.length > 1;

// In the body, render:
<div className="px-5 py-4">
  {/* Address + room eyebrow */}
  <p className="text-[9px] tracking-[0.10em] uppercase text-sr-ink-mute font-semibold mb-1">
    {/* TODO: address label if available — listingName + " · " + roomTypes.join(' · ') */}
    {/* For now, just room types */}
    {upload.roomTypes.join(' · ')}
  </p>

  {/* Headline — tappable when multiple styles */}
  {hasMultipleStyles ? (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      className="inline-flex items-center gap-2 group"
    >
      <h1 className="font-display text-xl sm:text-2xl text-sr-ink leading-[1.05] tracking-[-0.02em] font-normal">
        <em className="text-sr-terra italic">{activeStyleName}</em>
      </h1>
      <span className="text-sr-terra/70 text-xs group-hover:text-sr-terra transition-colors">▾</span>
    </button>
  ) : (
    <h1 className="font-display text-xl sm:text-2xl text-sr-ink leading-[1.05] tracking-[-0.02em] font-normal">
      <em className="text-sr-terra italic">{activeStyleName}</em>
    </h1>
  )}

  {/* Quiet meta — only shown when multiple styles */}
  {hasMultipleStyles && (
    <p className="text-[10.5px] text-sr-ink-mute mt-1">
      {upload.styles.length} styles · {totalVariants} versions
    </p>
  )}
</div>

{/* Mount the sheet */}
<StyleSwitcherSheet
  open={sheetOpen}
  onClose={() => setSheetOpen(false)}
  styles={stylesSummary}
  activeStyle={activeStyleName}
  onPickStyle={(s) => setActiveStyleName(s)}
  newStyleHref={`/stage?listingId=${listingId}&heroS3Key=${heroS3Key}`}
/>
```

The state `activeStyleName` replaces whatever variable currently tracks the displayed style. Initialize from `upload.styles[0].style`.

- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/dashboard/gallery-viewer.tsx
git commit -m "feat(gallery): headline-as-picker — tap style name to open switcher sheet"
```

---

## Task 4: Slider + take chips (8px hug)

**File:** Modify `src/components/dashboard/gallery-viewer.tsx`

**Context:** Below the headline, the active style's slider + take chips. Take chips ONLY when the upload was a triple bundle (variants.length > 1). Single-bundle uploads omit the chip strip — slider gets the freed space.

- [ ] **Step 1: Replace the slider area**

```tsx
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';

const activeStyle = upload.styles.find((s) => s.style === activeStyleName);
const variants = activeStyle?.variants ?? [];
const [activeVariantIndex, setActiveVariantIndex] = useState(0);
const activeVariant = variants[activeVariantIndex];

const showTakeChips = variants.length > 1;

<div className="flex flex-col gap-2 px-4 sm:px-5 py-2">
  <div className="flex justify-center">
    <div className="w-full max-w-[640px]">
      <BeforeAfterSlider
        beforeSrc={upload.heroUrl ?? ''}
        afterSrc={activeVariant?.stagedUrl}
        beforeLabel="Before"
        afterLabel="Staged"
        className="rounded-xl"
        fitParent
      />
    </div>
  </div>
  {showTakeChips && (
    <div className="flex gap-2 justify-center">
      {variants.map((_v, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setActiveVariantIndex(i)}
          className={cn(
            'flex-shrink-0 px-3.5 py-2 rounded-full text-[10px] font-semibold border transition-all',
            i === activeVariantIndex
              ? 'bg-sr-terra/[0.12] text-sr-terra border-sr-terra/40'
              : 'bg-sr-ink/[0.05] text-sr-ink/70 border-transparent hover:bg-sr-ink/[0.08]',
          )}
        >
          Take {i + 1}
        </button>
      ))}
    </div>
  )}
</div>
```

Reset `activeVariantIndex` to 0 when `activeStyleName` changes (use a `useEffect`).

- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/dashboard/gallery-viewer.tsx
git commit -m "feat(gallery): slider + take chips with 8px hug, omit chips for single-bundle"
```

---

## Task 5: Footer — 3 buttons

**File:** Modify `src/components/dashboard/gallery-viewer.tsx`

**Context:** Replace the current footer (multiple buttons including Delete) with a 3-button grid: Download · Listing Copy · New style. Delete moves to the ⋯ menu (Task 6). Listing Copy lands here per the spec (it was dropped from the reveal in Plan 3).

- [ ] **Step 1: Replace the footer**

The current footer renders things like a delete button + share + download. Strip ALL of it and replace with:

```tsx
import { ListingCopyButton } from '@/components/disclosure/listing-copy-button';

// Build download URL — must include listingId per Plan 1's cover-image rule
const downloadHref = activeVariant && upload.listingId
  ? `/api/download?key=${encodeURIComponent(activeVariant.stagedS3Key)}&style=${encodeURIComponent(activeStyleName)}${upload.roomTypes.length > 0 ? `&rooms=${encodeURIComponent(upload.roomTypes.join(','))}` : ''}&listingId=${encodeURIComponent(upload.listingId)}`
  : activeVariant
  ? `/api/download?key=${encodeURIComponent(activeVariant.stagedS3Key)}&style=${encodeURIComponent(activeStyleName)}`
  : '#';

const newStyleHref = upload.listingId
  ? `/stage?listingId=${encodeURIComponent(upload.listingId)}&heroS3Key=${encodeURIComponent(upload.heroS3Key)}`
  : `/stage?heroS3Key=${encodeURIComponent(upload.heroS3Key)}`;

<footer
  className="flex-shrink-0 px-4 py-4 border-t border-sr-hairline bg-sr-cream"
  style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
>
  <div className="grid grid-cols-3 gap-2">
    {/* Download — terra primary */}
    <a
      href={downloadHref}
      className="h-11 inline-flex items-center justify-center gap-1.5 bg-sr-terra text-white font-semibold text-xs rounded-full hover:bg-sr-terra/90 transition-colors whitespace-nowrap"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Download
    </a>
    {/* Listing copy */}
    <ListingCopyButton className="h-11 inline-flex items-center justify-center gap-1.5 bg-white border border-sr-ink/[0.10] text-sr-ink font-semibold text-xs rounded-full hover:bg-sr-cream-soft transition-colors whitespace-nowrap px-3" />
    {/* New style — sage-deep */}
    <Link
      href={newStyleHref}
      className="h-11 inline-flex items-center justify-center gap-1.5 bg-sr-sage-deep text-white font-semibold text-xs rounded-full hover:bg-sr-sage-deep/90 transition-colors whitespace-nowrap"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 7a4 4 0 117.5 2M11 11V8H8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      New style
    </Link>
  </div>
</footer>
```

If `<ListingCopyButton>` doesn't exist as a standalone component, find where its JSX currently lives and either extract it into `src/components/disclosure/listing-copy-button.tsx`, or inline it as a `<button>` with the same styling.

- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/dashboard/gallery-viewer.tsx
git commit -m "feat(gallery): footer — Download terra + Listing copy + New style sage-deep, 3-button grid"
```

---

## Task 6: Destructive actions sheet (⋯ menu)

**File:** Modify `src/components/dashboard/gallery-viewer.tsx`

**Context:** Tapping the ⋯ button (top-left of header) opens a small bottom sheet with destructive actions: Delete this staging (current variant only), Delete the upload (whole hero + all variants), Cancel. Hidden by default — can't fat-finger Delete.

- [ ] **Step 1: Implement the sheet inline**

```tsx
{menuOpen && (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setMenuOpen(false)}
      className="fixed inset-0 bg-sr-ink/40 backdrop-blur-sm z-[70]"
      aria-hidden
    />
    <motion.div
      role="dialog"
      aria-label="More actions"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="fixed inset-x-0 bottom-0 z-[71] bg-sr-cream rounded-t-3xl shadow-[0_-12px_36px_-8px_rgba(31,53,57,0.2)] px-4 pt-3 pb-6 sm:max-w-[420px] sm:mx-auto"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto w-10 h-1 rounded-full bg-sr-ink/15 mb-4" aria-hidden />
      <div className="space-y-1">
        {activeVariant && (
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              if (onDeleteVariant) await onDeleteVariant(activeVariant);
            }}
            disabled={deleting}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 bg-white border border-sr-hairline rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete this staging
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            setMenuOpen(false);
            await onDelete();
          }}
          disabled={deleting}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 bg-white border border-sr-hairline rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Delete the entire upload
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="w-full px-4 py-3 text-sm font-medium text-sr-ink-soft hover:bg-sr-cream-soft rounded-xl transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  </AnimatePresence>
)}
```

Wrap inside the AnimatePresence properly (the `{menuOpen && ...}` should be inside `<AnimatePresence>` with the conditional, or use the `mode="wait"` prop).

- [ ] **Step 2: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/dashboard/gallery-viewer.tsx
git commit -m "feat(gallery): destructive actions sheet — Delete staging / Delete upload behind ⋯"
```

---

## Task 7: Final verify

```bash
npm run type-check
npm run build
npm run lint
npm run test
```

Manual visual check:
- Open `/listings/<id>` (any listing with stagings).
- Tap a tile — gallery viewer opens with the new chrome.
- Headline shows "*Style*" with terra italic + caret if multiple styles.
- Tap headline → bottom sheet slides up showing 2-col thumbnails.
- Tap a different style → sheet closes, slider switches.
- Tap ⋯ → destructive sheet opens.
- Footer: Download (terra) · Listing copy · New style (sage-deep).
- Take chips appear only for triple-bundle uploads.

---

## Task 8: Push branch + open PR

```bash
git push -u origin feat/gallery-viewer-rebuild
gh pr create --base feat/interior-foundation --title "Plan 4: gallery viewer rebuild" --body ...
```

If Plan 1 has merged, base is `master`. Otherwise stack on `feat/interior-foundation`.

---

## Self-review

Spec coverage:
- ✅ Headline-as-picker (Task 3)
- ✅ Bottom sheet style switcher with thumbnails (Task 1)
- ✅ Slider + take chips, 8px hug, omit for single-bundle (Task 4)
- ✅ Footer — 3 buttons (Task 5)
- ✅ Destructive actions under ⋯ (Task 6)
- ✅ Token migration (Task 2)

This completes the broader interior visual consistency cluster. After Plans 1-4 merge, the entire logged-in app surface is on the StageRight design language. Follow-ups (furnished-room, branding sweep, signup-defer, auth gaps) remain queued.
