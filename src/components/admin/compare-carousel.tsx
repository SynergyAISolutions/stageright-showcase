'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { cn } from '@/lib/utils/cn';

export interface CarouselVariant {
  id: string;
  provider: 'gemini' | 'openai';
  quality: 'low' | 'medium' | 'high' | null;
  analysisMode: 'full' | 'lean-direct';
  promptMode?: 'hero-only' | 'spatial-ref';
  label: string;
  shortLabel: string;
  costAud: number;
}

export interface CarouselJob {
  jobId: string;
  style: string;
  provider: 'gemini' | 'openai';
  quality: 'low' | 'medium' | 'high' | null;
  analysisMode: 'full' | 'lean-direct';
  promptMode?: 'hero-only' | 'spatial-ref';
  status: 'pending' | 'running' | 'done' | 'error';
  imageUrl?: string;
  error?: string;
}

interface CompareCarouselProps {
  heroSrc: string;
  styles: string[];
  variants: CarouselVariant[];
  jobs: CarouselJob[];
  analysisCostAud?: number;
}

function isSameVariant(j: CarouselJob, v: CarouselVariant) {
  return j.provider === v.provider &&
    j.quality === v.quality &&
    j.analysisMode === v.analysisMode &&
    (!j.promptMode || !v.promptMode || j.promptMode === v.promptMode);
}

interface Slot {
  style: string;
  variant: CarouselVariant;
  job?: CarouselJob;
}

export function CompareCarousel({ heroSrc, styles, variants, jobs }: CompareCarouselProps) {
  // Flat sequence: every (style, variant) pair in display order. Includes
  // pending and errored slots so navigation always covers the full grid.
  const sequence = useMemo<Slot[]>(() => {
    const out: Slot[] = [];
    for (const style of styles) {
      for (const variant of variants) {
        const job = jobs.find((j) => j.style === style && isSameVariant(j, variant));
        out.push({ style, variant, job });
      }
    }
    return out;
  }, [styles, variants, jobs]);

  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, Math.max(0, sequence.length - 1));
  const active = sequence[safeIdx];

  // The BeforeAfterSlider stays mounted across navigation so the user's
  // drag position persists. We swap only its afterSrc when the user moves
  // to a different DONE variant. For pending/error slots we keep the last
  // valid image showing under a status overlay so the slider position is
  // never lost — the slot just feels temporarily covered.
  const activeImageUrl = active?.job?.status === 'done' ? active.job.imageUrl : undefined;
  const [lastValidImageUrl, setLastValidImageUrl] = useState<string | undefined>(activeImageUrl);
  useEffect(() => {
    if (activeImageUrl) setLastValidImageUrl(activeImageUrl);
  }, [activeImageUrl]);

  const goPrev = useCallback(() => {
    if (sequence.length === 0) return;
    setIdx((i) => (i - 1 + sequence.length) % sequence.length);
  }, [sequence.length]);
  const goNext = useCallback(() => {
    if (sequence.length === 0) return;
    setIdx((i) => (i + 1) % sequence.length);
  }, [sequence.length]);
  const goTo = useCallback((target: number) => setIdx(target), []);

  // Keyboard nav. Skip when the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  if (sequence.length === 0 || !active) return null;

  const status = active.job?.status ?? 'pending';
  // No matching job means this slot was never run in this comparison —
  // typically the new lean variants viewed inside an old saved run that
  // pre-dated them. Render a clear "not run" state so the user doesn't
  // think it's stuck pending forever.
  const hasJob = !!active.job;
  const showOverlay = !hasJob || status !== 'done';

  return (
    <div className="space-y-3">
      {/* Compact top label — style + cost on top line, model name on its own
          line beneath. Right column = position counter. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-brand-navy">
            <span className="font-heading text-lg sm:text-xl">{active.style}</span>
            <span className="ml-3 text-sm text-ink-muted tabular-nums">A${active.variant.costAud.toFixed(3)}</span>
          </p>
          <p className="text-sm font-medium text-brand-navy/80 mt-0.5 truncate">
            {active.variant.label}
          </p>
        </div>
        <p className="text-sm text-ink-muted tabular-nums shrink-0 mt-1">
          {safeIdx + 1} / {sequence.length}
        </p>
      </div>

      {/* Big stage — black canvas, slider fills the box. Single mounted
          slider instance so drag position carries between slides. */}
      <div
        className="relative bg-black rounded-2xl overflow-hidden flex items-center justify-center"
        style={{ height: 'min(80vh, calc(100vw * 0.62))', containerType: 'size' }}
      >
        {lastValidImageUrl ? (
          <BeforeAfterSlider
            beforeSrc={heroSrc}
            afterSrc={lastValidImageUrl}
            beforeLabel="Original"
            afterLabel={active.variant.shortLabel}
            fitParent
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3">
            <div className="size-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-sm">Waiting for the first image…</p>
          </div>
        )}

        {/* Pending / error / not-run overlay for the CURRENT slot. Sits
            over the persistent slider so its drag position is preserved
            underneath. */}
        {showOverlay && lastValidImageUrl && (
          <div className="absolute inset-0 bg-black/72 backdrop-blur-[3px] flex flex-col items-center justify-center text-white px-6 text-center">
            {!hasJob ? (
              <>
                <p className="text-sm font-semibold text-white/85">Not generated in this run</p>
                <p className="text-xs text-white/60 mt-1 max-w-md leading-snug">
                  This run was created before this variant existed. Start a new run to include it.
                </p>
              </>
            ) : status === 'error' ? (
              <>
                <p className="text-sm font-semibold text-red-300">Generation failed</p>
                <p className="text-xs text-white/65 mt-1 max-w-md leading-snug">{active.job?.error}</p>
              </>
            ) : (
              <>
                <div className="size-10 rounded-full border-2 border-white/20 border-t-white animate-spin mb-2" />
                <p className="text-sm">Still generating…</p>
              </>
            )}
            <p className="text-[11px] text-white/45 mt-3">
              Showing the last completed image · slide to navigate
            </p>
          </div>
        )}

        {/* Prev arrow */}
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous"
          className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 size-12 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {/* Next arrow */}
        <button
          type="button"
          onClick={goNext}
          aria-label="Next"
          className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 size-12 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-sm transition-colors active:scale-95"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Position dots — grouped by style with extra gap between styles so
          you can tell at a glance where the row boundaries are. */}
      <div className="flex justify-center items-center gap-1.5 flex-wrap">
        {sequence.map((slot, i) => {
          const isFirstOfStyle = i > 0 && sequence[i - 1].style !== slot.style;
          const stateCls =
            !slot.job ? 'bg-brand-navy/15 hover:bg-brand-navy/30' :
            slot.job.status === 'error' ? 'bg-red-500/70 hover:bg-red-500/90' :
            slot.job.status === 'done' ? 'bg-brand-navy/40 hover:bg-brand-navy/70' :
            'bg-amber-500/60 animate-pulse';
          const activeCls = i === safeIdx ? 'bg-brand-navy w-6' : stateCls;
          return (
            <button
              key={`${slot.style}-${slot.variant.id}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${slot.style} ${slot.variant.shortLabel}`}
              title={`${slot.style} · ${slot.variant.shortLabel}`}
              className={cn('size-2 rounded-full transition-all', isFirstOfStyle && 'ml-3', activeCls)}
            />
          );
        })}
      </div>

      <p className="text-[11px] text-ink-muted text-center">
        Keyboard <span className="font-mono">←→</span> · click dots to jump · drag the slider divider to compare with the original
      </p>
    </div>
  );
}
