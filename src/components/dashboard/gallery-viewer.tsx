'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { StyleSwitcherTrigger } from '@/components/dashboard/style-switcher-trigger';

type ViewMode = 'slider' | 'compare';

interface Variant {
  id: string;
  sk: string;
  sessionId: string;
  style: string;
  stagedUrl: string;
  stagedS3Key: string;
  editInstruction: string | null;
  createdAt: string;
}

interface StyleGroup {
  style: string;
  variants: Variant[];
  latestAt: string;
}

export interface UploadGroup {
  heroS3Key: string;
  heroUrl: string | null;
  coverUrl: string;
  /** stagedS3Key of the manually-chosen room cover, if set. The viewer opens
   * to this variant instead of the newest one. */
  coverStagedS3Key?: string;
  roomTypes: string[];
  styles: StyleGroup[];
  totalVariants: number;
  createdAt: string;
  /** Listing context threaded from the most-recent staging in this group.
   * Used by "Try another style" to keep the user inside their listing. */
  listingId?: string;
}

interface FlatVariant extends Variant {
  indexInStyle: number;
  styleTotal: number;
}

interface StyleRange {
  style: string;
  start: number;
  count: number;
}

interface GalleryViewerProps {
  upload: UploadGroup | null;
  onClose: () => void;
  /** Delete the entire upload (hero + all variants). */
  onDelete: () => Promise<void>;
  /** Delete one specific variant. Optional — if omitted, only whole-upload delete is offered. */
  onDeleteVariant?: (variant: Variant) => Promise<void>;
  deleting: boolean;
  /** Set the active staged image as this room's cover (tile + default-open).
   * Only wired in a listing context. */
  onSetRoomCover?: (stagedS3Key: string) => Promise<void>;
  /** Set the active staged image as the whole property's cover (dashboard
   * listing tile). Only wired in a listing context. */
  onSetPropertyCover?: (stagedS3Key: string) => Promise<void>;
}

function buildFlat(upload: UploadGroup) {
  const flat: FlatVariant[] = [];
  const ranges: StyleRange[] = [];
  let globalIndex = 0;
  for (const group of upload.styles) {
    ranges.push({ style: group.style, start: globalIndex, count: group.variants.length });
    group.variants.forEach((v, i) => {
      flat.push({ ...v, indexInStyle: i, styleTotal: group.variants.length });
      globalIndex++;
    });
  }
  return { flat, ranges };
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0 }),
};

