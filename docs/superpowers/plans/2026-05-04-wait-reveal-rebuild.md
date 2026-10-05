# Wait State + Reveal Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the immersive screens of the staging flow — the concierge wait state and the reveal page (single-style result + triple-bundle batch reveal) — onto the StageRight design language. Includes the in-place loading state for un-landed variants, the free-credit celebration moment, and dropping the "What we noticed" + Share affordances. This is Plan 3 of 4 in the broader interior visual consistency cluster.

**Architecture:** The wait state stays as a full-screen dark takeover (sr-ink + ghost-blurred hero), restyled with editorial typography. The reveal page uses the cream interior surface, an editorial nameplate, a slider that matches the image's natural aspect ratio, take chips hugging the slider, and a 3-button footer. The BeforeAfterSlider component gets a new `afterContent` prop so the AFTER side can render a loading state when a variant hasn't landed yet (slider stays drag-able). The bonus-credit envelope gets a terra-glow halo + pill pulse treatment.

**Tech Stack:** Same as Plans 1+2. Reuses Plan 1 primitives (`<TerraPillButton>`, `<DarkPillButton>`).

**Spec:** `docs/superpowers/specs/2026-05-04-app-interior-visual-consistency-design.md`

**Branch base:** `feat/interior-foundation` (Plan 1's branch — Plan 3 doesn't depend on Plan 2 wizard primitives). Will rebase to master once PR #25 merges.

---

## File Structure

### New / restyled primitives
- `src/components/staging/editorial-nameplate.tsx` — replaces existing version with the new pattern (address eyebrow + "Style · *Room*" Fraunces with terra italic). Already exists at 19 lines; this is a full rewrite.

### Modified files
- `src/components/staging/staging-wait-concierge.tsx` — token migration + Fraunces italic notes + sweeping terra ambient loader
- `src/components/comparison/before-after-slider.tsx` — adds `afterContent?: ReactNode` prop. When provided, renders that as the AFTER layer instead of an image. Slider clip-path logic unchanged.
- `src/components/staging/variant-carousel.tsx` — clean chip labels (Take 1/2/3 only, no model info), drop "Cover" star (Download = cover-set per Plan 1), 8px gap to slider, in-place loading state when variant is `pending`/`queued`
- `src/components/staging/batch-result.tsx` — full restyle: editorial nameplate, slider+chips group, 3-button footer (Download terra · Another · Gallery), drop Share, drop "What we noticed" expander, drop Listing Copy (moves to gallery viewer in Plan 4)
- `src/components/staging/bonus-credit-envelope.tsx` — restyle with terra-glow halo, Fraunces "A gift, on *us*." headline, terra "+1" icon
- `src/app/stage/page.tsx` — Result step (single-style) restyle: same nameplate + slider + 3-button footer pattern as batch-result. Drop Share button + Listing Copy. Trigger pill pulse on bonus drop.

### Deleted files
- `src/components/staging/concierge-notes-expander.tsx` — no longer surfaced on reveal
- `src/components/staging/share-export-button.tsx` — dropped from reveal flow (was serving marketing, not user — per spec). Verify no other surfaces still use it.

---

## Task ordering

1. Wait state (Task 1) — independent, simple token + typography migration.
2. BeforeAfterSlider primitive change (Task 2) — adds the `afterContent` prop everything else builds on.
3. Editorial nameplate restyle (Task 3) — used by both reveal surfaces.
4. Variant carousel (Task 4) — needs Slider's new prop + nameplate.
5. Batch result page (Task 5) — wires everything for triple bundle.
6. Single-style result step (Task 6) — same shape, in stage/page.tsx.
7. Bonus credit envelope (Task 7) — celebration moment.
8. Drop dead components (Task 8).
9. Verify (Task 9).
10. Push + PR (Task 10).

---

## Task 1: Wait state — token migration + editorial typography

**Files:**
- Modify: `src/components/staging/staging-wait-concierge.tsx`

**Context:** Currently uses `bg-brand-navy` + DM Serif fonts. Migrate to sr-ink backdrop + Fraunces italic notes + sweeping terra loader. Existing rotation/timing logic unchanged.

- [ ] **Step 1: Read the file** to understand the current structure (rotating notes, ghost photo backdrop, status chip).

