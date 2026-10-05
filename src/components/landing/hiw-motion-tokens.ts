// Motion tokens for the How It Works stage. One system, five moments.
// Derived from the 2026-08-17 motion research synthesis (Carbon / M3 / Apple
// convergence): three duration registers, asymmetric enter/exit easings, one
// stagger, one spring accent. No inline durations or easings in the section —
// everything imports from here.

export const STEP_MS = 5000;

/**
 * The copy panel's exit pre-fires 450ms before the swap, off the SAME CSS
 * clock as stepfill (a second keyframe on the same element), so pausing or
 * jumping can never desync the exit from the step change.
 */
export const CUE_MS = STEP_MS - 450; // 4550

export const DUR = {
  /** Detail register: ticks, chips, copy exits, rail colour shifts. */
  fast: 0.24,
  /** Scene register: secondary swaps. */
  scene: 0.6,
  /** Ceremony register: ONE animation per cycle (the 02→03 sweep). */
  hero: 1.9,

  // Copy panel registers
  /** Numeral outline: in, hold, out (keyframed). */
  ghost: 1.52,
  /** Numeral clip fill: the ink rising inside the outline. */
  ink: 1.15,
  /** Title: one left-to-right wipe, whole line. */
  titleWipe: 0.85,
  /** Body block: fast left-to-right wipe to its floor state, post-title. */
  bodyWipe: 0.4,
  /** Body, per word. Shorter than the gap between words, so at most two or
      three are ever mid-change: that is what reads ordered rather than busy. */
  light: 0.38,
  /** Panel long-tail settle; still travelling at t=4200ms. */
  settle: 4.2,
} as const;

export const EASE = {
  /** easeOutExpo: every entrance and settle. */
  out: [0.16, 1, 0.3, 1] as const,
  /** easeOutQuart: the numeral ink fill only. */
  ink: [0.22, 1, 0.36, 1] as const,
  /** Strong in-out: the hero clip-path sweep ONLY. */
  sweep: [0.77, 0, 0.175, 1] as const,
  /** easeInQuint: every exit, at ~0.33x the paired entrance. */
  exit: [0.64, 0, 0.78, 0] as const,
};

/** The only stagger interval outside the copy panel (entrances only). */
export const STAGGER = 0.06;

/** Choreography offset: image leads, copy follows. */
export const LEAD = 0.12;

/**
 * Body words. HARD CEILING 0.15: above that the reading light front runs
 * slower than a 400wpm reader and the animation starts withholding text.
 * At 0.1 with the light starting at 1.9s, the worst case (23 words) starts
 * its last word at 1.9 + 22*0.1 = 4.1s and settles at 4.48s, clear of the
 * 4.55s exit cue.
 */
export const STAGGER_WORD = 0.1;

/**
 * Absolute offsets from step start, in seconds. This score REPLACES parent
 * staggerChildren: a parent stagger can only front-load (every child rides one
 * monotonic ramp), which is exactly why the old panel emptied at ~1.1s of a
 * 5s dwell and then sat frozen.
 *
 * STRICT READING ORDER, everywhere (Tara's rule, 2026-08-17): number, doer,
 * time, title, body: each element lands before the next begins. The earlier
 * "time arrives late as a punchline" idea was deliberately removed: once the
 * rest of the panel became reading-ordered, the one exception read as a
 * mistake, and its second job (keeping the panel alive mid-dwell) is covered
 * by the reading light, which sweeps until ~4.5s.
 */
export const COPY_SCORE = {
  settle: 0,
  ghostIn: 0,
  ink: 0.18,
  metaDoer: 0.42,
  metaTime: 0.66,
  title: 0.72,
  body: 1.65,
  light: 1.9,
} as const;

/** Offsets from the `leaving` cue (t = CUE_MS). */
export const COPY_EXIT = {
  body: 0.05,
  meta: 0.09,
  title: 0.13,
  numeral: 0.15,
} as const;

