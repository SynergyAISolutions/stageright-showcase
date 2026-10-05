'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { cn } from '@/lib/utils/cn';
import type { VariantSlot } from '@/types';

export interface CarouselVariant {
  slot: VariantSlot;
  status: 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';
  imageUrl?: string;
  /** ms epoch — used to compute "Take 1/2/3" landing-order labels */
  arrivedAt?: number;
}

interface VariantCarouselProps {
  heroImageUrl?: string;
  variants: CarouselVariant[];
  /** Initial selected slot. Defaults to first arrived. */
  initialSlot?: VariantSlot;
  /**
   * Currently chosen cover slot.
   * Kept in interface for caller compatibility — no star UI is rendered.
   */
  coverSlot?: VariantSlot;
  /**
   * Fires when user taps the star chip to set that take as cover.
   * Kept in interface for caller compatibility — no star UI is rendered.
   */
  onCoverChange?: (slot: VariantSlot) => void;
  /** Currently active slot (controlled). If undefined, component manages internally. */
  activeSlot?: VariantSlot;
  /** Fires when user taps a chip to switch the active variant. */
  onActiveSlotChange?: (slot: VariantSlot) => void;
  /** When true, render the BeforeAfterSlider; otherwise full-bleed after image. */
  compareMode: boolean;
  onCompareModeChange?: (next: boolean) => void;
  /**
   * View mode for the image area:
   *  - 'slider' (default): persistent before/after drag slider
   *  - 'split': original and staged shown as two separate images
   *    (stacked on mobile, side-by-side on sm+)
   */
  viewMode?: 'slider' | 'split';
  className?: string;
}

/**
 * Persistent-slider variant carousel.
 *
 * - Lifts BeforeAfterSlider's position to local state (0-100) so the drag
 *   handle stays put as the user flicks between variants.
 * - Chip strip (only when variants.length > 1) shows landing-order labels
 *   "Take 1 / Take 2 / Take 3"; failed_after_retry variants are filtered out.
 * - When the active variant is still pending/queued, passes an in-place loading
 *   orb + caption as afterContent to BeforeAfterSlider so the slider stays
 *   drag-able while the hero image remains visible.
 * - Cover star button intentionally removed — download sets cover automatically.
 */