- [ ] **Step 2: Apply the spec's wait-state pattern**

```tsx
// section root
className="relative w-full h-full overflow-hidden bg-sr-ink sm:rounded-2xl"

// ghost photo backdrop — keep existing Ken Burns animation
// add a soft radial vignette overlay so the centred text is always readable:
<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(31,53,57,0.55)_100%)] pointer-events-none" />

// status pill (top-right)
className="absolute top-4 right-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.12] backdrop-blur-md text-[10px] tracking-[0.06em] uppercase text-white/90 font-semibold"
// with a pulsing terra dot:
<span className="size-1.5 rounded-full bg-sr-terra animate-pulse" />
Staging

// style + room caps label (top-centred)
className="text-[9px] tracking-[0.16em] uppercase text-white/55 font-bold mb-6"
{styleLabel} · {roomLabel}

// rotating note — Fraunces italic, large, white
className="font-display italic text-[22px] sm:text-2xl lg:text-3xl text-white/96 font-normal max-w-[280px] sm:max-w-[360px] leading-[1.25] tracking-[-0.015em]"
// with a single terra accent word per note (auto-picked or manually highlighted)

// ambient loader (bottom)
<div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[60%] max-w-[140px] h-[1.5px] bg-white/10 rounded-full overflow-hidden">
  <div className="absolute top-0 -left-[30%] h-full w-[30%] bg-gradient-to-r from-transparent via-sr-terra to-transparent rounded-full animate-[loader-sweep_2.4s_ease-in-out_infinite]" />
</div>

// timing hint
className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9.5px] text-white/55 tracking-[0.04em]"
~ 1 minute
```

For the `loader-sweep` animation, define it inline via a `<style>` tag in the section, OR add to `globals.css`:

```css
@keyframes loader-sweep {
  0% { left: -30%; }
  100% { left: 100%; }
}
```

For the **terra accent word in each note**: the existing notes are pre-formatted strings. Don't introduce per-note tagging — too invasive. Instead, render the whole note as `font-display italic text-white/96`, no special highlighting. The terra accent will appear via the loader + status dot.

- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/staging-wait-concierge.tsx
git add src/app/globals.css  # if you added the loader-sweep keyframe
git commit -m "feat(wait): migrate StagingWaitConcierge to sr-ink + Fraunces italic + terra ambient loader"
```

---

## Task 2: BeforeAfterSlider — `afterContent` prop for in-place loading

**Files:**
- Modify: `src/components/comparison/before-after-slider.tsx`

**Context:** Currently the slider takes `beforeSrc` + `afterSrc` (image URLs). For the reveal's in-place loading state, the AFTER layer needs to render a custom React node (loading content) instead of an image. Add an `afterContent?: ReactNode` prop. When provided, render it as the after layer; otherwise use `afterSrc` as before.

- [ ] **Step 1: Read the existing component** to understand the slider's clip-path mechanism.

- [ ] **Step 2: Add the `afterContent` prop**

```tsx
interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc?: string;
  /**
   * Optional custom React node rendered as the AFTER layer instead of the
   * staged image. Used by the reveal page's in-place loading state — when a
   * variant hasn't landed yet, we pass in the loading-orb + caption JSX so
   * the slider stays drag-able while the AFTER side displays a placeholder.
   * If both afterContent and afterSrc are provided, afterContent wins.
   */
  afterContent?: React.ReactNode;
  // ... existing props
}
```

In the render, replace the after layer:
```tsx
{afterContent ? (
  <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${100 - dividerPct}%)` }}>
    {afterContent}
  </div>
) : afterSrc ? (
  <img src={afterSrc} ... />
) : null}
```

- [ ] **Step 3: Type-check + commit**

```bash
npm run type-check
git add src/components/comparison/before-after-slider.tsx
git commit -m "feat(slider): accept afterContent prop for in-place loading state"
```

---

## Task 3: Editorial nameplate restyle

**Files:**
- Modify: `src/components/staging/editorial-nameplate.tsx`

**Context:** Currently 19 lines, basic. Replace with the new pattern: address eyebrow + Fraunces "Style · *Room*" headline with terra italic on the room.

- [ ] **Step 1: Rewrite**

```tsx
'use client';

import { type StagingStyle } from '@/lib/ai/prompts';
import type { RoomType } from '@/components/staging/room-type-selector';

interface EditorialNameplateProps {
  style: StagingStyle;
  roomTypes: RoomType[];
  /** Optional address line shown as a small caps eyebrow above the title. */
  addressLabel?: string;
}

export function EditorialNameplate({ style, roomTypes, addressLabel }: EditorialNameplateProps) {
  const roomLabel = roomTypes.length > 0 ? roomTypes.join(' · ') : 'Room';
  return (
    <div className="px-5 sm:px-6 pt-4 pb-3 text-center sm:text-left">
      {addressLabel && (
        <p className="text-[9px] sm:text-[10px] tracking-[0.10em] uppercase text-sr-ink-mute font-semibold mb-1">
          {addressLabel}
        </p>
      )}
      <h1 className="font-display text-xl sm:text-2xl lg:text-[28px] leading-[1.05] tracking-[-0.02em] text-sr-ink font-normal">
        {style} · <em className="text-sr-terra italic">{roomLabel}</em>
      </h1>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/components/staging/editorial-nameplate.tsx
git commit -m "feat(reveal): editorial nameplate — address eyebrow + Style · Room with terra italic"
```

---

## Task 4: VariantCarousel — clean chips + in-place loading + 8px hug

**Files:**
- Modify: `src/components/staging/variant-carousel.tsx`

**Context:** The carousel is the per-style card with slider + variant chips. Three changes:
1. **Chip labels**: drop "NB Pro / GPT M / GPT H" model info — just "Take 1 / Take 2 / Take 3". Drop the "Cover" star button entirely.
2. **In-place loading**: when the active variant's status is `pending` or `queued`, pass `afterContent` to BeforeAfterSlider instead of `afterSrc`. The afterContent is a centred pulsing terra orb + Fraunces italic caption + small tracking-wide eyebrow ("Take N").
3. **8px gap** between slider and chips — chips hug the bottom of the slider.

- [ ] **Step 1: Read the file** to understand the variant data shape and how chips are currently rendered.

- [ ] **Step 2: Apply the chip-label change**

Find the chip render. Replace any `"Take N · {model}"` pattern with just `"Take N"`. Drop the Cover star button (and its onClick handler — Download already covers cover-set per Plan 1).

- [ ] **Step 3: Apply the in-place loading state**

```tsx
const activeVariant = variants[activeIndex];
const isLoading = activeVariant.status === 'pending' || activeVariant.status === 'queued';

const afterContent = isLoading ? (
  <div className="absolute inset-0 bg-gradient-to-br from-sr-cream via-sr-cream-soft to-sr-cream backdrop-blur-md">
    <div className="absolute inset-0 bg-sr-ink/55" />
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6 text-center">
      <div className="size-12 rounded-full bg-[radial-gradient(circle,rgba(199,111,78,0.85)_0%,rgba(199,111,78,0)_70%)] animate-pulse mb-3" />
      <p className="text-[9px] tracking-[0.10em] uppercase text-white/70 font-bold mb-1.5">
        Take {activeIndex + 1}
      </p>
      <p className="font-display italic text-base sm:text-lg text-white max-w-[180px] leading-[1.3]">
        Almost there — <em className="not-italic font-medium text-[#E89377]">finishing the light</em>.
      </p>
    </div>
  </div>
) : undefined;
```

In the BeforeAfterSlider call:
```tsx
<BeforeAfterSlider
  beforeSrc={heroUrl}
  afterSrc={isLoading ? undefined : activeVariant.imageUrl}
  afterContent={afterContent}
  // ...
/>
```

- [ ] **Step 4: 8px gap to chips**

The wrapper around the slider+chips: `flex flex-col gap-2` (8px). The next sibling (action footer) sits in its own group with a 24px gap + hairline divider above it.

- [ ] **Step 5: Drop the Cover star button**

Remove the `onCoverClick` callback (or leave it as a no-op deprecated prop — caller may still pass it). The chip strip should now be just `Take 1 / Take 2 / Take 3` (or whatever count of variants exists).

When the active variant is loading, the chip itself shows a terra spinner:
```tsx
<button className={cn(
  'flex-shrink-0 px-3.5 py-2 rounded-full text-[10px] sm:text-[11px] font-semibold border',
  isActive && !isLoading && 'bg-sr-terra/[0.12] text-sr-terra border-sr-terra/40',
  isActive && isLoading && 'bg-sr-terra/[0.06] text-sr-terra border-sr-terra/40',
  !isActive && 'bg-sr-ink/[0.05] text-sr-ink/70 border-transparent',
)}>
  {isActive && isLoading && <span className="size-2 border-[1.5px] border-sr-terra/30 border-t-sr-terra rounded-full animate-spin" />}
  Take {variantIndex + 1}
</button>
```

- [ ] **Step 6: Type-check + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/variant-carousel.tsx
git commit -m "feat(reveal): variant carousel — clean Take chips, in-place loading, 8px hug"
```

---

## Task 5: Batch reveal page — full restyle

**Files:**
- Modify: `src/components/staging/batch-result.tsx`

**Context:** This is the per-batch reveal screen. Currently has nameplate, variant carousel, action footer with 5 buttons (Download · Share · Listing copy · Try another · Gallery). New design: 3 buttons (Download · Another · Gallery), Share dropped, Listing copy moved to gallery viewer (Plan 4).

- [ ] **Step 1: Read the file** to understand the layout + footer.

- [ ] **Step 2: Token migration + footer reduction**

Apply the standard token mapping. Specifically:
- Outer page background: `bg-sr-cream`
- AppHeader stays (already migrated in Plan 1)
- Editorial nameplate at top (Plan 3 Task 3)
- Per-style cards using restyled VariantCarousel (Plan 3 Task 4)
- Footer reduces to 3 buttons:
  - **Download** (terra primary — `<TerraPillButton>` from Plan 1)
  - **Another** (sage-deep — uses `<a>` or `<Link>` to `/stage` with the same listingId pre-loaded)
  - **Gallery** (white outlined — `<Link>` to `/dashboard`)

Drop:
- Share button (was marketing, not user)
- Listing copy button (moves to gallery viewer modal in Plan 4)
- "What we noticed" / ConciergeNotesExpander block

Footer spacing per spec: image+chips group → 24px gap + hairline divider → footer → 22px + safe-area-inset to device edge.

- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/components/staging/batch-result.tsx
git commit -m "feat(reveal): batch result — editorial nameplate + slider + 3-button footer, drop share + notes-expander + listing-copy"
```

---

## Task 6: Single-style result step in stage/page.tsx — same shape

**Files:**
- Modify: `src/app/stage/page.tsx` (the `step === 'result'` branch only)

**Context:** When a user submits a single-style stage, they end up here instead of the batch reveal page. Apply the same nameplate + slider + 3-button footer pattern. Drop Share, drop Listing Copy, drop ConciergeNotesExpander.

- [ ] **Step 1: Find the result step** (`step === 'result'`) — currently a custom `motion.section` with a hand-rolled layout including the 5-button sticky footer.

- [ ] **Step 2: Restyle**

Replace the hand-rolled markup with the same layout as batch-result:
- `bg-sr-cream` outer
- Editorial nameplate at top
- BeforeAfterSlider centered (image-aspect-ratio-driven, see spec)
- Single Take label below slider (no chip strip needed for single-style)
- Footer: Download · Another · Gallery
- Pill pulse + bonus envelope trigger on bonus drop (existing logic)

Drop the entire block of:
- ConciergeNotesExpander
- ShareExportButton
- ListingCopyButton
- "Walls or structure changed? Flag for review" link
- Admin pipeline-debug `<details>` block (admin-only — keep but tuck under a quieter affordance)

The flag-for-review link is dormant per CLAUDE.md (see `feedback_admin_only_images.md`). Drop entirely.

- [ ] **Step 3: Build + commit**

```bash
npm run type-check
npm run build
git add src/app/stage/page.tsx
git commit -m "feat(result): single-style result step matches batch reveal layout"
```

---

## Task 7: Bonus credit envelope — terra glow + editorial copy

**Files:**
- Modify: `src/components/staging/bonus-credit-envelope.tsx`

**Context:** Existing component (60 lines). Restyle with the spec's celebration treatment: white card + terra glow halo behind, Fraunces "A gift, on *us*." headline, terra "+1" icon.

- [ ] **Step 1: Read + restyle**

```tsx
'use client';
import { motion } from 'framer-motion';

interface BonusCreditEnvelopeProps {
  onDismiss: () => void;
}

export function BonusCreditEnvelope({ onDismiss }: BonusCreditEnvelopeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      onClick={onDismiss}
      className="fixed inset-x-0 bottom-8 z-50 mx-auto w-fit cursor-pointer"
    >
      {/* Soft terra glow halo behind */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 m-auto size-[240px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(199,111,78,0.45) 0%, transparent 60%)',
          filter: 'blur(20px)',
          top: '-20%',
        }}
      />
      <div className="bg-white border border-sr-terra/25 rounded-2xl shadow-[0_14px_36px_-8px_rgba(199,111,78,0.4)] px-5 py-4 flex items-center gap-3 max-w-[280px]">
        <div className="flex-shrink-0 size-10 rounded-xl bg-gradient-to-br from-sr-terra to-[#E89377] flex items-center justify-center text-white font-display text-[15px] font-semibold">
          +1
        </div>
        <div className="flex-1">
          <p className="text-[9px] tracking-[0.10em] uppercase text-sr-terra font-bold">
            Free credit
          </p>
          <p className="font-display text-[15px] text-sr-ink leading-[1.1] mt-0.5">
            A gift, on <em className="text-sr-terra italic">us</em>.
          </p>
          <p className="text-[10px] text-sr-ink-soft mt-0.5 leading-snug">
            7 stages spent — a free credit just landed.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npm run type-check
git add src/components/staging/bonus-credit-envelope.tsx
git commit -m "feat(celebration): BonusCreditEnvelope — terra glow halo + Fraunces editorial copy"
```

---

## Task 8: Drop dead components

**Files:**
- Delete: `src/components/staging/concierge-notes-expander.tsx`
- Delete: `src/components/staging/share-export-button.tsx`

- [ ] **Step 1: Verify no remaining importers**

```bash
grep -rn "ConciergeNotesExpander\|ShareExportButton" src/ --include='*.ts' --include='*.tsx'
```

If matches exist (e.g., they're still imported in batch-result or stage/page), they should have been removed in Tasks 5+6. Fix any stragglers.

- [ ] **Step 2: Delete + commit**

```bash
git rm src/components/staging/concierge-notes-expander.tsx src/components/staging/share-export-button.tsx
git commit -m "chore(reveal): remove dead ConciergeNotesExpander + ShareExportButton"
```

---

## Task 9: Final verification

```bash
npm run type-check
npm run build
npm run lint
npm run test
```

Manual visual check:
- `/stage` cold — go through all 6 steps quickly, hit submit
- Single-style stage: wait state shows sr-ink + Fraunces italic note + sweeping terra loader
- Reveal page: editorial nameplate + slider + Download/Another/Gallery footer
- Free-credit drop (will only fire if you're at a 7-credit-spent boundary): envelope card + terra glow + pill pulse
- Triple-bundle stage: same flow, plus chips below slider, in-place loading on un-landed variants

---

## Task 10: Push branch + open PR

```bash
git push -u origin feat/wait-reveal-rebuild
gh pr create --base feat/interior-foundation --title "Plan 3: wait state + reveal rebuild" --body ...
```

If Plan 1 has merged, use `--base master`. Otherwise stack on `feat/interior-foundation`.

---

## Self-review

Spec coverage:
- ✅ Wait state (Task 1)
- ✅ BeforeAfterSlider afterContent prop (Task 2)
- ✅ Editorial nameplate (Task 3)
- ✅ Variant carousel — clean chips, in-place loading, 8px hug (Task 4)
- ✅ Batch reveal restyle (Task 5)
- ✅ Single-style result restyle (Task 6)
- ✅ Bonus credit envelope (Task 7)
- ✅ Drop dead code (Task 8)

Out of scope (Plan 4):
- Gallery viewer modal — listing-detail tile tap target
- Listing Copy button — surfaces in gallery viewer's footer
