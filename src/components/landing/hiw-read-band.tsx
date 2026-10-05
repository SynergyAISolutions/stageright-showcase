'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  EASE,
  READ_DUR,
  READ_FINDINGS,
  READ_NOTCHES,
  READ_SCORE,
  READ_VIEWBOX,
  ROW_MASK,
} from './hiw-motion-tokens';

/*
 * Step 02, "We read the room" — band spec v4.
 *
 * The band is ONE object: a ruled reading ledger.
 *  - Every row, masthead included, is the same two-column grid. The gutter
 *    column reads top to bottom as counter, tick, tick, tick: the counter is
 *    literally the head of the tick column and counts it.
 *  - A tick is a property of a sentence. It sits in its row's gutter, centred
 *    on the first line box, and fires the moment its sentence finishes inking.
 *  - Findings accumulate. A row lands, is inked, and stays inked; it leaves
 *    only by being pushed up through the masked viewport by the next row.
 *    Nothing ever fades out in place (that is the change-blindness flicker).
 *  - The continuous spine is the READ RULE: one sage hairline growing linearly
 *    under the band for 3.64s, crossing a notch on the exact frame each
 *    finding completes. Linear, always: easing a progress element lies.
 *  - One verb everywhere: ink rises inside an outline. Words fill left to
 *    right, ticks fill bottom to top, the masthead wipes to sage at the end.
 *  - All motion ends at 4300ms. The last 700ms is deliberate stillness.
 *  - No terra (terra = cost by house rule; this step is the win). No spinner,
 *    no pulse, no repeat, no glow. Drafting marks, never targeting marks.
 */

const CUES: number[] = Array.from(
  new Set([
    READ_SCORE.veil,
    READ_SCORE.masthead,
    READ_SCORE.rule,
    ...READ_SCORE.marks,
    ...READ_SCORE.findings,
    ...READ_SCORE.fills,
    ...READ_SCORE.ticks,
    ...READ_SCORE.counters,
    READ_SCORE.resolve,
    READ_SCORE.quiet,
  ])
).sort((a, b) => a - b);

/** Walks the cue list in real time, banking elapsed time across pauses. */
function useCue(playing: boolean, seedAtEnd: boolean) {
  const [index, setIndex] = useState(seedAtEnd ? CUES.length - 1 : -1);
  const elapsed = useRef(seedAtEnd ? CUES[CUES.length - 1] : 0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (seedAtEnd || !playing || index >= CUES.length - 1) return;
    const next = CUES[index + 1];
    startedAt.current = performance.now();
    const id = window.setTimeout(
      () => {
        elapsed.current = next;
        setIndex((v) => v + 1);
      },
      Math.max(0, next - elapsed.current)
    );
    return () => {
      window.clearTimeout(id);
      elapsed.current += performance.now() - startedAt.current;
    };
  }, [index, playing, seedAtEnd]);

  return index < 0 ? -1 : CUES[index];
}

function lastIndexAtOrBefore(times: readonly number[], t: number) {
  let found = -1;
  times.forEach((ms, i) => {
    if (t >= ms) found = i;
  });
  return found;
}

/** Row pitch and visible-row count, matching the CSS var breakpoints. */
function useBandMetrics() {
  const [m, setM] = useState({ pitch: 32, visible: 2 });
  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth;
      setM(w < 640 ? { pitch: 26, visible: 1 } : w < 1024 ? { pitch: 32, visible: 2 } : { pitch: 34, visible: 2 });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return m;
}

