'use client';

import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';
import { cn } from '@/lib/utils/cn';
import { useStagePlayer } from './use-stage-player';
import { CopyPanel } from './hiw-copy-panel';
import { ReadBand } from './hiw-read-band';
import { CUE_MS, DUR, EASE, LEAD, SPRING_ACCENT, STEP_MS } from './hiw-motion-tokens';

// Step copy. Times honest to current shipping config (Three Takes default —
// first variant lands ~60 seconds in, others trail). Step 04 $3,500 figure
// is the bottom of the verified 3-bed physical staging range ($3,500–$6,000,
// re-verified 2026-10-04, same figure as the Comparison card), kept honest
// rather than rounded up.
type Doer = 'YOU' | 'US';

interface Step {
  number: string;
  title: string;
  railTitle: string;
  doer: Doer;
  time: string;
  description: string;
}

const steps: Step[] = [
  {
    number: '01',
    title: 'Upload',
    railTitle: 'Upload',
    doer: 'YOU',
    time: '~5 seconds',
    description:
      'Drop in any photo of the room. Furnished or empty, doesn’t matter. Phone or camera. That’s the whole step.',
  },
  {
    number: '02',
    title: 'We read the room',
    railTitle: 'We read the room',
    doer: 'US',
    time: '~5 seconds',
    description:
      'Camera angle, light, openings, layout. The thinking that usually takes ten minutes of briefing a stager, done automatically.',
  },
  {
    number: '03',
    title: 'We stage it',
    railTitle: 'We stage it',
    doer: 'US',
    time: 'just minutes',
    description:
      'Three takes per style at full resolution. AI is creative and inconsistent, so three takes means you almost always have one you love.',
  },
  {
    number: '04',
    title: 'Download. Done.',
    railTitle: 'Download',
    doer: 'YOU',
    time: '~5 seconds',
    description:
      'Save the favourite and you’re done. No stylists to brief, no movers, no follow-up shoot, and roughly $3,500 still in your pocket.',
  },
];

const EMPTY_SRC = '/landing/hero-empty.jpg';
const STAGED_SRC = '/landing/hero-staged-boho.jpg';

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };
const FR_STEP_TITLE = { fontVariationSettings: '"opsz" 96, "SOFT" 30' };
const FR_NUMBER = { fontVariationSettings: '"opsz" 144, "SOFT" 100' };

