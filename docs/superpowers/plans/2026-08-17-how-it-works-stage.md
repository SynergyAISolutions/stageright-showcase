# How It Works Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four stacked How It Works blocks with one auto-playing single-frame stage (spec: `docs/superpowers/specs/2026-08-17-how-it-works-stage-design.md`).

**Architecture:** A pure reducer + `useStagePlayer` hook own all pacing state (auto/hover-paused/manual, step index, cycle nonce). The `HowItWorks` component renders one aspect-locked photo frame with per-step overlay groups crossfaded by CSS, a synced copy panel (framer-motion swap), and a rail of four pill buttons with a CSS progress fill. IntersectionObserver gates the timer; `useReducedMotion` disables auto-play entirely.

**Tech Stack:** Next.js 14 App Router client component, TypeScript strict, Tailwind, framer-motion 12, vitest + @testing-library/react.

## Global Constraints

- JSX text apostrophes must be `&apos;` and ellipses `&hellip;` (react/no-unescaped-entities breaks Amplify builds).
- No em dashes in user-facing copy (existing copy carries over verbatim, already compliant).
- Type imports on their own line, never `import { type X, valueFn }` (Turbopack undefined-value bug).
- TypeScript strict, no `any`.
- `npm run build` (not just type-check) must pass before any push.
- Existing step copy, heading block, and section chrome are retained verbatim from `src/components/landing/how-it-works.tsx`.

---

### Task 1: Stage player reducer + hook (TDD)

**Files:**
- Create: `src/components/landing/use-stage-player.ts`
- Test: `src/components/landing/use-stage-player.test.ts`

**Interfaces:**
- Produces: `stageReducer(state: StagePlayerState, event: StageEvent): StagePlayerState`; `useStagePlayer({ stepCount, stepMs, enabled }): { step: number; mode: StageMode; playing: boolean; cycle: number; jump(i: number): void; hold(): void; release(): void }`. Task 2 consumes the hook exactly as returned.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/landing/use-stage-player.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { stageReducer, useStagePlayer } from './use-stage-player';
import type { StagePlayerState } from './use-stage-player';

const auto: StagePlayerState = { step: 0, mode: 'auto', cycle: 0 };

describe('stageReducer', () => {
  it('TICK advances and wraps 3 -> 0', () => {
    expect(stageReducer({ ...auto, step: 2 }, { type: 'TICK', stepCount: 4 }).step).toBe(3);
    expect(stageReducer({ ...auto, step: 3 }, { type: 'TICK', stepCount: 4 }).step).toBe(0);
  });

  it('TICK is ignored outside auto mode', () => {
    expect(stageReducer({ step: 1, mode: 'manual', cycle: 0 }, { type: 'TICK', stepCount: 4 }).step).toBe(1);
    expect(stageReducer({ step: 1, mode: 'hover-paused', cycle: 0 }, { type: 'TICK', stepCount: 4 }).step).toBe(1);
  });

  it('JUMP sets the step and switches to manual permanently', () => {
    const jumped = stageReducer(auto, { type: 'JUMP', step: 2 });
    expect(jumped).toMatchObject({ step: 2, mode: 'manual' });
    // manual never returns to auto, even via RELEASE
    expect(stageReducer(jumped, { type: 'RELEASE' }).mode).toBe('manual');
  });

  it('HOLD pauses auto; RELEASE resumes and bumps cycle', () => {
    const held = stageReducer(auto, { type: 'HOLD' });
    expect(held.mode).toBe('hover-paused');
    const released = stageReducer(held, { type: 'RELEASE' });
    expect(released.mode).toBe('auto');
    expect(released.cycle).toBe(auto.cycle + 1);
  });

  it('HOLD does nothing in manual mode', () => {
    const manual: StagePlayerState = { step: 2, mode: 'manual', cycle: 0 };
    expect(stageReducer(manual, { type: 'HOLD' })).toEqual(manual);
  });
});