export function ReadBand({
  playing,
  reducedMotion,
}: {
  playing: boolean;
  reducedMotion: boolean;
}) {
  const t = useCue(playing, reducedMotion);
  const { pitch, visible } = useBandMetrics();

  // Everything derives from elapsed time, so a pause can never desync parts.
  const mastheadIn = reducedMotion || t >= READ_SCORE.masthead;
  const ruleRunning = reducedMotion || t >= READ_SCORE.rule;
  const resolved = reducedMotion || t >= READ_SCORE.resolve;
  const findingIndex = reducedMotion
    ? READ_FINDINGS.length - 1
    : lastIndexAtOrBefore(READ_SCORE.findings, t);
  const markIndex = reducedMotion ? 3 : lastIndexAtOrBefore(READ_SCORE.marks, t);
  const counter = reducedMotion
    ? READ_FINDINGS.length
    : Math.min(1 + READ_SCORE.counters.filter((ms) => t >= ms).length, READ_FINDINGS.length);
  const shiftRows = Math.max(0, findingIndex + 1 - visible);

  return (
    <>
      {/* ---- Marks drawn onto the photo, in a 4:3-locked coordinate space ---- */}
      <svg viewBox={READ_VIEWBOX} className="absolute inset-0 size-full pointer-events-none" aria-hidden>
        {/* The floor plane is the wordless resolve: the step ends by showing
            the layout inference rather than narrating it, and it stays. */}
        {markIndex >= 3 && <FloorPlane reducedMotion={reducedMotion} />}
        {!reducedMotion && (
          <AnimatePresence mode="wait">
            {markIndex === 0 && <MarkCamera key="m0" />}
            {markIndex === 1 && <MarkLight key="m1" />}
            {markIndex === 2 && <MarkOpenings key="m2" />}
          </AnimatePresence>
        )}
      </svg>

      {/* ------------------------------ The band ------------------------------ */}
      <motion.div
        initial={reducedMotion ? false : { clipPath: 'inset(0 0 100% 0)' }}
        animate={{ clipPath: 'inset(0 0 0% 0)' }}
        exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE.exit } }}
        transition={{ duration: READ_DUR.veil, ease: EASE.out }}
        className={
          'absolute inset-x-0 top-0 h-[28%] min-h-[68px] bg-[rgba(247,243,233,0.9)] ' +
          'px-4 sm:px-5 lg:px-6 py-[9px] sm:py-[11px] flex flex-col justify-center ' +
          '[--gut:16px] sm:[--gut:18px] [--gutgap:9px] sm:[--gutgap:10px] ' +
          '[--row-h:21px] sm:[--row-h:25px] lg:[--row-h:27px]'
        }
      >
        {/* Masthead: same grid as every row; the counter heads the tick column. */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, transform: 'translateY(3px)' }}
          animate={{
            opacity: mastheadIn ? 1 : 0,
            transform: mastheadIn ? 'translateY(0px)' : 'translateY(3px)',
          }}
          transition={{ duration: READ_DUR.masthead, ease: EASE.out }}
          className="grid grid-cols-[var(--gut)_1fr] gap-x-[var(--gutgap)] items-center"
        >
          {/* Hard digit swap on tabular figures: a mechanism, not a moment. */}
          <span
            className="font-mono text-[8.5px] sm:text-[9px] lg:text-[9.5px] text-sr-ink-soft text-center"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {String(counter).padStart(2, '0')}
          </span>
          <span className="relative font-mono text-[9.5px] sm:text-[10.5px] lg:text-[11px] font-medium uppercase tracking-[0.18em] whitespace-nowrap">
            <span className="text-sr-ink-soft">Reading the room</span>
            {/* The resolve is the same verb as everything else: ink wipes over
                the constant words. No text swap, nothing jagged. */}
            <motion.span
              aria-hidden
              initial={reducedMotion ? false : { clipPath: 'inset(-0.3em 100% -0.3em 0%)' }}
              animate={{
                clipPath: resolved ? 'inset(-0.3em 0% -0.3em 0%)' : 'inset(-0.3em 100% -0.3em 0%)',
              }}
              transition={{ duration: READ_DUR.resolve, ease: EASE.ink }}
              className="absolute inset-0 text-sr-sage-ink"
            >
              Reading the room
            </motion.span>
          </span>
        </motion.div>

        {/* Findings viewport: fixed height, static feather, one translating column. */}
        <div
          className="mt-1.5 sm:mt-[7px] overflow-hidden h-[32px] sm:h-[60px] lg:h-[66px]"
          style={ROW_MASK}
        >
          <motion.div
            animate={{ transform: `translateY(${-shiftRows * pitch}px)` }}
            transition={{ duration: READ_DUR.shift, ease: EASE.out }}
            className="flex flex-col gap-[5px] sm:gap-[7px]"
          >
            {READ_FINDINGS.slice(0, findingIndex + 1).map((f, i) => (
              <FindingRow
                key={f.key}
                line={f.line}
                filled={reducedMotion || t >= READ_SCORE.fills[i]}
                ticked={reducedMotion || t >= READ_SCORE.ticks[i]}
                reducedMotion={reducedMotion}
              />
            ))}
          </motion.div>
        </div>

        {/* The track (static, painted with the veil), its notches, and THE
            SPINE: one linear sage rule that never eases, pauses or repeats. */}
        <span className="absolute inset-x-0 bottom-0 h-px bg-sr-hairline" />
        {READ_NOTCHES.map((n) => (
          <span
            key={n}
            className="absolute bottom-0 h-[3px] w-px bg-sr-hairline-2"
            style={{ left: `${n * 100}%` }}
          />
        ))}
        {ruleRunning && (
          <span
            className="absolute inset-x-0 bottom-0 h-px origin-left bg-sr-sage-deep"
            style={
              reducedMotion
                ? undefined
                : {
                    transform: 'scaleX(0)',
                    animationName: 'stepfill',
                    animationDuration: `${READ_DUR.rule * 1000}ms`,
                    animationTimingFunction: 'linear',
                    animationFillMode: 'forwards',
                    animationPlayState: playing ? 'running' : 'paused',
                  }
            }
          />
        )}
      </motion.div>
    </>
  );
}

