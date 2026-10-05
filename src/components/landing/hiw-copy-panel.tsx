'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Fragment } from 'react';
import {
  BODY_DIM,
  COPY_EXIT,
  COPY_SCORE,
  DUR,
  EASE,
  STAGGER_WORD,
} from './hiw-motion-tokens';

export interface CopyStep {
  number: string;
  title: string;
  doer: 'YOU' | 'US';
  time: string;
  description: string;
}

const FR_STEP_TITLE = { fontVariationSettings: '"opsz" 96, "SOFT" 30' };
const FR_NUMBER = { fontVariationSettings: '"opsz" 144, "SOFT" 100' };

/*
 * Each element's motion is derived from what that element DOES, and the score
 * is absolute (offsets from step start) rather than a parent stagger, because
 * a parent stagger can only front-load. Result: the panel unfolds across the
 * dwell instead of arriving as one undifferentiated blob.
 *
 *   numeral  — an index. Ink rises inside its own outline: it is being SET.
 *   meta     — spec data. Prints on mechanically, left to right, like a label.
 *   title    — the claim. Words rise out of a feathered mask with weight.
 *   body     — the thing you READ. A reading light sweeps it in reading order.
 *   rule     — punctuation. Draws late, so the panel is still alive mid-dwell.
 */

const panelVariants: Variants = {
  initial: {},
  enter: {},
  leave: {},
  /** The real exit already ran off the cue; this is a 60ms formality. */
  gone: { opacity: 0, transition: { duration: 0.06 } },
};

/** Separate node so the exit's opacity and the settle's transform never fight. */
const settleVariants: Variants = {
  initial: { transform: 'translateY(10px)' },
  enter: {
    transform: 'translateY(0px)',
    transition: { duration: DUR.settle, ease: EASE.out },
  },
  leave: { transform: 'translateY(0px)' },
};

const numeralGhostVariants: Variants = {
  initial: { opacity: 0 },
  enter: {
    opacity: [0, 1, 1, 0],
    transition: { duration: DUR.ghost, times: [0, 0.17, 0.59, 1], ease: 'linear' },
  },
  leave: { opacity: 0, transition: { duration: 0.12 } },
};

/*
 * The right and bottom insets stay NEGATIVE in every state: an italic numeral
 * leans past its own border box, so a flush inset(… 0% …) shears the tail off
 * the "1". Units must match per argument position across keyframes for the
 * clip to stay compositor-eligible, hence em on right/bottom throughout and
 * a large em value (not 100%) for the drain.
 */
const numeralInkVariants: Variants = {
  initial: { clipPath: 'inset(100% -0.24em -0.12em 0%)' },
  enter: {
    clipPath: 'inset(0% -0.24em -0.12em 0%)',
    transition: { delay: COPY_SCORE.ink, duration: DUR.ink, ease: EASE.ink },
  },
  leave: {
    clipPath: 'inset(0% -0.24em 1.4em 0%)',
    transition: { delay: COPY_EXIT.numeral, duration: DUR.fast, ease: EASE.exit },
  },
};

// Negative top/bottom insets are mandatory: a flush inset(0% ...) slices the
// descenders in "seconds". Same units per argument position on both keyframes.
const META_OPEN = 'inset(-0.25em 0% -0.35em 0%)';
const META_CLOSED = 'inset(-0.25em 100% -0.35em 0%)';

const metaDoerVariants: Variants = {
  initial: { clipPath: META_CLOSED, x: 6 },
  enter: {
    clipPath: META_OPEN,
    x: 0,
    transition: { delay: COPY_SCORE.metaDoer, duration: 0.52, ease: EASE.out },
  },
  leave: {
    clipPath: META_CLOSED,
    x: 6,
    transition: { delay: COPY_EXIT.meta, duration: 0.22, ease: EASE.exit },
  },
};

/** Prints in reading order, directly after the doer line. Same mechanical
    wipe: it is the same kind of information. */
const metaTimeVariants: Variants = {
  initial: { clipPath: META_CLOSED, x: 6 },
  enter: {
    clipPath: META_OPEN,
    x: 0,
    transition: { delay: COPY_SCORE.metaTime, duration: 0.38, ease: EASE.out },
  },
  leave: {
    clipPath: META_CLOSED,
    x: 6,
    transition: { delay: COPY_EXIT.meta, duration: 0.22, ease: EASE.exit },
  },
};

/*
 * Title: one smooth left-to-right wipe with a small drift in from the left,
 * whole line, matching the direction every ink fill in the section travels.
 * Negative vertical insets protect Fraunces ascenders and descenders.
 */
const titleVariants: Variants = {
  initial: { clipPath: 'inset(-0.15em 100% -0.2em 0%)', x: -14, opacity: 0 },
  enter: {
    clipPath: 'inset(-0.15em 0% -0.2em 0%)',
    x: 0,
    opacity: 1,
    transition: { delay: COPY_SCORE.title, duration: DUR.titleWipe, ease: EASE.out },
  },
  leave: {
    opacity: 0,
    x: -8,
    transition: { delay: COPY_EXIT.title, duration: DUR.fast, ease: EASE.exit },
  },
};