describe('useStagePlayer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances on the timer while enabled', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useStagePlayer({ stepCount: 4, stepMs: 5000, enabled: true })
    );
    expect(result.current.step).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.step).toBe(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.step).toBe(2);
  });

  it('does not advance while disabled (out of view / reduced motion)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useStagePlayer({ stepCount: 4, stepMs: 5000, enabled: false })
    );
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.step).toBe(0);
  });

  it('jump stops the clock for good', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useStagePlayer({ stepCount: 4, stepMs: 5000, enabled: true })
    );
    act(() => {
      result.current.jump(3);
    });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.step).toBe(3);
    expect(result.current.playing).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/landing/use-stage-player.test.ts`
Expected: FAIL, cannot resolve `./use-stage-player`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/landing/use-stage-player.ts
'use client';

import { useCallback, useEffect, useReducer } from 'react';

export type StageMode = 'auto' | 'hover-paused' | 'manual';

export interface StagePlayerState {
  step: number;
  mode: StageMode;
  /** Bumped on RELEASE so the progress fill can restart from zero in sync with the fresh timer. */
  cycle: number;
}

export type StageEvent =
  | { type: 'TICK'; stepCount: number }
  | { type: 'JUMP'; step: number }
  | { type: 'HOLD' }
  | { type: 'RELEASE' };

export function stageReducer(state: StagePlayerState, event: StageEvent): StagePlayerState {
  switch (event.type) {
    case 'TICK':
      if (state.mode !== 'auto') return state;
      return { ...state, step: (state.step + 1) % event.stepCount };
    case 'JUMP':
      return { step: event.step, mode: 'manual', cycle: state.cycle };
    case 'HOLD':
      return state.mode === 'auto' ? { ...state, mode: 'hover-paused' } : state;
    case 'RELEASE':
      return state.mode === 'hover-paused'
        ? { ...state, mode: 'auto', cycle: state.cycle + 1 }
        : state;
  }
}

export function useStagePlayer({
  stepCount,
  stepMs,
  enabled,
}: {
  stepCount: number;
  stepMs: number;
  enabled: boolean;
}) {
  const [state, dispatch] = useReducer(stageReducer, {
    step: 0,
    mode: 'auto',
    cycle: 0,
  } satisfies StagePlayerState);

  const playing = enabled && state.mode === 'auto';

  // One timeout per step; re-arms whenever the step lands or play resumes.
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => dispatch({ type: 'TICK', stepCount }), stepMs);
    return () => clearTimeout(id);
  }, [playing, state.step, state.cycle, stepCount, stepMs]);

  const jump = useCallback((step: number) => dispatch({ type: 'JUMP', step }), []);
  const hold = useCallback(() => dispatch({ type: 'HOLD' }), []);
  const release = useCallback(() => dispatch({ type: 'RELEASE' }), []);

  return { step: state.step, mode: state.mode, playing, cycle: state.cycle, jump, hold, release };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/landing/use-stage-player.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
```bash
git add src/components/landing/use-stage-player.ts src/components/landing/use-stage-player.test.ts
git commit -m "feat(landing): stage player reducer + hook for auto-playing How It Works"
```

---

### Task 2: Progress-fill keyframes + HowItWorks rewrite

**Files:**
- Modify: `src/app/globals.css` (append keyframes at end of file)
- Modify: `src/components/landing/how-it-works.tsx` (full rewrite below the heading block)

**Interfaces:**
- Consumes: `useStagePlayer` from Task 1 exactly as specified there.
- Produces: `HowItWorks()` export unchanged in name/signature (page.tsx import untouched).

- [ ] **Step 1: Append the progress keyframes to globals.css**

```css
/* How It Works stage: rail progress fill (width animated; play-state driven inline) */
@keyframes hiw-progress {
  from { width: 0%; }
  to { width: 100%; }
}
```

- [ ] **Step 2: Rewrite how-it-works.tsx**

Full replacement file content:

```tsx
'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';
import { cn } from '@/lib/utils/cn';
import { useStagePlayer } from './use-stage-player';

// Step copy carried over verbatim (times honest to Three Takes config; $2,300
// is the bottom of the verified industry range).
type Doer = 'YOU' | 'US';

interface Step {
  number: string;
  title: string;
  doer: Doer;
  time: string;
  description: string;
}

const steps: Step[] = [
  {
    number: '01',
    title: 'Upload',
    doer: 'YOU',
    time: '~5 seconds',
    description:
      'Drop in any photo of the room. Furnished or empty, doesn’t matter. Phone or camera. That’s the whole step.',
  },
  {
    number: '02',
    title: 'We read the room',
    doer: 'US',
    time: '~5 seconds',
    description:
      'Camera angle, light, openings, layout. The thinking that usually takes ten minutes of briefing a stager, done automatically.',
  },
  {
    number: '03',
    title: 'We stage it',
    doer: 'US',
    time: 'just minutes',
    description:
      'Three takes per style at full resolution. AI is creative and inconsistent, so three takes means you almost always have one you love.',
  },
  {
    number: '04',
    title: 'Download. Done.',
    doer: 'YOU',
    time: '~5 seconds',
    description:
      'Save the favourite and you’re done. No stylists to brief, no movers, no follow-up shoot, and roughly $2,300 still in your pocket.',
  },
];