export function HowItWorks() {
  const reducedMotion = useReducedMotion() ?? false;
  const stageRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.5,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { step, playing, tick, jump, hold, release } = useStagePlayer({
    stepCount: steps.length,
    enabled: inView && !reducedMotion,
  });

  // The copy panel's exit pre-fires on a cue from the rail's own clock.
  const [leaving, setLeaving] = useState(false);
  useEffect(() => setLeaving(false), [step]);

  // Suspend when the tab is hidden (not an intersection change). The fill's
  // play-state pause resumes from position, so nothing can desync.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hold();
      else release();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [hold, release]);

  // Pre-decode both photos so the sweep never reveals an undecoded frame.
  useEffect(() => {
    [EMPTY_SRC, STAGED_SRC].forEach((src) => {
      const img = new Image();
      img.src = src;
      img.decode().catch(() => undefined);
    });
  }, []);

  const active = steps[step];

  return (
    <MotionConfig reducedMotion="user">
      <section
        id="how-it-works"
        className="relative z-10 py-20 sm:py-28 lg:py-32 bg-sr-cream-soft border-t border-b border-sr-hairline"
      >
        <div className="relative mx-auto max-w-[1240px] px-5 sm:px-10">
          <StaggerContainer>
            <FadeUp>
              <div className="max-w-[760px] mx-auto text-center mb-10 sm:mb-14">
                <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                  <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                  How it works
                </span>
                <h2
                  className="font-display font-normal text-[clamp(32px,5vw,56px)] leading-[1.04] tracking-[-0.03em] text-sr-ink"
                  style={FR_DISPLAY}
                >
                  Photo to listing-ready
                  <br />
                  in{' '}
                  <em
                    className="not-italic font-display italic font-light text-sr-terra"
                    style={FR_ITALIC}
                  >
                    just minutes.
                  </em>
                </h2>
                <p className="mt-4 text-base sm:text-[17px] text-sr-ink-soft max-w-[520px] mx-auto">
                  You do two small things. We do the two big ones.
                </p>
              </div>
            </FadeUp>

            <FadeUp>
              {/* Full linear copy for screen readers; the visual stage is a
                  decorative rotation of the same content. */}
              <ol className="sr-only">
                {steps.map((s) => (
                  <li key={s.number}>
                    {s.title} ({s.doer}, {s.time}): {s.description}
                  </li>
                ))}
              </ol>

              <div>
                {/* ------------- Rail: concept first, above the stage ------------- */}
                <StepRail
                  step={step}
                  playing={playing}
                  reducedMotion={reducedMotion}
                  onTick={tick}
                  onCue={() => setLeaving(true)}
                  onJump={jump}
                  onHold={hold}
                  onRelease={release}
                />

                <div className="mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-14 lg:items-center">
                  {/* ---------------------------- Frame ---------------------------- */}
                  <div className="lg:col-span-7">
                    <StageFrame
                      stageRef={stageRef}
                      step={step}
                      playing={playing}
                      reducedMotion={reducedMotion}
                    />
                  </div>

                  {/* ---------------------------- Copy ----------------------------- */}
                  <div className="lg:col-span-5" aria-hidden>
                    <CopyPanel active={active} leaving={leaving} reducedMotion={reducedMotion} />
                  </div>
                </div>
              </div>
            </FadeUp>
          </StaggerContainer>
        </div>
      </section>
    </MotionConfig>
  );
}

/* ------------------------------- Step rail ------------------------------- */
// Segmented hairline timer track (Stories mechanism, editorial styling).
// The active segment's CSS fill IS the master clock: onAnimationEnd advances
// the step, so fill and transition are frame-locked by construction.