/**
 * Body resting opacity. Computed via WCAG relative luminance with sRGB alpha
 * compositing over sr-cream-soft #F7F3E9:
 *   sr-ink-2 #2C4549 @ 1.00 -> 9.23:1
 *   sr-ink-2 #2C4549 @ 0.76 -> 4.79:1  (AA pass — this is the floor)
 *   sr-ink-2 #2C4549 @ 0.72 -> 4.32:1  (fails)
 * The body must be sr-ink-2, not sr-ink-soft: #4F6468 is only 5.65:1 at full
 * opacity and cannot be dimmed below 0.90 without failing AA, which makes the
 * illumination invisible. The unlit floor is legible, so words are LIT, never
 * revealed — a reader who ignores the animation loses nothing.
 */
export const BODY_DIM = 0.76;

/** The section's single physical accent: step-04 watermark/download chips. */
export const SPRING_ACCENT = {
  type: 'spring',
  visualDuration: 0.5,
  bounce: 0.15,
} as const;

/*
 * Step 02 "We read the room" (band spec v4).
 *
 * The band is ONE object: a ruled reading ledger. A tick is a property of a
 * sentence, not a neighbour of one: it lives in a fixed leading gutter on its
 * own finding's row and fires the moment that sentence finishes inking.
 * Findings ACCUMULATE (a row lands, is inked, and stays; it only ever leaves
 * by being pushed up out of a masked viewport). The continuous motion spine is
 * the READ RULE: one 1px sage hairline growing linearly along the band's
 * bottom edge for 3.64s, with notches the edge crosses on the exact frame
 * each finding completes. Marks still land 180ms BEFORE their words.
 *
 * Three findings, not four: four honest findings cannot be read inside 5000ms
 * (they ran at 21-26 characters per second against a ~17 CPS legibility
 * ceiling). The fourth finding's floor-plane mark survives as the wordless
 * resolve: the step ends by showing the inference, not narrating it.
 *
 * All motion ends at 4300ms; the last 700ms is deliberate stillness, and the
 * copy panel's exit cue (4550ms) fires inside it.
 */

/** Absolute ms offsets from step start. */
export const READ_SCORE = {
  veil: 0,
  masthead: 140,
  /** THE SPINE. One linear motion, 180 -> 3820. Never ease this. */
  rule: 180,
  ruleEnd: 3820,
  marks: [300, 1520, 2740, 3560],
  findings: [480, 1700, 2920],
  fills: [600, 1820, 3040],
  ticks: [1380, 2600, 3820],
  counters: [1660, 2880],
  resolve: 3900,
  quiet: 4300,
} as const;

export const READ_DUR = {
  veil: 0.3,
  masthead: 0.24,
  /** LINEAR, always. Any easing on a progress element lies about progress. */
  rule: 3.64,
  markIn: 0.22,
  markOut: 0.14,
  rowIn: 0.4,
  fill: 0.78,
  tick: 0.28,
  shift: 0.52,
  floorWipe: 0.42,
  resolve: 0.4,
} as const;

/** Rule notch positions, as fractions of the rule's own travel. */
export const READ_NOTCHES = [0.33, 0.665, 1.0] as const;

/** Feathered top edge on the findings viewport. Painted once. Never animate. */
export const ROW_MASK = {
  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 0.55em, #000 100%)',
  maskImage: 'linear-gradient(to bottom, transparent 0, #000 0.55em, #000 100%)',
} as const;

/**
 * Photo marks live in this normalised space. Both landing photos are verified
 * 4:3 (hero-empty 800x600, hero-staged-boho 1448x1086) and the frame is
 * aspect-[4/3], so object-cover crops nothing and marks map to the same photo
 * pixels at every width. If either asset stops being 4:3, every mark decouples
 * from its feature.
 */
export const READ_VIEWBOX = '0 0 400 300';

/**
 * Findings are checkable by eye against hero-empty.jpg. The honesty gate: if a
 * visitor can look at the photo and see a finding is wrong, that is worse than
 * the generic category label ever was. No fabricated measurements.
 */
export const READ_FINDINGS = [
  { key: 'camera', line: 'Corner view, eye level' },
  { key: 'light', line: 'Light from the window' },
  { key: 'openings', line: 'Door right, window ahead' },
] as const;