const STEP_MS = 5000;

// Step 2 checklist (chosen over positioned labels: a checklist cannot
// mis-point at photo features at any viewport size).
const CHECKLIST = ['Camera angle', 'Natural light', 'Doorways & windows', 'Layout & scale'];

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
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { step, mode, playing, cycle, jump, hold, release } = useStagePlayer({
    stepCount: steps.length,
    stepMs: STEP_MS,
    enabled: inView && !reducedMotion,
  });

  const active = steps[step];
  const autoCapable = !reducedMotion && mode !== 'manual';

  return (
    <section
      id="how-it-works"
      className="relative z-10 py-20 sm:py-28 lg:py-32 bg-sr-cream-soft border-t border-b border-sr-hairline"
    >
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="max-w-[760px] mx-auto text-center mb-12 sm:mb-16">
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
            {/* Full linear copy for screen readers; the visual stage below is decorative rotation. */}
            <ol className="sr-only">
              {steps.map((s) => (
                <li key={s.number}>
                  {s.title} ({s.doer}, {s.time}): {s.description}
                </li>
              ))}
            </ol>

            <div aria-hidden className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-14 lg:items-center">
              {/* ------------------------------ Frame ------------------------------ */}
              <div className="lg:col-span-7">
                <div
                  ref={stageRef}
                  className="relative aspect-[4/3] rounded-2xl border border-sr-hairline shadow-[0_30px_60px_-28px_rgba(31,53,57,0.22),0_10px_24px_-10px_rgba(31,53,57,0.10)] overflow-hidden bg-[#d8d2c6]"
                  onPointerEnter={hold}
                  onPointerLeave={release}
                >
                  {/* Both photos stay mounted; crossfade by opacity. */}
                  <img
                    src="/landing/hero-empty.jpg"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'absolute inset-0 size-full object-cover',
                      !reducedMotion && 'transition-opacity duration-[600ms]',
                      step >= 2 ? 'opacity-0' : 'opacity-100'
                    )}
                  />
                  <img
                    src="/landing/hero-staged-boho.jpg"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      'absolute inset-0 size-full object-cover',
                      !reducedMotion && 'transition-opacity duration-[600ms]',
                      step >= 2 ? 'opacity-100' : 'opacity-0'
                    )}
                  />

                  {/* State 01: upload pill */}
                  <Overlay show={step === 0} reducedMotion={reducedMotion}>
                    <div className="absolute top-3 left-3 bg-sr-ink/90 backdrop-blur-sm text-[10px] font-bold text-white px-2.5 py-1 rounded-lg uppercase tracking-wider">
                      Photo to stage
                    </div>
                  </Overlay>

                  {/* State 02: reading chip + checklist */}
                  <Overlay show={step === 1} reducedMotion={reducedMotion}>
                    <div className="absolute top-3 right-3 bg-sr-ink/90 backdrop-blur-sm text-[10px] font-medium text-white px-2.5 py-1 rounded-md flex items-center gap-1.5">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full rounded-full bg-sr-terra opacity-75 animate-ping motion-reduce:animate-none" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-sr-terra" />
                      </span>
                      Reading the room&hellip;
                    </div>
                    {/* Remount per activation so the tick sequence replays. */}
                    <div
                      key={step === 1 ? `checklist-${cycle}-on` : 'checklist-off'}
                      className="absolute left-3 bottom-3 sm:left-4 sm:bottom-4 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 shadow-soft border border-white"
                    >
                      {CHECKLIST.map((item, i) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 py-[3px] text-[11px] sm:text-[12px] font-medium text-sr-ink"
                        >
                          <span className="relative inline-flex size-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-sr-ink/20">
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 10 10"
                              fill="none"
                              className={cn(
                                'absolute text-white rounded-full',
                                reducedMotion || step !== 1
                                  ? 'opacity-100'
                                  : 'opacity-0 animate-[hiw-tick_0.3s_ease-out_forwards]'
                              )}
                              style={
                                reducedMotion || step !== 1
                                  ? undefined
                                  : { animationDelay: `${0.6 + i * 0.85}s` }
                              }
                              aria-hidden
                            >
                              <rect width="10" height="10" rx="5" className="fill-[#4F7E5E]" />
                              <path
                                d="M2.6 5.2l1.7 1.7L7.6 3.6"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          {item}
                        </div>
                      ))}
                    </div>
                  </Overlay>

                  {/* State 03: staged pill */}
                  <Overlay show={step === 2} reducedMotion={reducedMotion}>
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
                  </Overlay>

                  {/* State 04: watermark + download chip */}
                  <Overlay show={step === 3} reducedMotion={reducedMotion}>
                    <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded bg-sr-ink">
                      <span className="font-mono text-[10px] sm:text-[10.5px] font-medium uppercase tracking-[0.16em] text-sr-cream-soft whitespace-nowrap">
                        Virtually Staged &middot; AI
                      </span>
                    </div>
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-xs font-medium text-sr-ink px-3 py-1.5 rounded-lg border border-white shadow-soft flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M6 2v6M3 6l3 3 3-3M2 10h8"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Download
                    </div>
                  </Overlay>
                </div>

                {/* ------------------------------ Rail ------------------------------ */}
                <div className="mt-4 lg:mt-5 grid grid-cols-4 gap-2" aria-hidden={false}>
                  {steps.map((s, i) => {
                    const isActive = i === step;
                    return (
                      <button
                        key={s.number}
                        type="button"
                        onClick={() => jump(i)}
                        aria-label={`Step ${s.number}: ${s.title}`}
                        aria-current={isActive ? 'step' : undefined}
                        className={cn(
                          'relative overflow-hidden rounded-full min-h-[44px] px-2 sm:px-3',
                          'font-mono text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.14em]',
                          'transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sr-terra',
                          isActive
                            ? 'bg-sr-ink text-sr-cream-soft'
                            : 'bg-white text-sr-ink-soft border border-sr-hairline hover:border-sr-ink/30 hover:text-sr-ink'
                        )}
                      >
                        {/* Progress fill only while auto-capable; paused via play-state. */}
                        {isActive && autoCapable && (
                          <span
                            key={`fill-${step}-${cycle}`}
                            className="absolute inset-y-0 left-0 bg-sr-terra/45 animate-[hiw-progress_5000ms_linear_both]"
                            style={{ animationPlayState: playing ? 'running' : 'paused' }}
                            aria-hidden
                          />
                        )}
                        <span className="relative z-10">
                          {s.number}
                          <span className={cn('ml-1.5', isActive ? 'inline' : 'hidden lg:inline')}>
                            {s.title}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ------------------------------ Copy ------------------------------ */}
              <div className="lg:col-span-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active.number}
                    initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: reducedMotion ? 0 : 0.25, ease: 'easeOut' }}
                  >
                    <div className="flex items-start gap-5 mb-5">
                      <span
                        className="font-display italic font-light text-[clamp(56px,7.5vw,96px)] leading-[0.85] tracking-[-0.05em] text-sr-terra"
                        style={FR_NUMBER}
                      >
                        {active.number}
                      </span>
                      <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] leading-[1.55] pt-3">
                        <span className={active.doer === 'US' ? 'text-sr-terra' : 'text-sr-ink-soft'}>
                          {active.doer}
                        </span>
                        <br />
                        <span className="text-sr-ink-mute">{active.time}</span>
                      </div>
                    </div>

                    <h3
                      className="font-display font-normal text-[clamp(32px,3.6vw,46px)] leading-[1.06] tracking-[-0.03em] text-sr-ink mb-5"
                      style={FR_STEP_TITLE}
                    >
                      {active.title}
                    </h3>

                    <p className="text-[16px] sm:text-[17px] leading-[1.6] text-sr-ink-soft max-w-[46ch] lg:min-h-[6.4em]">
                      {active.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}