function StepRail({
  step,
  playing,
  reducedMotion,
  onTick,
  onCue,
  onJump,
  onHold,
  onRelease,
}: {
  step: number;
  playing: boolean;
  reducedMotion: boolean;
  onTick: () => void;
  onCue: () => void;
  onJump: (i: number) => void;
  onHold: () => void;
  onRelease: () => void;
}) {
  const activeRail = steps[step].railTitle;
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 sm:gap-4">
        {steps.map((s, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <button
              key={s.number}
              type="button"
              onClick={() => onJump(i)}
              onFocus={(e) => {
                // Pause for keyboard readers only; a pointer click must never
                // freeze the line it just restarted.
                if (e.target.matches(':focus-visible')) onHold();
              }}
              onBlur={onRelease}
              aria-label={`Step ${s.number}: ${s.title}`}
              aria-current={isActive ? 'step' : undefined}
              className="group relative pt-4 pb-2 min-h-[44px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sr-terra rounded-sm"
            >
              {/* Track segment: one clean rounded bar, no hairline dashes */}
              <span className="absolute top-0 left-0 right-0 h-[4px] rounded-full bg-sr-ink/[0.08] overflow-hidden">
                {isDone && <span className="absolute inset-0 rounded-full bg-sr-sage/50" />}
                {isActive && !reducedMotion && (
                  // Two animations on ONE element: stepfill draws the bar and
                  // ends the step; stepcue fires 450ms earlier to start the
                  // copy panel's exit. Sharing an element means they share a
                  // play-state, so pausing can never desync them.
                  <span
                    key={`fill-${step}`}
                    onAnimationEnd={(e) =>
                      e.animationName.includes('stepcue') ? onCue() : onTick()
                    }
                    className="absolute inset-0 rounded-full origin-left scale-x-0 bg-sr-terra"
                    style={{
                      animationName: 'stepfill, stepcue',
                      animationDuration: `${STEP_MS}ms, ${CUE_MS}ms`,
                      animationTimingFunction: 'linear, linear',
                      animationFillMode: 'forwards, forwards',
                      animationPlayState: playing ? 'running' : 'paused',
                    }}
                  />
                )}
                {isActive && reducedMotion && (
                  <span className="absolute inset-0 rounded-full bg-sr-terra" />
                )}
              </span>

              {/* Number + headline label, colour-only state changes */}
              <span className="flex items-baseline gap-2.5">
                <span
                  className={cn(
                    'font-mono text-[11px] sm:text-[11.5px] font-medium tracking-[0.12em] tabular-nums transition-colors duration-[240ms]',
                    isActive ? 'text-sr-terra' : isDone ? 'text-[#4F7E5E]' : 'text-sr-ink/40'
                  )}
                >
                  {s.number}
                </span>
                <span
                  className={cn(
                    'hidden sm:inline font-display font-normal text-[16px] lg:text-[19px] leading-[1.15] tracking-[-0.01em] transition-colors duration-[240ms]',
                    isActive ? 'text-sr-ink' : isDone ? 'text-sr-ink/55' : 'text-sr-ink/35'
                  )}
                  style={FR_STEP_TITLE}
                >
                  {s.railTitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile caption: the track carries no text, so nothing ever truncates. */}
      <div className="sm:hidden mt-1 h-[18px] overflow-hidden" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={activeRail}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: DUR.fast, ease: EASE.out }}
            className="inline-block font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-sr-ink"
          >
            {steps[step].number} / 04 &middot; {activeRail}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------ Stage frame ------------------------------ */

function StageFrame({
  stageRef,
  step,
  playing,
  reducedMotion,
}: {
  stageRef: React.RefObject<HTMLDivElement>;
  step: number;
  playing: boolean;
  reducedMotion: boolean;
}) {
  // One motion value drives the hero sweep so nothing can desync.
  const p = useMotionValue(step >= 2 ? 100 : 0);
  const remaining = useTransform(p, (v) => 100 - v);
  const clipPath = useMotionTemplate`inset(0 ${remaining}% 0 0)`;
  const dividerLeft = useMotionTemplate`${p}%`;
  const [dividerVisible, setDividerVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      p.set(step >= 2 ? 100 : 0);
      setDividerVisible(false);
      return;
    }
    if (step === 2) {
      // THE hero moment: slider-echo sweep, left to right, toward the copy.
      p.set(0);
      setDividerVisible(true);
      const controls = animate(p, 100, {
        duration: DUR.hero,
        ease: EASE.sweep,
        delay: 0.15,
        onComplete: () => {
          window.setTimeout(() => setDividerVisible(false), 200);
        },
      });
      return () => controls.stop();
    }
    setDividerVisible(false);
    if (step === 3) {
      p.set(100);
      return;
    }
    if (step === 1) {
      p.set(0);
      return;
    }
    // step 0: the UploadMachine's dropzone surface covers the frame first,
    // then calls onCovered -> p.set(0) beneath it. This IS the loop wrap:
    // the cycle ends by returning to the dropzone.
  }, [step, reducedMotion, p]);

  return (
    <div
      ref={stageRef}
      aria-hidden
      className="relative aspect-[4/3] rounded-2xl border border-sr-hairline shadow-[0_30px_60px_-28px_rgba(31,53,57,0.22),0_10px_24px_-10px_rgba(31,53,57,0.10)] overflow-hidden bg-[#d8d2c6]"
    >
      {/* Base: empty room */}
      <img src={EMPTY_SRC} alt="" decoding="async" className="absolute inset-0 size-full object-cover" />

      {/* Staged layer, revealed by the sweep; settles 1.02 -> 1 as it arrives */}
      <motion.div className="absolute inset-0" style={{ clipPath }}>
        <motion.img
          key={`staged-${step >= 2 ? 'on' : 'off'}`}
          src={STAGED_SRC}
          alt=""
          decoding="async"
          initial={false}
          animate={{ scale: step === 2 && !reducedMotion ? [1.02, 1] : 1 }}
          transition={{ duration: DUR.hero + 0.3, ease: EASE.out }}
          className="absolute inset-0 size-full object-cover"
        />
      </motion.div>

      {/* Sweep divider + feather, riding the same value as the clip */}
      {dividerVisible && (
        <>
          <motion.div
            className="absolute inset-y-0 w-[48px] -translate-x-1/2 pointer-events-none"
            style={{
              left: dividerLeft,
              background:
                'linear-gradient(to right, transparent, rgba(247,243,233,0.35), transparent)',
            }}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE.out }}
            className="absolute inset-y-0 -translate-x-1/2 pointer-events-none"
            style={{ left: dividerLeft }}
          >
            <div className="h-full w-[2px] bg-sr-ink/80" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-[1px] size-7 rounded-full bg-white/95 border border-white shadow-soft flex items-center justify-center">
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden>
                <path
                  d="M4 1L1 5l3 4M8 1l3 4-3 4"
                  stroke="#1F3539"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </motion.div>
        </>
      )}

      {/* State 01: the wizard's real upload experience, played as a story.
          No label chip here — the dropzone copy and the photo growing to fill
          the frame say it better than a pill would, and a chip landing in the
          final 200ms would only flicker. */}
      <AnimatePresence>
        {step === 0 && !reducedMotion && (
          <UploadMachine key="upload" playing={playing} onCovered={() => p.set(0)} />
        )}
      </AnimatePresence>

      {/* State 02: the read band owns this step entirely. No separate chip:
          the band header is the label, and two labels compete. */}
      <AnimatePresence>
        {step === 1 && (
          <ReadBand key="read-band" playing={playing} reducedMotion={reducedMotion} />
        )}
      </AnimatePresence>

      {/* State 03: staged pill */}
      <ChipFade show={step === 2} delay={DUR.hero + 0.2}>
        <div className="absolute top-3 left-3 bg-sr-sage-deep/95 backdrop-blur-sm text-[10px] font-bold text-white px-2.5 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path
              d="M2 5l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Staged
        </div>
      </ChipFade>

      {/* State 04: compliance stamp presses on, then the finished photo
          downloads itself out of the frame. Mirrors step 01 in reverse. */}
      <AnimatePresence>
        {step === 3 && (
          <motion.div
            key="download-04"
            className="absolute inset-0"
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE.exit } }}
          >
            <DownloadMachine playing={playing} reducedMotion={reducedMotion} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fast-register chip fade: enter DUR.fast on EASE.out, exit at half. */