export function VariantCarousel({
  heroImageUrl,
  variants,
  initialSlot,
  // coverSlot and onCoverChange accepted but intentionally unused — no star UI.
  coverSlot: _coverSlot,
  onCoverChange: _onCoverChange,
  activeSlot: controlledActiveSlot,
  onActiveSlotChange,
  compareMode,
  onCompareModeChange: _onCompareModeChange,
  viewMode = 'slider',
  className,
}: VariantCarouselProps) {
  // Variants that have arrived (have an image), in landing order.
  const arrived = useMemo(
    () =>
      variants
        .filter((v) => v.status === 'done' && v.imageUrl)
        .sort((a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0)),
    [variants],
  );

  // Active slot is controlled if parent supplies it; else local state.
  const [internalActiveSlot, setInternalActiveSlot] = useState<VariantSlot | undefined>(
    initialSlot ?? arrived[0]?.slot,
  );
  const activeSlot =
    controlledActiveSlot !== undefined ? controlledActiveSlot : internalActiveSlot;

  // Initial bootstrap only — once internalActiveSlot is set (via initialSlot
  // or chip click), DON'T override it. The earlier "fall back to first arrived"
  // behaviour was bouncing users away from pending takes they had explicitly
  // clicked, so the loading state never appeared.
  useEffect(() => {
    if (controlledActiveSlot !== undefined) return;
    if (internalActiveSlot === undefined && arrived[0]) {
      setInternalActiveSlot(arrived[0].slot);
    }
  }, [arrived, internalActiveSlot, controlledActiveSlot]);

  function handleChipClick(slot: VariantSlot) {
    if (controlledActiveSlot !== undefined) {
      onActiveSlotChange?.(slot);
    } else {
      setInternalActiveSlot(slot);
      onActiveSlotChange?.(slot);
    }
  }

  // Persistent slider drag position (0-100). Stays put across variant swaps.
  const [sliderPos, setSliderPos] = useState(50);

  // Hero image orientation drives split-mode layout: a landscape photo
  // (typical real-estate shot) gets stacked vertically on mobile so each
  // tile keeps a usable width; a portrait photo (rare but possible — phone
  // shots, narrow rooms) goes side-by-side at every breakpoint because the
  // tiles don't need width to read. Defaults to 'landscape' so the initial
  // paint matches the most common case.
  const [heroOrientation, setHeroOrientation] = useState<'landscape' | 'portrait'>('landscape');
  useEffect(() => {
    if (!heroImageUrl) return;
    const img = new window.Image();
    img.onload = () => {
      setHeroOrientation(
        img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait',
      );
    };
    img.src = heroImageUrl;
  }, [heroImageUrl]);

  // Active variant — spans ALL variants including pending so clicking a
  // still-loading chip shows the loading orb rather than bouncing back.
  const active = variants.find((v) => v.slot === activeSlot);
  const isLoading =
    !active?.imageUrl ||
    active.status === 'pending' ||
    active.status === 'running';

  // Chips for display: arrived variants first (landing order), then pending.
  // failed_after_retry variants are filtered out entirely.
  const visibleChips = useMemo(() => {
    return [...variants]
      .filter((v) => v.status !== 'failed_after_retry')
      .sort((a, b) => {
        const aArrived = a.status === 'done';
        const bArrived = b.status === 'done';
        if (aArrived && bArrived) return (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0);
        if (aArrived) return -1;
        if (bArrived) return 1;
        return a.slot - b.slot;
      });
  }, [variants]);

  // Map chip array index → "Take N" label (1-based, arrival order).
  // Pending chips appear at the end so their label reflects their expected
  // slot position rather than final arrival order.

  // In-place loading overlay passed as afterContent to BeforeAfterSlider.
  const loadingAfterContent = isLoading ? (
    <div className="absolute inset-0 bg-gradient-to-br from-sr-cream via-sr-cream-soft to-sr-cream">
      <div className="absolute inset-0 bg-sr-ink/55 backdrop-blur-md" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6 text-center">
        <div
          className="size-12 rounded-full mb-3"
          style={{
            background:
              'radial-gradient(circle, rgba(199,111,78,0.85) 0%, rgba(199,111,78,0) 70%)',
            animation: 'pulse 1.6s ease-in-out infinite',
          }}
        />
        <p className="text-[9px] tracking-[0.10em] uppercase text-white/70 font-bold mb-1.5">
          Take{' '}
          {active
            ? visibleChips.findIndex((c) => c.slot === active.slot) + 1
            : '…'}
        </p>
        <p className="font-display italic text-base sm:text-lg text-white max-w-[180px] leading-[1.3]">
          Almost there&hellip;
        </p>
      </div>
    </div>
  ) : undefined;

  return (
    <div className={cn('w-full h-full flex flex-col min-h-0', className)}>
      {/* Image area + chips — flex column; image area takes flex-1, chips stay
          at intrinsic height so the chip strip never gets pushed past the fold. */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {/* Image area host: flex-1 + min-h-0 so it fills the available column,
            containerType: 'size' so BeforeAfterSlider's fitParent (100cqh)
            resolves to this box rather than the viewport. */}
        <div
          className="flex-1 min-h-0 overflow-hidden flex items-center justify-center"
          style={{ containerType: 'size' }}
        >
        {/* Image area — split view (two images) or slider */}
        {viewMode === 'split' ? (
          <div
            className={cn(
              'grid gap-2 sm:gap-3 w-full h-full max-h-full',
              heroOrientation === 'landscape'
                ? // Landscape hero: stack on mobile (each tile gets full width
                  // and half the available height), side-by-side on sm+ where
                  // there's enough horizontal room.
                  'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'
                : // Portrait hero: side-by-side everywhere — narrow tiles
                  // still read fine for a portrait photo.
                  'grid-cols-2 grid-rows-1',
            )}
          >
            {/* Original */}
            <div className="relative h-full rounded-xl overflow-hidden bg-sr-cream-soft">
              {heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt="Original"
                  className="block w-full h-full object-contain"
                />
              ) : null}
              <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full bg-white text-[10px] font-bold tracking-[0.04em] uppercase text-sr-ink shadow-soft">
                Original
              </span>
            </div>
            {/* Staged */}
            <div className="relative h-full rounded-xl overflow-hidden bg-sr-cream-soft">
              {!isLoading && active?.imageUrl ? (
                <AnimatePresence mode="wait">
                  <motion.img
                    key={active.slot}
                    src={active.imageUrl}
                    alt="Staged"
                    className="block w-full h-full object-contain"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  />
                </AnimatePresence>
              ) : (
                // Loading state inside the staged tile
                <div className="absolute inset-0 bg-sr-ink/55 backdrop-blur-md flex flex-col items-center justify-center text-white px-4 text-center">
                  <div
                    className="size-10 rounded-full mb-2"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(199,111,78,0.85) 0%, rgba(199,111,78,0) 70%)',
                      animation: 'pulse 1.6s ease-in-out infinite',
                    }}
                  />
                  <p className="text-[9px] tracking-[0.10em] uppercase text-white/70 font-bold mb-1">
                    Take{' '}
                    {active
                      ? visibleChips.findIndex((c) => c.slot === active.slot) + 1
                      : '…'}
                  </p>
                  <p className="font-display italic text-sm text-white max-w-[140px] leading-[1.3]">
                    Almost there&hellip;
                  </p>
                </div>
              )}
              <span className="absolute top-3 right-3 inline-flex items-center px-2.5 py-1 rounded-full bg-sr-terra text-[10px] font-bold tracking-[0.04em] uppercase text-white shadow-soft">
                Staged
              </span>
            </div>
          </div>
        ) : compareMode && !isLoading && active?.imageUrl && heroImageUrl ? (
          <BeforeAfterSlider
            beforeSrc={heroImageUrl}
            afterSrc={active.imageUrl}
            beforeLabel="Original"
            afterLabel="Staged"
            position={sliderPos}
            onPositionChange={setSliderPos}
            fitParent
          />
        ) : !isLoading && active?.imageUrl ? (
          <div className="rounded-xl overflow-hidden bg-sr-cream-soft max-h-full max-w-full flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.img
                key={active.slot}
                src={active.imageUrl}
                alt={`Take ${active.slot}`}
                className="block max-w-full max-h-full w-auto h-auto object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </AnimatePresence>
          </div>
        ) : (
          // Loading state in slider mode: slider stays drag-able; hero stays
          // on the left; afterContent provides the pulsing orb on the right.
          <BeforeAfterSlider
            beforeSrc={heroImageUrl ?? ''}
            afterSrc={undefined}
            afterContent={loadingAfterContent}
            beforeLabel="Original"
            afterLabel="Staged"
            position={sliderPos}
            onPositionChange={setSliderPos}
            fitParent
          />
        )}
        </div>{/* /image area host */}

        {/* Chip strip — only shown when there is more than one expected variant */}
        {variants.length > 1 && (
          <div className="flex gap-2 justify-center px-2">
            {visibleChips.map((v, i) => {
              const isActive = v.slot === activeSlot;
              const variantIsLoading = v.status !== 'done';
              return (
                <button
                  key={v.slot}
                  type="button"
                  onClick={() => handleChipClick(v.slot)}
                  className={cn(
                    'flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] sm:text-[11px] font-semibold border transition-all',
                    isActive && !variantIsLoading &&
                      'bg-sr-terra/[0.12] text-sr-terra border-sr-terra/40',
                    isActive && variantIsLoading &&
                      'bg-sr-terra/[0.06] text-sr-terra border-sr-terra/40',
                    !isActive &&
                      'bg-sr-ink/[0.05] text-sr-ink/70 border-transparent hover:bg-sr-ink/[0.08]',
                  )}
                  aria-label={`Take ${i + 1}${isActive ? ' (active)' : ''}${variantIsLoading ? ' (loading)' : ''}`}
                >
                  {variantIsLoading && (
                    <span className="size-2 border-[1.5px] border-sr-terra/30 border-t-sr-terra rounded-full animate-spin" />
                  )}
                  Take {i + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