/** Crossfading overlay group for one stage state. Stays mounted; toggles opacity. */
function Overlay({
  show,
  reducedMotion,
  children,
}: {
  show: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0',
        !reducedMotion && 'transition-opacity duration-500',
        show ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
    >
      {children}
    </div>
  );
}
```

Also append to `src/app/globals.css` (with the hiw-progress keyframes from Step 1):

```css
@keyframes hiw-tick {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}
```

Notes for the implementer:
- The rail sits inside the frame's grid column so it hugs the visual on desktop AND lands directly under the frame on mobile (frame, rail, copy stacking order per spec).
- `aria-hidden` on the visual grid: the sr-only `<ol>` above is the accessible content; the rail buttons must stay interactive, so `aria-hidden={false}` is set explicitly on the rail container inside the hidden region. Verify with a screen reader tree (browser accessibility panel) that the buttons are exposed; if the nested un-hiding proves unreliable in testing, move the rail outside the `aria-hidden` wrapper instead.
- `lg:min-h-[6.4em]` on the description prevents the copy column from changing height between steps on desktop (longest description ~4 lines at 46ch).
- The checklist tick delays are single-run (`forwards`), not looping, so `animationDelay` staggering is safe here (the loop-order bug only affects infinite animations).

- [ ] **Step 3: Type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: all pass. Build is mandatory (unescaped-entity gate). Note the copy strings use `’` escapes inside TS strings, which is lint-safe.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS including Task 1's 8 tests and the existing disclosure copy test.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/how-it-works.tsx src/app/globals.css
git commit -m "feat(landing): replace stacked How It Works with auto-playing single-frame stage"
```