function ChipFade({
  show,
  delay = 0,
  children,
}: {
  show: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DUR.fast, ease: EASE.out, delay } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE.exit } }}
          className="absolute inset-0 pointer-events-none"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------- Upload machine ----------------------------- */
// Step 01 replays the wizard's actual upload UX: the real dropzone chrome
// (mirrored from src/components/wizard/hero-upload.tsx), a photo card dragged
// in by a cursor, the drag-over highlight, then the drop blooming into the
// full frame. Its opaque surface doubles as the loop-wrap transition.

const CARD_W = 112; // w-28: the dragged card's width, and the basis of the grow scale
const FRAME_RADIUS = 16; // rounded-2xl on the stage frame

// Phase budget fills the whole STEP_MS so something is always moving under the
// progress bar, and the photo lands full-size exactly as the bar completes.
const UPLOAD_MS = { enter: 250, zone: 450, drag: 1200, grip: 200, grow: 2700 } as const;

function UploadMachine({ playing, onCovered }: { playing: boolean; onCovered: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'zone' | 'drag' | 'grip' | 'grow' | 'done'>('enter');
  const rootRef = useRef<HTMLDivElement>(null);
  const [growScale, setGrowScale] = useState(6);

  // The card grows until it exactly fills the frame. Both are 4:3, so one
  // uniform scale lands flush and the base photo beneath matches seamlessly.
  useEffect(() => {
    const measure = () => {
      const w = rootRef.current?.clientWidth;
      if (w) setGrowScale(w / CARD_W);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (phase === 'enter' || phase === 'done' || !playing) return;
    const next = { zone: 'drag', drag: 'grip', grip: 'grow', grow: 'done' } as const;
    const id = window.setTimeout(() => setPhase(next[phase]), UPLOAD_MS[phase]);
    return () => window.clearTimeout(id);
  }, [phase, playing]);

  if (phase === 'done') return null;

  const growing = phase === 'grow';

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE.exit } }}
      transition={{ duration: UPLOAD_MS.enter / 1000, ease: EASE.out }}
      onAnimationComplete={() => {
        if (phase === 'enter') {
          onCovered();
          setPhase('zone');
        }
      }}
      className="absolute inset-0 bg-sr-cream-soft"
    >
      {/* Dropzone chrome, faithful to the wizard's HeroUpload empty state */}
      <motion.div
        animate={{ opacity: growing ? 0 : 1 }}
        transition={{ duration: 0.35, ease: EASE.out }}
        className={cn(
          'absolute inset-3 sm:inset-4 rounded-2xl border-2 border-dashed transition-colors duration-200',
          'flex flex-col items-center justify-center px-6 text-center',
          phase === 'drag' || phase === 'grip'
            ? 'border-sr-terra/60 bg-sr-terra/[0.08]'
            : 'border-sr-terra/40 bg-sr-terra/[0.04]'
        )}
      >
        <div className="size-12 sm:size-14 rounded-2xl bg-sr-cream-soft border border-sr-hairline flex items-center justify-center mb-3 sm:mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="size-6 sm:size-7 text-sr-terra" aria-hidden>
            <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 6V5a2 2 0 012-2h4a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="text-sm sm:text-base font-medium text-sr-ink">
          Tap to take a photo or choose one
        </p>
        <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-sr-ink-soft">
          This is the photo that will be furnished
        </p>
      </motion.div>

      {/* The photo: dragged in, then grown continuously until it IS the frame.
          Must NOT render during 'enter': it would mount, start its 1.2s drag,
          then unmount the moment the phase flips to 'zone' and replay the drag
          from the top when 'drag' arrives. That is the visible double-drag. */}
      {(phase === 'drag' || phase === 'grip' || phase === 'grow') && (
        <motion.div
          initial={{ x: -240, y: 220, rotate: -8, opacity: 0, scale: 1 }}
          animate={
            growing
              ? { x: 0, y: 0, rotate: 0, opacity: 1, scale: growScale }
              : { x: 0, y: 0, rotate: -2, opacity: 1, scale: 1 }
          }
          transition={{
            duration: growing ? UPLOAD_MS.grow / 1000 : UPLOAD_MS.drag / 1000,
            ease: growing ? EASE.sweep : EASE.out,
          }}
          className="absolute left-1/2 top-1/2 -ml-14 -mt-[42px] w-28 pointer-events-none"
        >
          {/* Border + shadow ride on box-shadow (no layout width), so the
              scaled photo lands pixel-flush with the frame beneath it. */}
          <motion.div
            animate={{
              boxShadow: growing
                ? '0 0 0 0px rgba(255,255,255,0), 0 0px 0px 0px rgba(31,53,57,0)'
                : '0 0 0 2px rgba(255,255,255,1), 0 18px 40px -12px rgba(31,53,57,0.45)',
              // Radius is counter-scaled so the grown photo's corners land at
              // exactly the frame's own 16px rounding, never a sharp edge
              // inside a rounded container.
              borderRadius: growing ? FRAME_RADIUS / growScale : 12,
            }}
            transition={{ duration: growing ? 1.2 : 0.25, ease: EASE.out }}
            className="overflow-hidden"
          >
            <img src={EMPTY_SRC} alt="" className="block w-full aspect-[4/3] object-cover" />
          </motion.div>
          <motion.svg
            animate={{ opacity: growing ? 0 : 1 }}
            transition={{ duration: 0.2, ease: EASE.out }}
            className="absolute -bottom-3 -right-2"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M5 3l14 7-6 2-2 6-6-15z"
              fill="#1F3539"
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </motion.svg>
        </motion.div>
      )}
    </motion.div>
  );
}

