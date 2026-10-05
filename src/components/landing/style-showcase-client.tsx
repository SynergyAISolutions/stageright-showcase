'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';
import {
  STAGING_STYLES,
  styleToFilename,
  type StagingStyle,
} from '@/lib/ai/prompts';
import { StyleRow, type ThumbnailRoom } from '@/components/staging/style-row';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { LandingThumbnail } from '@/components/landing/landing-thumbnail';
import type { LandingSlot } from '@/lib/landing/slot-map';
import { cn } from '@/lib/utils/cn';

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };

export function StyleShowcaseClient({
  slotMap,
  availableRooms,
}: {
  slotMap: Partial<Record<ThumbnailRoom, LandingSlot[]>>;
  availableRooms: { slug: ThumbnailRoom; label: string }[];
}) {
  const [activeStyle, setActiveStyle] = useState<StagingStyle>('Modern');
  const [activeRoom, setActiveRoom] = useState<ThumbnailRoom>(
    availableRooms[0]?.slug ?? ('living-room' as ThumbnailRoom),
  );
  // Track the active set per room — dots navigation. Defaults to set 0.
  const [activeSetByRoom, setActiveSetByRoom] = useState<Partial<Record<ThumbnailRoom, number>>>({});
  // Per-room notes map cached after the first successful fetch. A room that
  // has no notes.json (older folders) remains absent from this map, which is
  // our signal to fall back to the static-image UI.
  const [notesByRoom, setNotesByRoom] = useState<Record<string, Record<string, string>>>({});
  const [notesFetched, setNotesFetched] = useState<Record<string, boolean>>({});

  // Measure the preview column so the style list can match its exact height
  // on desktop (per Tara: the list scrolls within the image's height, not
  // viewport height). Mobile stacks normally — no ref math needed there.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    const el = previewRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setPreviewHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (notesFetched[activeRoom]) return;
    let cancelled = false;
    fetch(`/style-thumbnails/${activeRoom}/notes.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((notes) => {
        if (cancelled) return;
        setNotesFetched((prev) => ({ ...prev, [activeRoom]: true }));
        if (notes && typeof notes === 'object') {
          setNotesByRoom((prev) => ({ ...prev, [activeRoom]: notes }));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNotesFetched((prev) => ({ ...prev, [activeRoom]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeRoom, notesFetched]);

  // Touch-swipe between sets on the preview area. Activates only when a room
  // has more than one set; otherwise no-op.
  useEffect(() => {
    const roomSets = slotMap[activeRoom] ?? [];
    const count = roomSets.length;
    if (count <= 1) return;
    const el = previewRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }
    function onEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Horizontal-dominant swipe ≥ 50px
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setActiveSetByRoom((prev) => {
          const cur = prev[activeRoom] ?? 0;
          const next = dx < 0 ? Math.min(cur + 1, count - 1) : Math.max(cur - 1, 0);
          return { ...prev, [activeRoom]: next };
        });
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [activeRoom, slotMap]);

  const activeRoomSets = slotMap[activeRoom] ?? [];
  const activeSetIndex = Math.min(
    activeSetByRoom[activeRoom] ?? 0,
    Math.max(0, activeRoomSets.length - 1),
  );
  const activeSlot = activeRoomSets[activeSetIndex];
  const setCount = activeRoomSets.length;
  if (!activeSlot) return null;
  const activeStyleSlot = activeSlot?.styles[activeStyle];
  const previewSrc = activeStyleSlot?.src;
  const heroSrc = activeStyleSlot?.heroSrc;
  const canCompare = Boolean(previewSrc && heroSrc);
  const comboKey = `${activeRoom}-${activeStyle}-${activeSetIndex}`;
  const activeRoomLabel =
    availableRooms.find((r) => r.slug === activeRoom)?.label ?? '';

  return (
    <section
      id="styles"
      className="relative z-10 py-20 sm:py-28 lg:py-32"
    >
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="max-w-[760px] mx-auto text-center mb-10 sm:mb-14">
              <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                Twelve curated styles
              </span>
              <h2
                className="font-display font-normal text-[clamp(32px,5vw,56px)] leading-[1.04] tracking-[-0.03em] text-sr-ink"
                style={FR_DISPLAY}
              >
                Pick a room. Pick a style.
                <br />
                See the{' '}
                <em
                  className="not-italic font-display italic font-light text-sr-terra"
                  style={FR_ITALIC}
                >
                  result.
                </em>
              </h2>
              <p className="mt-4 text-base sm:text-[17px] text-sr-ink-soft max-w-[560px] mx-auto leading-[1.55]">
                Every image below is a real StageRight output.
              </p>
            </div>
          </FadeUp>

          {/* Room pill switcher — desktop only. Active state uses sr-terra so
              the room choice is visually anchored to the brand accent. */}
          <FadeUp>
            <div className="hidden md:flex flex-wrap justify-center gap-2 mb-10">
              {availableRooms.map((room) => {
                const selected = activeRoom === room.slug;
                return (
                  <button
                    key={room.slug}
                    type="button"
                    onClick={() => setActiveRoom(room.slug)}
                    aria-pressed={selected}
                    className={cn(
                      'relative px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-colors duration-200',
                      selected
                        ? 'text-sr-cream-soft'
                        : 'text-sr-ink-soft hover:text-sr-ink border border-sr-hairline-2 hover:border-sr-ink-soft',
                    )}
                  >
                    {selected && (
                      <motion.span
                        layoutId="room-pill-indicator"
                        className="absolute inset-0 rounded-full bg-sr-terra"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative">{room.label}</span>
                  </button>
                );
              })}
            </div>
          </FadeUp>

          {/* Mobile-only: two native dropdowns directly above the image. */}
          <FadeUp>
            <div className="md:hidden grid grid-cols-2 gap-3 mb-6">
              <MobileSelect
                label="Room"
                value={activeRoom}
                onChange={(v) => setActiveRoom(v as ThumbnailRoom)}
                options={availableRooms.map((r) => ({ value: r.slug, label: r.label }))}
              />
              <MobileSelect
                label="Style"
                value={activeStyle}
                onChange={(v) => setActiveStyle(v as StagingStyle)}
                options={STAGING_STYLES.map((s) => ({ value: s, label: s }))}
              />
            </div>
          </FadeUp>

          <FadeUp>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-start">
              {/* Desktop: style list. Max-height matches the preview column's
                  measured height; scrollbar hidden. */}
              <div
                className="hidden md:block md:col-span-6 md:overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                style={
                  isDesktop && previewHeight
                    ? { maxHeight: `${previewHeight}px` }
                    : undefined
                }
              >
                <ul className="space-y-2">
                  {STAGING_STYLES.map((s) => (
                    <li key={s}>
                      <StyleRow
                        style={s}
                        selected={activeStyle === s}
                        onPick={() => setActiveStyle(s)}
                        roomCategory={activeRoom}
                        size="showcase"
                        thumbnailSrc={activeSlot?.styles[s]?.src}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* Preview */}
              <div ref={previewRef} className="relative md:col-span-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={comboKey}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                  >
                    {canCompare ? (
                      <BeforeAfterSlider
                        beforeSrc={heroSrc!}
                        afterSrc={previewSrc!}
                        beforeLabel="Original"
                        afterLabel={`${activeStyle} · ${activeRoomLabel}`}
                        lockAspect="4 / 3"
                      />
                    ) : previewSrc ? (
                      <div className="relative aspect-[4/3] rounded-md border border-sr-hairline shadow-[0_30px_60px_-28px_rgba(31,53,57,0.22)] overflow-hidden bg-sr-surface">
                        <img
                          src={previewSrc}
                          alt={`${activeStyle} staged ${activeRoomLabel.toLowerCase()} example`}
                          className="absolute inset-0 size-full object-cover"
                        />
                        <div className="absolute bottom-3 left-3 bg-sr-cream-soft/95 backdrop-blur-sm px-3 py-1.5 rounded border border-sr-hairline-2">
                          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-ink leading-none">
                            {activeStyle} · {activeRoomLabel}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>

                {/* Set switcher — drafting-style counter with prev/next
                    chevrons. Lives BELOW the preview in cream space (not
                    overlaid on the photo), reads as drafting margin
                    notation, clearly states position + actions. Hidden
                    when a room only has one set. */}
                {setCount > 1 && (
                  <div className="mt-5 flex items-center justify-center gap-4 font-mono text-[12.5px] font-medium uppercase tracking-[0.18em] text-sr-ink-soft">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSetByRoom((prev) => ({
                          ...prev,
                          [activeRoom]: Math.max(0, activeSetIndex - 1),
                        }))
                      }
                      disabled={activeSetIndex === 0}
                      className="text-sr-terra hover:opacity-70 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity p-1 -m-1"
                      aria-label="Previous example"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M8 2 L4 6 L8 10" />
                      </svg>
                    </button>
                    <span>
                      <span className="text-sr-ink">
                        Example {String(activeSetIndex + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sr-ink-mute">
                        {' '}
                        / {String(setCount).padStart(2, '0')}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSetByRoom((prev) => ({
                          ...prev,
                          [activeRoom]: Math.min(setCount - 1, activeSetIndex + 1),
                        }))
                      }
                      disabled={activeSetIndex === setCount - 1}
                      className="text-sr-terra hover:opacity-70 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity p-1 -m-1"
                      aria-label="Next example"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M4 2 L8 6 L4 10" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}

/* ----- MobileSelect ----- */

function MobileSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-ink-soft mb-2 leading-none">
        {label}
      </p>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full bg-sr-surface border border-sr-hairline-2 rounded-md pl-4 pr-10 py-3 text-[14px] font-medium text-sr-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-sr-terra"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sr-ink"
        >
          <path
            d="M3 5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