---

### Task 3: Visual verification at three widths + interaction checks

**Files:**
- Modify: `.claude/launch.json` (add dev-server entry alongside the existing brainstorm-companion entry)

**Interfaces:**
- Consumes: the running app at `/#how-it-works`.

- [ ] **Step 1: Add the dev server to launch.json**

```json
{
  "name": "stageright-dev",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "port": 3000
}
```

(If port 3000 is held by a zombie, `next dev` port-hops; read the actual port from preview logs and use it.)

- [ ] **Step 2: Start preview, scroll to the section, verify desktop (1280px)**

Checks: frame left / copy right, vertically centred; auto-advance every ~5s with terra progress fill sweeping the active pill; crossfade to staged photo at step 03; checklist ticks in order on step 02; hover on frame pauses fill and advance; unhover resumes from a fresh fill; clicking a pill jumps and kills auto for good; loop wraps 04 to 01.

- [ ] **Step 3: Verify tablet (768px) and mobile (375px, mobile preset)**

Checks: stack order frame, rail, copy; inactive pills show numbers only, active pill shows number + title; no horizontal scroll; tap targets at least 44px; checklist panel legible and inside the frame at 375px.

- [ ] **Step 4: Verify reduced-motion path**

Temporarily hardcode `const reducedMotion = true;` in the component, reload: no auto-play, no crossfade (instant swaps), no progress fill, all ticks visible immediately, rail fully clickable. Revert the hardcode after screenshotting.

- [ ] **Step 5: Keyboard pass**

Tab to the rail: focus-visible ring appears per pill; Enter/Space activates; `aria-current` follows.

- [ ] **Step 6: Commit launch.json (if changed) and fixes**

```bash
git add -A
git commit -m "chore: dev-server launch entry + visual verification fixes for How It Works stage"
```

---

### Task 4: Adversarial review + fix findings

- [ ] **Step 1:** Run the ultracode review workflow over `git diff master...HEAD` with reviewers for (a) spec fidelity against `docs/superpowers/specs/2026-08-17-how-it-works-stage-design.md`, (b) accessibility, (c) performance/bundle, (d) code quality; adversarially verify each finding before acting.
- [ ] **Step 2:** Fix confirmed findings, re-run `npm run build` and `npm run test`, commit fixes.
- [ ] **Step 3:** Present the running section to Tara with screenshots at all three widths for her iteration pass.

## Plan Self-Review

- Spec coverage: layout (Task 2 grid + rail placement), four states (Overlay groups), pacing/control (Task 1 reducer + Task 2 wiring + hover/pointer handlers), reduced motion (Tasks 1-2 flags, Task 3 step 4), accessibility (sr-only ol, aria-current, 44px, Task 3 step 5), performance (stacked mounted imgs, single timeout, CSS animations), deletion of old blocks (full-file rewrite), error handling (bg colour fallback on frame). Covered.
- Placeholders: none; all code inline.
- Type consistency: `useStagePlayer` return `{ step, mode, playing, cycle, jump, hold, release }` matches usage in Task 2; `StagePlayerState.cycle` used by fill key and checklist key.
