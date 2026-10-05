'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { FirstStageWelcomeToast } from '@/components/staging/first-stage-welcome-toast';
import { BonusCreditEnvelope } from '@/components/staging/bonus-credit-envelope';
import { VariantCarousel } from '@/components/staging/variant-carousel';
import { type StagingStyle } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';
import type { VariantSlot, Bundle } from '@/types';

export interface BatchResultVariant {
  slot: VariantSlot;
  jobId: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';
  imageUrl?: string;
  s3Key?: string;
  error?: string;
  conciergeNotes?: string[];
}

export interface BatchResultSubJob {
  style: StagingStyle;
  status: 'pending' | 'running' | 'done' | 'error';
  variants: BatchResultVariant[];
  coverSlot?: VariantSlot;
  bonusTriggered?: boolean;
  bonusStageCount?: number;
  jobId?: string;
  imageUrl?: string;
  s3Key?: string;
  error?: string;
  conciergeNotes?: string[];
}

export interface BatchResultProps {
  originalImageUrl: string;
  roomTypeLabel: string;
  total: number;
  completed: number;
  failed: number;
  subJobs: BatchResultSubJob[];
  refundedCredits: number;
  allTerminal: boolean;
  heroS3Key: string | null;
  roomTypes: string[];
  isFirstStage: boolean;
  bundle: Bundle;
  batchId: string;
  listingId?: string;
}

type ViewMode = 'slider' | 'compare';