/* --------------------------- Download machine ---------------------------- */
// Step 04: the compliance watermark stamps onto the photo (the section's one
// spring accent), then a small card of the finished photo plucks itself off
// the frame and flies out down-right while a download chip fills and flips
// to a sage "Saved". The reverse of step 01's drag-in.

// saving MUST exceed the card's 1.6s flight: the card renders only during
// 'saving', so a shorter phase unmounts it mid-flight and it never reaches
// the corner (the bug Tara reported three times on 2026-08-17).
const DOWNLOAD_MS = { idle: 400, stamped: 550, reach: 1150, click: 220, saving: 1750 } as const;

function DownloadMachine({
  playing,
  reducedMotion,
}: {
  playing: boolean;
  reducedMotion: boolean;
}) {
  const [phase, setPhase] = useState<
    'idle' | 'stamped' | 'reach' | 'click' | 'saving' | 'saved'
  >('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const [cursorStart, setCursorStart] = useState({ x: 220, y: 190 });
  const [frameSize, setFrameSize] = useState({ w: 640, h: 480 });

  // The cursor enters from the lower right, so it travels against the file's
  // outbound path rather than trailing along it. The frame size also aims the
  // card's final keyframe THROUGH the bottom-right corner at any viewport.
  useEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (el) {
        setCursorStart({ x: el.clientWidth * 0.55, y: el.clientHeight * 0.6 });
        setFrameSize({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (reducedMotion || phase === 'saved' || !playing) return;
    const next = {
      idle: 'stamped',
      stamped: 'reach',
      reach: 'click',
      click: 'saving',
      saving: 'saved',
    } as const;
    const id = window.setTimeout(() => setPhase(next[phase]), DOWNLOAD_MS[phase]);
    return () => window.clearTimeout(id);
  }, [phase, playing, reducedMotion]);

  const at = reducedMotion ? 'saved' : phase;
  const buttonShown = at !== 'idle' && at !== 'stamped';
  const pressed = at === 'click';
  const saving = at === 'saving';
  const saved = at === 'saved';

  // The stamp scales with the frame, like the real burned-in watermark does
  // with the real image. A fixed-size chip is ~45% of a 335px mobile frame but
  // only ~23% of a desktop one; scaling by frame width keeps the proportion
  // constant. Outer wrapper carries the static proportional scale so the inner
  // spring (1.3 -> 1) stays untouched.
  const stampScale = Math.min(1, Math.max(0.55, frameSize.w / 653));

  return (
    <div ref={rootRef} className="absolute inset-0">
      {/* Compliance stamp: presses down onto the photo */}
      {at !== 'idle' && (
        <div
          className="absolute bottom-[3%] right-[3%]"
          style={{ transform: `scale(${stampScale})`, transformOrigin: 'bottom right' }}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 1.3, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={SPRING_ACCENT}
            className="px-3 py-1.5 rounded bg-sr-ink shadow-[0_6px_18px_-6px_rgba(31,53,57,0.5)]"
          >
            <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-cream-soft whitespace-nowrap">
              Virtually Staged &middot; AI
            </span>
          </motion.div>
        </div>
      )}

      {/* The Download control the cursor actually clicks */}
      {buttonShown && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, scale: pressed ? 0.96 : 1 }}
          transition={{ duration: DUR.fast, ease: EASE.out }}
          className={cn(
            'absolute top-3 left-3 rounded-lg border border-white shadow-soft px-3 py-1.5 backdrop-blur-sm overflow-hidden',
            pressed ? 'bg-sr-cream' : 'bg-white/95'
          )}
        >
          <span className="flex items-center gap-2">
            {saved ? (
              <motion.svg
                initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING_ACCENT}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2.5 6.5l2.5 2.5L9.5 3.5"
                  stroke="#4F7E5E"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M6 2v6M3 6l3 3 3-3M2 10h8"
                  stroke="#1F3539"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <span className="font-mono text-[10px] text-sr-ink whitespace-nowrap">
              {saved ? 'Saved' : 'Download'}
            </span>
            {saving && (
              <span className="relative h-[3px] w-12 overflow-hidden rounded-full bg-sr-ink/10">
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: DOWNLOAD_MS.saving / 1000, ease: 'linear' }}
                  className="absolute inset-0 origin-left rounded-full bg-sr-terra"
                />
              </span>
            )}
          </span>

          {/* Click ripple */}
          {pressed && !reducedMotion && (
            <motion.span
              initial={{ opacity: 0.3, scale: 0.3 }}
              animate={{ opacity: 0, scale: 2 }}
              transition={{ duration: 0.5, ease: EASE.out }}
              className="absolute inset-0 rounded-lg bg-sr-ink/25"
            />
          )}
        </motion.div>
      )}

      {/* The cursor: travels to the button, presses it, then withdraws */}
      {!reducedMotion && buttonShown && !saved && (
        <motion.svg
          initial={{ x: cursorStart.x, y: cursorStart.y, opacity: 0 }}
          animate={{ x: 0, y: pressed ? 3 : 0, opacity: saving ? 0 : 1 }}
          transition={{
            x: { duration: DOWNLOAD_MS.reach / 1000, ease: EASE.out },
            y: { duration: pressed ? 0.12 : DOWNLOAD_MS.reach / 1000, ease: EASE.out },
            opacity: { duration: 0.3, ease: EASE.out },
          }}
          className="absolute top-3 left-3 ml-[54px] mt-[16px] pointer-events-none"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M5 3l14 7-6 2-2 6-6-15z"
            fill="#1F3539"
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </motion.svg>
      )}

      {/* Only after the click does the file leave. It is BORN AT THE BUTTON
          (where the cursor and the viewer's attention already are), grows as
          it pulls away, then drags down into the bottom-right and out. */}
      {saving && (
        <motion.div
          initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.16 }}
          animate={{
            opacity: [0, 1, 1, 0.9],
            // Born at the button, grows as it pulls away, then travels all the
            // way down into the bottom-right corner and out THROUGH it. The
            // last keyframe is measured from the frame so the card visibly
            // reaches the corner at any viewport instead of clipping early.
            x: [0, 46, frameSize.w * 0.94 - 26],
            y: [0, 90, frameSize.h * 1.04 - 10],
            rotate: [0, 3, 10],
            scale: [0.16, 0.85, 0.8],
          }}
          transition={{
            duration: 1.6,
            times: [0, 0.38, 1],
            ease: [EASE.out, EASE.exit],
            opacity: { duration: 1.6, times: [0, 0.1, 0.85, 1], ease: 'linear' },
          }}
          className="absolute top-[10px] left-[26px] w-28 pointer-events-none origin-top-left"
        >
          <div className="relative rounded-lg overflow-hidden border-2 border-white shadow-[0_18px_40px_-12px_rgba(31,53,57,0.45)]">
            <img src={STAGED_SRC} alt="" className="block w-full aspect-[4/3] object-cover" />
            <span className="absolute bottom-1 right-1 rounded-sm bg-sr-ink px-1 py-0.5 font-mono text-[4px] uppercase tracking-[0.14em] text-sr-cream-soft">
              Virtually Staged &middot; AI
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