export function GalleryViewer({ upload, onClose, onDelete, onDeleteVariant, deleting, onSetRoomCover, onSetPropertyCover }: GalleryViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [sliderPos, setSliderPos] = useState(50);
  const [heroOrientation, setHeroOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeStyleName, setActiveStyleName] = useState<string>(
    upload?.styles?.[0]?.style ?? '',
  );
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const styleMenuRef = useRef<HTMLDivElement>(null);
  // When opening to a chosen room cover whose take isn't index 0, stash the
  // target index here so the activeStyleName-change reset (which normally
  // snaps the take back to 0) applies it instead of clobbering it.
  const pendingVariantIdxRef = useRef<number | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const [coverSaved, setCoverSaved] = useState<'room' | 'property' | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Close the desktop popovers on outside-click. Each popover guards itself
  // — the ⋯ overflow and the style switcher are independent surfaces.
  useEffect(() => {
    if (!menuOpen && !styleMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (styleMenuOpen && styleMenuRef.current && !styleMenuRef.current.contains(e.target as Node)) {
        setStyleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen, styleMenuOpen]);

  useEffect(() => {
    if (upload) {
      setDirection(0);
      setConfirmingDelete(false);
      setViewMode('slider');
      setMenuOpen(false);
      setStyleMenuOpen(false);
      setCoverSaved(null);

      // Open to the chosen room cover variant if one is set; otherwise the
      // first (newest) style + take. Resolve its style, take index, and global
      // flat index so the slider, style switcher, and take chips all agree.
      let openStyle = upload.styles?.[0]?.style ?? '';
      let openVariantIdx = 0;
      let openFlatIdx = 0;
      if (upload.coverStagedS3Key) {
        let gi = 0;
        let found = false;
        for (const s of upload.styles ?? []) {
          for (let i = 0; i < s.variants.length; i++) {
            if (s.variants[i].stagedS3Key === upload.coverStagedS3Key) {
              openStyle = s.style;
              openVariantIdx = i;
              openFlatIdx = gi;
              found = true;
              break;
            }
            gi++;
          }
          if (found) break;
        }
      }
      pendingVariantIdxRef.current = openVariantIdx;
      setActiveStyleName(openStyle);
      setActiveVariantIndex(openVariantIdx);
      setActive(openFlatIdx);
    }
    // Identity by heroS3Key — we only want to reset when a different upload is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload?.heroS3Key]);

  // Detect hero image orientation for compare-mode layout (landscape stacks
  // on mobile, portrait goes side-by-side everywhere). Same pattern as
  // VariantCarousel on the reveal page.
  useEffect(() => {
    if (!upload?.heroUrl) return;
    const img = new window.Image();
    img.onload = () => {
      setHeroOrientation(
        img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait',
      );
    };
    img.src = upload.heroUrl;
  }, [upload?.heroUrl]);

  const { flat, ranges } = useMemo(() => {
    if (!upload) return { flat: [] as FlatVariant[], ranges: [] as StyleRange[] };
    return buildFlat(upload);
  }, [upload]);

  const current = flat[active];
  const currentRange = useMemo(
    () => (current ? ranges.find((r) => r.style === current.style) ?? null : null),
    [current, ranges],
  );

  const goTo = useCallback((next: number) => {
    setActive((prev) => {
      const clamped = Math.max(0, Math.min(flat.length - 1, next));
      setDirection(clamped > prev ? 1 : clamped < prev ? -1 : 0);
      return clamped;
    });
  }, [flat.length]);

  const goPrev = useCallback(() => goTo(active - 1), [active, goTo]);
  const goNext = useCallback(() => goTo(active + 1), [active, goTo]);

  const jumpToStyle = useCallback((style: string) => {
    const r = ranges.find((x) => x.style === style);
    if (r) goTo(r.start);
  }, [ranges, goTo]);

  // Reset active take when the style changes. Honour a pending index from the
  // open-to-cover path (set in the upload effect); otherwise snap to take 0,
  // which is the correct behaviour for a user-driven style switch.
  useEffect(() => {
    setActiveVariantIndex(pendingVariantIdxRef.current ?? 0);
    pendingVariantIdxRef.current = null;
  }, [activeStyleName]);

  const activeStyleGroup = upload?.styles.find((s) => s.style === activeStyleName);
  const variants = activeStyleGroup?.variants ?? [];
  const activeVariant = variants[activeVariantIndex] ?? null;
  const showTakeChips = variants.length > 1;

  const hasMultipleStyles = (upload?.styles?.length ?? 0) > 1;
  const activeStyleIndex = Math.max(
    0,
    upload?.styles?.findIndex((s) => s.style === activeStyleName) ?? 0,
  );

  // Cover picking is only meaningful inside a real listing (the dashboard tile
  // and the room tile both live there). Hidden in the global / unsorted views.
  const canSetCover = !!(
    upload?.listingId &&
    upload.listingId !== 'unsorted' &&
    activeVariant
  );

  const handleSetCover = useCallback(
    async (which: 'room' | 'property') => {
      if (!activeVariant) return;
      const fn = which === 'room' ? onSetRoomCover : onSetPropertyCover;
      if (!fn) return;
      setSavingCover(true);
      try {
        await fn(activeVariant.stagedS3Key);
        setCoverSaved(which);
        // Brief in-menu confirmation, then close.
        setTimeout(() => {
          setCoverSaved(null);
          setMenuOpen(false);
        }, 1100);
      } catch {
        // Non-critical (demo affordance) — swallow.
      } finally {
        setSavingCover(false);
      }
    },
    [activeVariant, onSetRoomCover, onSetPropertyCover],
  );

  const newStyleHref = upload?.listingId
    ? `/stage?listingId=${encodeURIComponent(upload.listingId)}&heroS3Key=${encodeURIComponent(upload.heroS3Key)}`
    : `/stage?heroS3Key=${encodeURIComponent(upload?.heroS3Key ?? '')}`;

  // Keyboard navigation — suppressed while a confirm dialog is open
  useEffect(() => {
    if (!upload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpen) { setMenuOpen(false); return; }
        if (styleMenuOpen) { setStyleMenuOpen(false); return; }
        if (confirmingDelete) setConfirmingDelete(false);
        else onClose();
        return;
      }
      if (confirmingDelete) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [upload, goPrev, goNext, onClose, confirmingDelete, menuOpen, styleMenuOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!upload) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [upload]);

  if (!mounted) return null;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -80 || velocity.x < -500) goNext();
    else if (offset.x > 80 || velocity.x > 500) goPrev();
  };

  const downloadHref = activeVariant && upload
    ? `/api/download?key=${encodeURIComponent(activeVariant.stagedS3Key)}&style=${encodeURIComponent(activeStyleName)}${(upload.roomTypes?.length ?? 0) > 0 ? `&rooms=${encodeURIComponent(upload.roomTypes.join(','))}` : ''}${upload.listingId && upload.listingId !== 'unsorted' ? `&listingId=${encodeURIComponent(upload.listingId)}` : ''}`
    : '#';

  return createPortal(
    <AnimatePresence>
      {upload && (
        <motion.div
          key="gallery-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="Staged image viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-sr-cream flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Top chrome — both controls right-aligned: ⋯ overflow then ×
              close. Matches the user-menu convention (actions live
              top-right everywhere in the app) so "more actions" doesn't
              jump sides between surfaces. */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0 relative">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="size-9 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none font-bold"
              >
                ⋯
              </button>

              {/* Desktop popover — anchored under the trigger, right-origin
                  now that the trigger sits on the right. Mirrors the
                  user-menu's positioning + motion. Hidden on mobile in
                  favour of the bottom sheet (thumb reach). Utilities up
                  top, divider, destructives at the bottom. */}
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, scale: 0.96, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -6 }}
                    transition={{ duration: 0.14 }}
                    className="hidden sm:block absolute right-0 top-full mt-2 w-60 rounded-xl bg-white border border-sr-hairline shadow-[0_18px_48px_-12px_rgba(31,53,57,0.18)] overflow-hidden origin-top-right z-50 p-1.5"
                  >
                    <MenuLink
                      href="/dashboard/listing-copy"
                      onNavigate={() => setMenuOpen(false)}
                      label="Listing copy"
                    />
                    {canSetCover && onSetRoomCover && (
                      <CoverMenuItem
                        icon="star"
                        onClick={() => handleSetCover('room')}
                        disabled={savingCover}
                        label={coverSaved === 'room' ? 'Saved ✓' : 'Set as room cover'}
                      />
                    )}
                    {canSetCover && onSetPropertyCover && (
                      <CoverMenuItem
                        icon="home"
                        onClick={() => handleSetCover('property')}
                        disabled={savingCover}
                        label={coverSaved === 'property' ? 'Saved ✓' : 'Set as property cover'}
                      />
                    )}
                    <div className="my-1.5 -mx-1.5 border-t border-sr-hairline" />
                    {activeVariant && onDeleteVariant && (
                      <MenuItem
                        onClick={async () => {
                          setMenuOpen(false);
                          await onDeleteVariant(activeVariant);
                        }}
                        disabled={deleting}
                        label="Delete this take"
                        danger
                      />
                    )}
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmingDelete(true);
                      }}
                      disabled={deleting}
                      label="Delete this room"
                      danger
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="size-9 rounded-full bg-sr-ink/[0.06] hover:bg-sr-ink/[0.12] text-sr-ink flex items-center justify-center transition-colors text-base leading-none"
            >
              ×
            </button>
          </div>

          <main className="flex-1 min-h-0 mx-auto w-full max-w-3xl lg:max-w-6xl px-5 sm:px-8 py-3 sm:py-4 flex flex-col overflow-hidden">
            {/* Eyebrow + headline. Heading IS the style switcher when there's
                more than one style: the style name plus a small hairline pill
                ("2 of 3 styles" + chevron) so it reads as the room's main
                menu, not just a title (StyleSwitcherTrigger). Clicking opens
                a popover (desktop, eyebrowed "Styles in this room") or bottom
                sheet (mobile) with the full list. A long name wraps the pill
                onto its own line, centred below lg. Single-style case:
                heading is static text, no pill, no affordance. */}
            <div className="flex-shrink-0 text-center lg:text-left mb-3 sm:mb-4">
              <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.16em] uppercase text-sr-ink-mute font-semibold mb-1">
                {upload?.roomTypes?.join(' · ') || 'Room'}
              </p>
              {hasMultipleStyles ? (
                <div ref={styleMenuRef} className="relative inline-block">
                  <StyleSwitcherTrigger
                    styleName={activeStyleName}
                    index={activeStyleIndex}
                    total={upload?.styles?.length ?? 0}
                    open={styleMenuOpen}
                    onToggle={() => setStyleMenuOpen((v) => !v)}
                  />

                  {/* Desktop popover — anchored under the heading */}
                  <AnimatePresence>
                    {styleMenuOpen && (
                      <motion.div
                        role="menu"
                        initial={{ opacity: 0, scale: 0.96, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -6 }}
                        transition={{ duration: 0.14 }}
                        className="hidden sm:block absolute left-0 top-full mt-2 w-64 max-h-[60vh] overflow-y-auto rounded-xl bg-sr-surface border border-sr-hairline shadow-[0_18px_48px_-12px_rgba(31,53,57,0.14)] origin-top-left z-50 p-1.5"
                      >
                        <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-sr-ink-mute font-semibold px-3 pt-1.5 pb-1">
                          Styles in this room
                        </p>
                        {(upload?.styles ?? []).map((s) => (
                          <StyleMenuItem
                            key={s.style}
                            label={s.style}
                            takesCount={s.variants.length}
                            active={s.style === activeStyleName}
                            onClick={() => {
                              setActiveStyleName(s.style);
                              setStyleMenuOpen(false);
                            }}
                          />
                        ))}
                        <div className="my-1.5 -mx-1.5 border-t border-sr-hairline" />
                        <Link
                          href={newStyleHref}
                          onClick={() => setStyleMenuOpen(false)}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-sr-terra hover:bg-sr-terra/[0.06] transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                            <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                          Add another style
                        </Link>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <h1 className="font-display text-xl sm:text-2xl lg:text-[32px] text-sr-ink leading-[1.05] tracking-[-0.02em] font-normal">
                  <em className="text-sr-terra italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}>
                    {activeStyleName}
                  </em>
                </h1>
              )}
            </div>

            {/* Slider/Compare toggle */}
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

            {/* Image area now spans full width on every breakpoint — the
                style rail/strip have been replaced by the dropdown in the
                heading above. grid-rows-[minmax(0,1fr)] lock keeps the image
                inside the viewport. */}
            <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 lg:gap-5">
              {/* Image area + take chips */}
              <div className="flex flex-col min-h-0">
                <div
                  className="flex-1 min-h-0 overflow-hidden flex items-center justify-center"
                  style={{ containerType: 'size' }}
                >
                  {viewMode === 'compare' ? (
                    <div
                      className={cn(
                        'grid gap-2 sm:gap-3 w-full h-full max-h-full',
                        heroOrientation === 'landscape'
                          ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'
                          : 'grid-cols-2 grid-rows-1',
                      )}
                    >
                      {/* Original */}
                      <div className="relative h-full rounded-xl overflow-hidden bg-sr-cream-soft">
                        {upload?.heroUrl && (
                          <img
                            src={upload.heroUrl}
                            alt="Original"
                            className="block w-full h-full object-contain"
                          />
                        )}
                        <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full bg-white text-[10px] font-bold tracking-[0.04em] uppercase text-sr-ink shadow-soft">
                          Original
                        </span>
                      </div>
                      {/* Staged */}
                      <div className="relative h-full rounded-xl overflow-hidden bg-sr-cream-soft">
                        {activeVariant?.stagedUrl && (
                          <AnimatePresence mode="wait">
                            <motion.img
                              key={activeVariant.id}
                              src={activeVariant.stagedUrl}
                              alt="Staged"
                              className="block w-full h-full object-contain"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            />
                          </AnimatePresence>
                        )}
                        <span className="absolute top-3 right-3 inline-flex items-center px-2.5 py-1 rounded-full bg-sr-terra text-[10px] font-bold tracking-[0.04em] uppercase text-white shadow-soft">
                          Staged
                        </span>
                      </div>
                    </div>
                  ) : (
                    <BeforeAfterSlider
                      beforeSrc={upload?.heroUrl ?? ''}
                      afterSrc={activeVariant?.stagedUrl ?? ''}
                      beforeLabel="Original"
                      afterLabel="Staged"
                      className="rounded-xl"
                      position={sliderPos}
                      onPositionChange={setSliderPos}
                      fitParent
                    />
                  )}
                </div>
                {showTakeChips && (
                  <div className="flex gap-2 justify-center flex-shrink-0 mt-2">
                    {variants.map((_v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveVariantIndex(i)}
                        className={cn(
                          'flex-shrink-0 px-3.5 py-2 rounded-full text-[10px] sm:text-[11px] font-semibold border transition-all',
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

            </div>

            {/* Single primary action — Download. Listing copy moved to the
                ⋯ menu (non-contextual, same for every image). "More styles"
                button removed because the "+ New" tile in the style strip
                is the same destination — having both was duplication. */}
            <footer
              className="flex-shrink-0 mt-3 sm:mt-4 flex justify-center"
              style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
            >
              <a
                href={downloadHref}
                className="h-11 sm:h-12 w-full sm:w-auto sm:min-w-[260px] inline-flex items-center justify-center gap-2 bg-sr-terra text-white font-semibold text-sm rounded-full hover:bg-sr-terra/90 transition-colors whitespace-nowrap px-6"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download
              </a>
            </footer>
          </main>

          {/* Delete confirmation */}
          <AnimatePresence>
            {confirmingDelete && upload && (
              <>
                <motion.div
                  key="confirm-scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => !deleting && setConfirmingDelete(false)}
                  className="absolute inset-0 z-20 bg-sr-ink/40 backdrop-blur-sm"
                />
                <motion.div
                  key="confirm-dialog"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none"
                  style={{
                    paddingTop: 'max(1rem, env(safe-area-inset-top))',
                    paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                  }}
                >
                <motion.div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="confirm-delete-title"
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 4 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(31,53,57,0.18)] p-5 sm:p-6 max-w-sm w-full pointer-events-auto"
                >
                  <h3
                    id="confirm-delete-title"
                    className="font-display text-lg text-sr-ink tracking-tight"
                  >
                    Delete this room?
                  </h3>
                  <p className="text-sm text-sr-ink-soft mt-1.5 leading-relaxed">
                    {`${upload.totalVariants} ${upload.totalVariants === 1 ? 'take' : 'takes'}${upload.styles.length > 1 ? ` across ${upload.styles.length} styles` : ''} will be permanently removed. This cannot be undone.`}
                  </p>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="flex-1 text-sm font-medium text-sr-ink bg-sr-cream hover:bg-sr-cream-soft px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onDelete()}
                      disabled={deleting}
                      className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] px-4 py-2.5 rounded-xl transition-all disabled:opacity-60"
                    >
                      {deleting ? (
                        <>
                          <div className="size-3.5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                          Deleting
                        </>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Mobile-only bottom sheet for the same overflow menu. The
              desktop popover lives anchored under the ⋯ button above; this
              one only renders on small screens for thumb reach. The sm:hidden
              wrapper guards both the scrim and the sheet. Whole-room delete
              now routes through the confirm dialog (was a one-tap delete). */}
          <AnimatePresence>
            {menuOpen && (
              <div className="sm:hidden">
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
                  className="fixed inset-x-0 bottom-0 z-[71] bg-sr-cream rounded-t-3xl shadow-[0_-12px_36px_-8px_rgba(31,53,57,0.2)] px-4 pt-3 pb-6"
                  style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
                >
                  <div className="mx-auto w-10 h-1 rounded-full bg-sr-ink/15 mb-4" aria-hidden />
                  <div className="space-y-2">
                    <Link
                      href="/dashboard/listing-copy"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-sr-ink bg-white border border-sr-hairline rounded-xl hover:bg-sr-cream-soft transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M3 1.5h5l3 3V12a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        <path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                      Listing copy
                    </Link>
                    {canSetCover && onSetRoomCover && (
                      <CoverSheetItem
                        icon="star"
                        onClick={() => handleSetCover('room')}
                        disabled={savingCover}
                        label={coverSaved === 'room' ? 'Saved ✓' : 'Set as room cover'}
                      />
                    )}
                    {canSetCover && onSetPropertyCover && (
                      <CoverSheetItem
                        icon="home"
                        onClick={() => handleSetCover('property')}
                        disabled={savingCover}
                        label={coverSaved === 'property' ? 'Saved ✓' : 'Set as property cover'}
                      />
                    )}
                    {activeVariant && onDeleteVariant && (
                      <SheetItem
                        onClick={async () => {
                          setMenuOpen(false);
                          await onDeleteVariant(activeVariant);
                        }}
                        disabled={deleting}
                        label="Delete this take"
                      />
                    )}
                    <SheetItem
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmingDelete(true);
                      }}
                      disabled={deleting}
                      label="Delete this room"
                    />
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      className="w-full px-4 py-3 text-sm font-medium text-sr-ink-soft hover:bg-sr-cream-soft rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Mobile-only bottom sheet for the style switcher. Mirrors the
              desktop popover pinned to the heading above; renders here so
              the trigger's centred-on-mobile alignment doesn't have to host
              a centred sheet. */}
          <AnimatePresence>
            {styleMenuOpen && (
              <div className="sm:hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setStyleMenuOpen(false)}
                  className="fixed inset-0 bg-sr-ink/40 backdrop-blur-sm z-[70]"
                  aria-hidden
                />
                <motion.div
                  role="dialog"
                  aria-label="Choose style"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed inset-x-0 bottom-0 z-[71] bg-sr-cream rounded-t-3xl shadow-[0_-12px_36px_-8px_rgba(31,53,57,0.2)] px-4 pt-3 pb-6 max-h-[75vh] overflow-y-auto"
                  style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
                >
                  <div className="mx-auto w-10 h-1 rounded-full bg-sr-ink/15 mb-4" aria-hidden />
                  <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-sr-ink-mute font-semibold mb-3 px-1">
                    Style
                  </p>
                  <div className="space-y-1.5">
                    {(upload?.styles ?? []).map((s) => (
                      <StyleSheetItem
                        key={s.style}
                        label={s.style}
                        takesCount={s.variants.length}
                        active={s.style === activeStyleName}
                        onClick={() => {
                          setActiveStyleName(s.style);
                          setStyleMenuOpen(false);
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-sr-hairline">
                    <Link
                      href={newStyleHref}
                      onClick={() => setStyleMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-sr-terra bg-white border border-sr-terra/20 rounded-xl hover:bg-sr-terra/[0.06] transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                      Add another style
                    </Link>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Desktop popover menu item. Compact row with a left trash icon, used in
 * the ⋯ overflow on sm+ viewports. `danger` shifts the hover to red
 * (used for room-level deletes).
 */
function MenuItem({
  onClick,
  disabled,
  label,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors disabled:opacity-50',
        danger
          ? 'text-red-700 hover:bg-red-50'
          : 'text-sr-ink hover:bg-sr-cream-soft',
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

/**
 * Desktop popover navigation item. Same shape as MenuItem but renders
 * a Next/Link instead of a button. Used for utility links like
 * "Listing copy" that navigate rather than mutate.
 */
function MenuLink({
  href,
  onNavigate,
  label,
}: {
  href: string;
  onNavigate: () => void;
  label: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      role="menuitem"
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors text-sr-ink hover:bg-sr-cream-soft"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 1.5h5l3 3V12a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {label}
    </Link>
  );
}

/**
 * Mobile bottom-sheet item. Same actions as MenuItem but with the
 * thumb-friendly card-style row used in the existing bottom sheet.
 */
function SheetItem({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 bg-white border border-sr-hairline rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 7.5h4l.5-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

/** Star (room cover) / home (property cover) glyph for the cover menu items. */
function CoverIcon({ icon }: { icon: 'star' | 'home' }) {
  if (icon === 'home') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d="M2 6.5L7 2.5l5 4M3.2 5.6V11a.8.8 0 00.8.8h6a.8.8 0 00.8-.8V5.6"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 1.8l1.55 3.14 3.47.5-2.51 2.45.59 3.45L7 9.18 3.9 11.8l.59-3.45L1.98 5.44l3.47-.5L7 1.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Desktop popover cover action (utility, not destructive). */
function CoverMenuItem({
  onClick,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: 'star' | 'home';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors text-sr-ink hover:bg-sr-cream-soft disabled:opacity-50"
    >
      <CoverIcon icon={icon} />
      {label}
    </button>
  );
}

/** Mobile bottom-sheet cover action — white card, matches the Listing copy row. */
function CoverSheetItem({
  onClick,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: 'star' | 'home';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-sr-ink bg-white border border-sr-hairline rounded-xl hover:bg-sr-cream-soft transition-colors disabled:opacity-50"
    >
      <CoverIcon icon={icon} />
      {label}
    </button>
  );
}

/**
 * Desktop popover row for the style switcher. Plain text — no thumbnails,
 * matches the project's "hairlines over imagery on chrome" rhythm. Active
 * row gets terra italic Fraunces (the brand's "one italic moment" applied
 * at item level), and a small terra dot replaces a checkbox.
 */
function StyleMenuItem({
  label,
  takesCount,
  active,
  onClick,
}: {
  label: string;
  takesCount: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors',
        active ? 'bg-sr-terra/[0.06]' : 'hover:bg-sr-cream-soft',
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'size-1.5 rounded-full flex-shrink-0',
            active ? 'bg-sr-terra' : 'bg-transparent',
          )}
          aria-hidden
        />
        {active ? (
          <em
            className="font-display italic text-sr-terra text-[15px] leading-tight truncate"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
          >
            {label}
          </em>
        ) : (
          <span className="font-medium text-sr-ink truncate">{label}</span>
        )}
      </span>
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-sr-ink-mute flex-shrink-0">
        {takesCount} {takesCount === 1 ? 'take' : 'takes'}
      </span>
    </button>
  );
}

/**
 * Mobile bottom-sheet row for the style switcher. Same vocabulary as
 * StyleMenuItem but with the thumb-friendly card scale used in the ⋯ sheet.
 */
function StyleSheetItem({
  label,
  takesCount,
  active,
  onClick,
}: {
  label: string;
  takesCount: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 text-sm rounded-xl text-left border transition-colors',
        active
          ? 'bg-sr-terra/[0.06] border-sr-terra/30'
          : 'bg-white border-sr-hairline hover:bg-sr-cream-soft',
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'size-1.5 rounded-full flex-shrink-0',
            active ? 'bg-sr-terra' : 'bg-transparent',
          )}
          aria-hidden
        />
        {active ? (
          <em
            className="font-display italic text-sr-terra text-[17px] leading-tight truncate"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
          >
            {label}
          </em>
        ) : (
          <span className="font-medium text-sr-ink truncate">{label}</span>
        )}
      </span>
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-sr-ink-mute flex-shrink-0">
        {takesCount} {takesCount === 1 ? 'take' : 'takes'}
      </span>
    </button>
  );
}