export function BatchResult({
  originalImageUrl,
  roomTypeLabel,
  total,
  completed,
  failed,
  subJobs,
  refundedCredits,
  allTerminal: _allTerminal,
  heroS3Key,
  roomTypes,
  isFirstStage,
  bundle: _bundle,
  batchId,
  listingId,
}: BatchResultProps) {
  const firstReady = useMemo(
    () => subJobs.find((s) => s.variants.some((v) => v.status === 'done' && v.imageUrl)),
    [subJobs],
  );

  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  // Which take the user is currently viewing, per style. Lifted out of
  // VariantCarousel so the Download button can target the right variant —
  // previously downloads always used `coverSlot`, ignoring chip clicks.
  const [activeSlotByStyle, setActiveSlotByStyle] = useState<Record<string, VariantSlot>>({});

  useEffect(() => {
    if (!activeStyle && firstReady) setActiveStyle(firstReady.style);
  }, [activeStyle, firstReady]);

  const active = subJobs.find((s) => s.style === activeStyle) ?? firstReady ?? null;
  const hasMultipleStyles = subJobs.length > 1;
  const activeViewedSlot = active ? activeSlotByStyle[active.style] : undefined;

  const newStyleHref = heroS3Key
    ? `/stage?hero=${encodeURIComponent(heroS3Key)}&rooms=${encodeURIComponent(roomTypes.join(','))}${
        listingId ? `&listingId=${encodeURIComponent(listingId)}` : ''
      }`
    : '/stage';

  const tryAnotherHref = newStyleHref;

  const [compareMode, setCompareMode] = useState(true);

  const hasRevealedRef = useRef(false);
  const isFirstReveal =
    active?.style === firstReady?.style &&
    active?.variants.some((v) => v.status === 'done') &&
    !hasRevealedRef.current;
  if (isFirstReveal) hasRevealedRef.current = true;

  const [showWelcome, setShowWelcome] = useState(isFirstStage);
  useEffect(() => {
    if (isFirstStage) setShowWelcome(true);
  }, [isFirstStage]);

  const [showBonusEnvelope, setShowBonusEnvelope] = useState(false);
  const celebratedStylesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      active?.bonusTriggered &&
      active.style &&
      !celebratedStylesRef.current.has(active.style)
    ) {
      celebratedStylesRef.current.add(active.style);
      setShowBonusEnvelope(true);
    }
  }, [active]);

  // The variant Download targets. Priority order:
  //   1. The take the user is currently viewing (chip click) — matches what
  //      they see in the slider/compare view.
  //   2. The first done variant by slot — matches VariantCarousel's default
  //      display, so Download targets what's on screen even before the user
  //      touches a chip.
  //   3. Any done variant — last-ditch fallback.
  // Bug fixed 2026-05-04: previously this checked `coverSlot` (the persisted
  // cover, often slot 3), so clicking chip Take 1 then Download would
  // download Take 3.
  const activeDownloadVariant = useMemo(() => {
    if (!active) return null;
    if (activeViewedSlot != null) {
      const v = active.variants.find(
        (vv) => vv.slot === activeViewedSlot && vv.status === 'done' && vv.s3Key,
      );
      if (v) return v;
    }
    const sortedDone = [...active.variants]
      .filter((v) => v.status === 'done' && v.s3Key)
      .sort((a, b) => a.slot - b.slot);
    if (sortedDone[0]) return sortedDone[0];
    return active.variants.find((v) => v.status === 'done') ?? null;
  }, [active, activeViewedSlot]);

  const downloadState: 'ready' | 'cooking' | 'failed' = useMemo(() => {
    if (!active) return 'cooking';
    if (active.variants.some((v) => v.status === 'done')) return 'ready';
    if (active.status === 'error') return 'failed';
    return 'cooking';
  }, [active]);

  const downloadHref =
    downloadState === 'ready' && activeDownloadVariant?.s3Key && active
      ? `/api/download?key=${encodeURIComponent(activeDownloadVariant.s3Key)}&style=${encodeURIComponent(active.style)}${
          roomTypes.length > 0 ? `&rooms=${encodeURIComponent(roomTypes.join(','))}` : ''
        }${listingId && listingId !== 'unsorted' ? `&listingId=${encodeURIComponent(listingId)}` : ''}`
      : null;

  // Style summaries for thumbnail rail/strip — first done variant is the cover preview.
  const styleSummaries = useMemo(
    () =>
      subJobs.map((s) => ({
        style: s.style,
        coverUrl:
          s.variants.find((v) => v.status === 'done' && v.imageUrl)?.imageUrl ?? null,
        status: s.status,
      })),
    [subJobs],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <main className="flex-1 min-h-0 mx-auto w-full max-w-3xl lg:max-w-6xl px-5 sm:px-8 py-4 sm:py-6 flex flex-col">
        {/* Eyebrow + Headline + Meta — sits at top, centred on mobile, left on desktop */}
        <div className="flex-shrink-0 text-center lg:text-left mb-3 sm:mb-4">
          <p className="text-[9px] sm:text-[10px] tracking-[0.10em] uppercase text-sr-ink-mute font-semibold mb-1">
            Your staged {roomTypeLabel.toLowerCase()}
          </p>
          {active ? (
            <h1 className="font-display text-xl sm:text-2xl lg:text-[32px] text-sr-ink leading-[1.05] tracking-[-0.02em] font-normal">
              <em className="text-sr-terra italic">{active.style}</em>
              <span className="text-sr-ink-soft"> · {roomTypeLabel}</span>
            </h1>
          ) : (
            <h1 className="font-display text-xl sm:text-2xl text-sr-ink leading-[1.05] tracking-[-0.02em]">
              Cooking your <em className="text-sr-terra italic">stages</em>&hellip;
            </h1>
          )}
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-sr-ink-mute">
            {hasMultipleStyles
              ? `${completed} of ${total} takes ready`
              : `${completed} of ${total} ${total === 1 ? 'take' : 'takes'} ready`}
            {failed > 0 && ` · ${failed} failed`}
            {refundedCredits > 0 &&
              ` · ${refundedCredits} credit${refundedCredits === 1 ? '' : 's'} refunded`}
          </p>
        </div>

        {/* View mode toggle — centred above image. White pill on cream
            background, ink-on-white active state, with mode icons so the
            toggle is impossible to miss. */}
        <div className="flex-shrink-0 flex justify-center lg:justify-start mb-3 sm:mb-4">
          <div className="inline-flex bg-white rounded-full p-1 border border-sr-hairline shadow-soft">
            <button
              type="button"
              onClick={() => setViewMode('slider')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all',
                viewMode === 'slider'
                  ? 'bg-sr-ink text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)]'
                  : 'text-sr-ink-mute hover:text-sr-ink',
              )}
              aria-pressed={viewMode === 'slider'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="1.5" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7 3v8" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="7" cy="7" r="1.5" fill="currentColor" />
              </svg>
              Slider
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compare')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all',
                viewMode === 'compare'
                  ? 'bg-sr-ink text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)]'
                  : 'text-sr-ink-mute hover:text-sr-ink',
              )}
              aria-pressed={viewMode === 'compare'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="1" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="8" y="3" width="5" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              Compare
            </button>
          </div>
        </div>

        {/* Main content grid: image area (+ vertical style rail on lg+).
            grid-rows-[minmax(0,1fr)] locks the row to the available flex
            height so neither child can grow beyond the viewport — both the
            image area and the rail get `min-h: 0` from this row context. */}
        <div
          className={cn(
            'flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 lg:gap-5',
            hasMultipleStyles && 'lg:grid-cols-[1fr_220px]',
          )}
        >
          {/* Image area + take chips */}
          <div className="flex flex-col min-h-0">
            {active ? (
              <>
                <div className="flex-1 min-h-0">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${active.style}-${viewMode}`}
                      className="h-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <VariantCarousel
                        className="h-full"
                        heroImageUrl={originalImageUrl}
                        variants={active.variants.map((v) => ({
                          slot: v.slot,
                          status: v.status,
                          imageUrl: v.imageUrl,
                          arrivedAt: v.status === 'done' ? v.slot : undefined,
                        }))}
                        activeSlot={activeViewedSlot}
                        onActiveSlotChange={(slot) => {
                          setActiveSlotByStyle((prev) => ({ ...prev, [active.style]: slot }));
                        }}
                        coverSlot={active.coverSlot}
                        onCoverChange={async (slot: VariantSlot) => {
                          try {
                            await fetch('/api/jobs/batch/cover', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                batchId,
                                style: active.style,
                                slot,
                              }),
                            });
                          } catch (err) {
                            console.warn('[batch-result] cover swap failed', err);
                          }
                        }}
                        compareMode={compareMode}
                        onCompareModeChange={setCompareMode}
                        viewMode={viewMode === 'compare' ? 'split' : 'slider'}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
                {active.variants.some((v) => v.status === 'failed_after_retry') && (
                  <p className="mt-2 text-xs text-sr-terra text-center flex-shrink-0">
                    +1 credit refunded &mdash; one of the takes didn&apos;t come through this
                    time.
                  </p>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="aspect-[4/3] w-full max-w-[640px] rounded-2xl border border-dashed border-sr-hairline bg-white flex items-center justify-center text-sm text-sr-ink-mute">
                  Cooking your first stage&hellip;
                </div>
              </div>
            )}
          </div>

          {/* Style rail — desktop only. 2-col grid with auto-distributed
              rows so the rail fills the available column height without ever
              needing a scrollbar. Cells get a touch shorter when there are
              many styles, but every style stays visible at once. */}
          {hasMultipleStyles && (
            <div className="hidden lg:flex flex-col min-h-0 max-h-full">
              <p className="text-[10px] tracking-[0.10em] uppercase text-sr-ink-mute font-semibold mb-2 flex-shrink-0">
                Styles
              </p>
              <div
                className="grid grid-cols-2 gap-2 flex-1 min-h-0"
                style={{ gridAutoRows: 'minmax(0, 1fr)' }}
              >
                {styleSummaries.map((s) => (
                  <StyleCell
                    key={s.style}
                    style={s.style}
                    coverUrl={s.coverUrl}
                    isActive={s.style === activeStyle}
                    onClick={() => setActiveStyle(s.style)}
                    vertical
                  />
                ))}
                <Link
                  href={newStyleHref}
                  className="rounded-xl border-2 border-dashed border-sr-terra/40 bg-sr-terra/[0.04] hover:bg-sr-terra/[0.10] hover:border-sr-terra/60 transition-colors flex flex-col items-center justify-center text-sr-terra text-center p-1 min-h-0"
                >
                  <span className="text-lg leading-none mb-0.5" aria-hidden>
                    +
                  </span>
                  <span className="text-[8.5px] font-bold tracking-[0.06em] uppercase">
                    New
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Style strip — mobile/tablet horizontal, lg:hidden */}
        {hasMultipleStyles && (
          <div className="flex-shrink-0 lg:hidden mt-3">
            <div
              className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2"
              style={{ scrollbarWidth: 'none' }}
            >
              {styleSummaries.map((s) => (
                <StyleCell
                  key={s.style}
                  style={s.style}
                  coverUrl={s.coverUrl}
                  isActive={s.style === activeStyle}
                  onClick={() => setActiveStyle(s.style)}
                />
              ))}
              <Link
                href={newStyleHref}
                className="flex-shrink-0 w-[88px] aspect-[4/3] rounded-xl border-2 border-dashed border-sr-terra/40 bg-sr-terra/[0.04] hover:bg-sr-terra/[0.10] hover:border-sr-terra/60 transition-colors flex flex-col items-center justify-center text-sr-terra text-center"
              >
                <span className="text-lg leading-none mb-0.5" aria-hidden>
                  +
                </span>
                <span className="text-[8.5px] font-bold tracking-[0.06em] uppercase">
                  New
                </span>
              </Link>
            </div>
          </div>
        )}

        {/* 3-button footer */}
        <footer
          className="flex-shrink-0 grid grid-cols-3 gap-2 sm:gap-3 mt-3 sm:mt-4"
          style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
        >
          {downloadState === 'ready' && downloadHref ? (
            <a
              href={downloadHref}
              className="h-11 sm:h-12 inline-flex items-center justify-center gap-1.5 bg-sr-terra text-white font-semibold text-xs sm:text-sm rounded-full hover:bg-sr-terra/90 transition-colors whitespace-nowrap"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Download
            </a>
          ) : downloadState === 'cooking' ? (
            <button
              type="button"
              disabled
              aria-label="Image still cooking — download will be available when ready"
              className="h-11 sm:h-12 inline-flex items-center justify-center gap-1.5 bg-sr-terra/30 text-white font-semibold text-xs sm:text-sm rounded-full whitespace-nowrap cursor-not-allowed"
            >
              <span className="size-3 border-[1.5px] border-white/40 border-t-white rounded-full animate-spin" />
              Cooking&hellip;
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-label="This take failed"
              className="h-11 sm:h-12 inline-flex items-center justify-center gap-1.5 bg-sr-ink/10 text-sr-ink-mute font-semibold text-xs sm:text-sm rounded-full whitespace-nowrap cursor-not-allowed"
            >
              Take failed
            </button>
          )}
          <Link
            href={tryAnotherHref}
            className="h-11 sm:h-12 inline-flex items-center justify-center gap-1.5 bg-sr-sage-deep text-white font-semibold text-xs sm:text-sm rounded-full hover:bg-sr-sage-deep/90 transition-colors whitespace-nowrap"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M7 3v8M3 7h8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            More styles
          </Link>
          <Link
            href={listingId && listingId !== 'unsorted' ? `/listings/${listingId}` : '/dashboard'}
            className="h-11 sm:h-12 inline-flex items-center justify-center gap-1.5 bg-white text-sr-ink font-semibold text-xs sm:text-sm border border-sr-ink/[0.10] rounded-full hover:bg-sr-cream-soft transition-colors whitespace-nowrap"
          >
            Done
          </Link>
        </footer>
      </main>

      <AnimatePresence>
        {showWelcome && active?.variants.some((v) => v.status === 'done') && (
          <FirstStageWelcomeToast onDismiss={() => setShowWelcome(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBonusEnvelope && (
          <BonusCreditEnvelope onDismiss={() => setShowBonusEnvelope(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Single style cell for the thumbnail rail (vertical on lg+) or strip (horizontal on smaller).
 * Renders the staged-image cover for that style + the style label overlaid bottom-left.
 * Active = terra outline + checkmark badge top-right.
 */
function StyleCell({
  style,
  coverUrl,
  isActive,
  onClick,
  vertical = false,
}: {
  style: string;
  coverUrl: string | null;
  isActive: boolean;
  onClick: () => void;
  vertical?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex-shrink-0 group rounded-xl overflow-hidden border-2 transition-all bg-sr-cream-soft',
        isActive
          ? 'border-sr-terra shadow-[0_4px_12px_-4px_rgba(199,111,78,0.4)]'
          : 'border-transparent hover:border-sr-terra/40',
        vertical
          ? // In the desktop 2-col grid, fill the auto-sized grid cell so
            // rows distribute evenly across the rail's available height.
            'w-full h-full min-h-0'
          : 'w-[88px] sm:w-[96px] aspect-[4/3]',
      )}
      aria-pressed={isActive}
      aria-label={`${style}${isActive ? ' (active)' : ''}`}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={style}
          fill
          sizes="(max-width: 1024px) 96px, 160px"
          className="object-cover"
        />
      ) : (
        <div className="size-full grid place-items-center text-[9px] text-sr-ink-mute uppercase tracking-[0.06em]">
          Cooking&hellip;
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-1.5 py-1">
        <p className="text-[9px] sm:text-[10px] font-bold text-white truncate uppercase tracking-[0.04em]">
          {style}
        </p>
      </div>
      {isActive && (
        <span
          className="absolute top-1.5 right-1.5 size-4 bg-sr-terra rounded-full grid place-items-center"
          aria-hidden
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 4l1.8 1.8L6.5 2.5"
              stroke="white"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </button>
  );
}