/* ------------------------------ Finding row ------------------------------ */
// Ghost layer (full-opacity ink-soft, AA on its own) carries layout; the ink
// layer sits over it and is clipped open left to right. The sentence is
// legible from frame one; the fill is pure ceremony. The tick is the same
// verb at 9px: sage ink rising inside a hairline outline square.

function FindingRow({
  line,
  filled,
  ticked,
  reducedMotion,
}: {
  line: string;
  filled: boolean;
  ticked: boolean;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, transform: 'translateY(5px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration: READ_DUR.rowIn, ease: EASE.out }}
      className="grid grid-cols-[var(--gut)_1fr] gap-x-[var(--gutgap)]"
    >
      <span className="grid place-items-center h-[var(--row-h)]">
        <svg viewBox="0 0 9 9" className="size-[9px]" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="8" height="8" rx="1.5" stroke="#C5BAA4" strokeWidth="1" />
          <motion.rect
            x="1.5"
            y="1.5"
            width="6"
            height="6"
            rx="0.75"
            fill="#4A6E58"
            initial={reducedMotion ? false : { clipPath: 'inset(100% 0% 0% 0%)' }}
            animate={{ clipPath: ticked ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)' }}
            transition={{ duration: READ_DUR.tick, ease: EASE.out }}
          />
        </svg>
      </span>
      <span className="relative font-display font-normal text-sr-ink-soft hiw-finding">
        {line}
        <motion.span
          aria-hidden
          initial={reducedMotion ? false : { clipPath: 'inset(-0.28em 100% -0.34em 0%)' }}
          animate={{
            clipPath: filled ? 'inset(-0.28em 0% -0.34em 0%)' : 'inset(-0.28em 100% -0.34em 0%)',
          }}
          transition={{ duration: READ_DUR.fill, ease: EASE.ink }}
          className="absolute inset-0 text-sr-ink"
        >
          {line}
        </motion.span>
      </span>
    </motion.div>
  );
}

/* ------------------------------ Photo marks ------------------------------ */
// Every stroke is drawn twice: a cream under-stroke at 2.2x width carries it
// over the light timber floor, then the ink over-stroke reads on the pale wall.

const markMotion = {
  initial: { opacity: 0, transform: 'scale(0.94)' },
  animate: { opacity: 0.9, transform: 'scale(1)' },
  exit: { opacity: 0, transition: { duration: READ_DUR.markOut, ease: EASE.exit } },
  transition: { duration: READ_DUR.markIn, ease: EASE.out },
};

function UnderOver({ d, width = 1.2, opacity = 0.3 }: { d: string; width?: number; opacity?: number }) {
  return (
    <>
      <path d={d} stroke="#F7F3E9" strokeOpacity="0.45" strokeWidth={width * 2.2} fill="none" />
      <path d={d} stroke="#1F3539" strokeOpacity={opacity} strokeWidth={width} fill="none" />
    </>
  );
}

/** Mark 1: the floor's convergence line running to the vanishing point. */
function MarkCamera() {
  return (
    <motion.g {...markMotion} style={{ transformOrigin: '200px 200px' }}>
      <UnderOver d="M40 235 L352 159" />
      <UnderOver d="M352 157 L364 157" />
      <UnderOver d="M358 151 L358 163" />
    </motion.g>
  );
}

/** Mark 2: the light wash from the window, with three falling rays. */
function MarkLight() {
  return (
    <motion.g {...markMotion} style={{ transformOrigin: '290px 132px' }}>
      <defs>
        <radialGradient id="hiw-light" cx="0.725" cy="0.44" r="0.55">
          <stop offset="0%" stopColor="#F7F3E9" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#F7F3E9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="400" height="300" fill="url(#hiw-light)" />
      <UnderOver d="M296 154 L276 176" opacity={0.22} />
      <UnderOver d="M308 156 L288 178" opacity={0.22} />
      <UnderOver d="M320 158 L300 180" opacity={0.22} />
    </motion.g>
  );
}

/** Mark 3: open corner ticks on the window and the door. Never closed boxes. */
function MarkOpenings() {
  return (
    <motion.g {...markMotion} style={{ transformOrigin: '320px 150px' }}>
      <CornerTicks x1={269} y1={113} x2={311} y2={151} />
      <CornerTicks x1={327} y1={107} x2={374} y2={197} />
    </motion.g>
  );
}

function CornerTicks({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const o = 3;
  const a = 9;
  const d = [
    `M${x1 - o} ${y1 - o + a} L${x1 - o} ${y1 - o} L${x1 - o + a} ${y1 - o}`,
    `M${x2 + o - a} ${y1 - o} L${x2 + o} ${y1 - o} L${x2 + o} ${y1 - o + a}`,
    `M${x1 - o} ${y2 + o - a} L${x1 - o} ${y2 + o} L${x1 - o + a} ${y2 + o}`,
    `M${x2 + o - a} ${y2 + o} L${x2 + o} ${y2 + o} L${x2 + o} ${y2 + o - a}`,
  ].join(' ');
  return <UnderOver d={d} width={1.4} opacity={0.34} />;
}

/** Mark 4: the living-zone floor plane, laid left to right, and it stays. */
function FloorPlane({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.g
      initial={reducedMotion ? false : { clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      transition={{ duration: READ_DUR.floorWipe, ease: EASE.out }}
      opacity={reducedMotion ? 0.6 : 1}
    >
      <path
        d="M0 300 L400 300 L400 214 L372 196 L245 189 L215 192 Z"
        fill="#7FA08A"
        fillOpacity="0.07"
        stroke="#5A7E68"
        strokeOpacity="0.26"
        strokeWidth="1"
      />
      {/* Dimension line with serifs and deliberately NO number: StageRight
          does not surface room dimensions, and a fabricated one is a lie. */}
      <UnderOver d="M60 278 L340 278 M60 273 L60 283 M340 273 L340 283" opacity={0.32} />
    </motion.g>
  );
}