/*
 * Body: strict reading order. The block does not exist until the title has
 * fully landed; then it wipes on left to right already AT its legible floor
 * state, and the reading light sweeps it afterwards. The block owns the exit.
 */
const bodyBlockVariants: Variants = {
  initial: { clipPath: 'inset(-0.1em 100% -0.2em 0%)', opacity: 0 },
  enter: {
    clipPath: 'inset(-0.1em 0% -0.2em 0%)',
    opacity: 1,
    transition: { delay: COPY_SCORE.body, duration: DUR.bodyWipe, ease: EASE.out },
  },
  leave: {
    opacity: 0,
    y: -6,
    transition: { delay: COPY_EXIT.body, duration: DUR.fast, ease: EASE.exit },
  },
};

/** Linear: an eased curve across a 0.24 opacity delta is imperceptible. */
const bodyWordVariants = (i: number): Variants => ({
  initial: { opacity: BODY_DIM },
  enter: {
    opacity: 1,
    transition: { delay: COPY_SCORE.light + i * STAGGER_WORD, duration: DUR.light, ease: 'linear' },
  },
  leave: { opacity: 1 },
});

const numberClass =
  'relative inline-flex pr-[0.2em] pb-[0.1em] font-display italic font-light text-[clamp(56px,7.5vw,96px)] leading-[0.92] tracking-[-0.05em] text-sr-terra';
const metaClass = 'font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] leading-[1.55]';
const titleClass =
  'font-display font-normal text-[clamp(32px,3.6vw,46px)] leading-[1.06] tracking-[-0.03em] text-sr-ink mb-4';
const bodyClass = 'text-[16px] sm:text-[17px] leading-[1.6] text-sr-ink-2 max-w-[46ch] lg:min-h-[6.4em]';

export function CopyPanel({
  active,
  leaving,
  reducedMotion,
}: {
  active: CopyStep;
  leaving: boolean;
  reducedMotion: boolean;
}) {
  if (reducedMotion) return <StaticCopyPanel active={active} />;

  const bodyWords = active.description.split(' ');

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active.number}
        initial="initial"
        animate={leaving ? 'leave' : 'enter'}
        exit="gone"
        variants={panelVariants}
      >
        <motion.div variants={settleVariants}>
          <div className="flex items-start gap-5 mb-5">
            {/* Numeral: the ink rises inside its own outline, like a number
                being set. The ghost pen leads the ink by 180ms. */}
            <span className={numberClass} style={{ ...FR_NUMBER, fontVariantNumeric: 'tabular-nums' }}>
              <motion.span
                variants={numeralGhostVariants}
                aria-hidden
                className="absolute inset-0 pr-[0.2em] pb-[0.1em]"
                style={{ color: 'transparent', WebkitTextStroke: '1px rgba(199,111,78,0.38)' }}
              >
                {active.number}
              </motion.span>
              <motion.span variants={numeralInkVariants} className="relative">
                {active.number}
              </motion.span>
            </span>

            {/* Meta: spec data, printed on. The time arrives late, as payoff. */}
            <div className={`${metaClass} pt-3`}>
              {/* timber-deep / ink-soft: both clear 4.5:1 AA on cream at this size. */}
              <motion.span
                variants={metaDoerVariants}
                className={`block ${active.doer === 'US' ? 'text-sr-timber-deep' : 'text-sr-ink-soft'}`}
              >
                {active.doer}
              </motion.span>
              <motion.span variants={metaTimeVariants} className="block text-sr-ink-soft">
                {active.time}
              </motion.span>
            </div>
          </div>

          {/* Title: the claim, first in reading order. One smooth wipe from
              the left; the body does not exist until this has fully landed. */}
          <motion.h3 variants={titleVariants} className={titleClass} style={FR_STEP_TITLE}>
            {active.title}
          </motion.h3>

          {/* Body: the thing you read. A reading light sweeps it in reading
              order at ~2.6x reading speed, so it leads the eye without ever
              withholding — the unlit floor already passes AA. */}
          <motion.p variants={bodyBlockVariants} className={bodyClass}>
            {bodyWords.map((word, i) => (
              <Fragment key={`${word}-${i}`}>
                <motion.span variants={bodyWordVariants(i)}>{word}</motion.span>
                {i < bodyWords.length - 1 ? ' ' : null}
              </Fragment>
            ))}
          </motion.p>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Reduced motion: one static branch, no word splitting, no duplicate DOM. */
function StaticCopyPanel({ active }: { active: CopyStep }) {
  return (
    <div>
      <div className="flex items-start gap-5 mb-5">
        <span className={numberClass} style={{ ...FR_NUMBER, fontVariantNumeric: 'tabular-nums' }}>
          {active.number}
        </span>
        <div className={`${metaClass} pt-3`}>
          <span
            className={`block ${active.doer === 'US' ? 'text-sr-timber-deep' : 'text-sr-ink-soft'}`}
          >
            {active.doer}
          </span>
          <span className="block text-sr-ink-soft">{active.time}</span>
        </div>
      </div>
      <h3 className={titleClass} style={FR_STEP_TITLE}>
        {active.title}
      </h3>
      <p className={bodyClass}>{active.description}</p>
    </div>
  );
}
