# How It Works: single-frame auto-playing stage

Date: 2026-08-17. Status: approved by Tara in conversation (she will iterate on the rendered result).
Replaces the four stacked step blocks in `src/components/landing/how-it-works.tsx` with one compact interactive stage. Motivation: the current section costs ~4 screens of scroll, and its step-2 annotation labels are percentage-positioned over an `object-cover` photo, so they drift off their targets at other viewport sizes.

## Decisions already made (with Tara, 2026-08-17)

1. **Pacing model: auto-play with controls.** The stage advances by itself; a visible step rail shows position; hover/touch pauses; clicking a step jumps there and switches to manual permanently (auto never resumes after user interaction).
2. **Step 2 treatment: checklist ticks (option B).** A small panel on the photo ticks four analysis items in order. Chosen over positioned labels (A) and narrated one-at-a-time (C) specifically because a checklist cannot mis-point at photo features at any screen size.
3. **Responsive at all screen sizes** is a hard requirement (mobile-first, per project baseline).
4. All existing step copy (titles, YOU/US doer tags, times, descriptions) carries over verbatim. The section heading block is unchanged.

## Layout

- **Desktop (lg+):** 12-col grid. Photo frame cols 1-7, copy panel cols 8-12 vertically centred. Step rail sits beneath the frame, inside the frame's column (amended 2026-08-17 during implementation: full-width pills at 1240px stretched absurdly and separated the control from the visual it drives; flagged to Tara with the rendered result).
- **Mobile/tablet:** stacked: frame, rail directly under it (the control sits next to the thing it controls), copy last.
- **Mobile rail compression:** four equal-width pills; inactive pills show the step number only; the active pill shows number + title and carries the progress fill. Desktop pills always show number + title.
- The frame keeps a locked `aspect-[4/3]` at every width (prevents layout shift between states; both photos render into it with `object-cover`).
- Section height lands around one viewport on desktop, versus ~4 today.

## The four states

One persistent frame; states crossfade (~500-600ms opacity). Both photos (`/landing/hero-empty.jpg`, `/landing/hero-staged-boho.jpg`) are mounted stacked from the start so the crossfade never pops on a cold cache. Overlay chips/pills reuse the existing visual language from the current illustrations (sr-ink dark chips, white/95 panels, sage for done-states).

| State | Photo | Overlays |
|---|---|---|
| 01 Upload | empty room | "Photo to stage" pill (top-left, as today) |
| 02 We read the room | empty room | "Reading the room…" chip (top-right, pulse dot) + checklist panel (bottom-left) ticking: Camera angle, Natural light, Doorways & windows, Layout & scale. Ticks appear sequentially within the step's 5s window (~0.8s apart), sage circles, always in order. Implementation note: per-item keyframe windows on one shared timeline, not `animation-delay` offsets (delays wrap out of order on loops). |
| 03 We stage it | staged Boho | green "Staged" tick-pill (top-left, as today) |
| 04 Download. Done. | staged Boho | "Virtually Staged · AI" watermark pill (bottom-right, as today) + white "Download" chip |

Copy panel swaps in sync with the frame: Fraunces italic number, doer/time mono block, title, description, styled as the current copy column (FR_NUMBER / FR_STEP_TITLE variation settings retained).

## Pacing & control

- 5 seconds per step. Progress fill animates across the active rail pill (terra fill on dark pill, matching the wireframe Tara saw).
- Starts at step 1 when the section first enters the viewport (IntersectionObserver, threshold ~0.35). Loops 1→2→3→4→1 while in view; timer suspends when scrolled out of view.
- Desktop: pointer hover over the frame or rail pauses; pointer leave resumes (unless manual). Touch devices: press-and-hold on the frame pauses while held; any tap on a rail pill goes straight to manual, so there is no ambiguous tap-to-pause state.
- Clicking/tapping any rail pill: jump to that step, stop auto-play permanently for this page view (manual mode). The rail remains fully usable.
- `prefers-reduced-motion: reduce`: no auto-play ever, no crossfade (instant swaps), no progress fill, no tick pop animation; the section renders as a manual stepper starting at step 1.

## Accessibility

- Rail pills are real `<button>`s, min 44px tap target, `aria-current="step"` on the active one, labelled "Step N: {title}".
- The rotating region does NOT announce changes (`aria-live` off) to avoid screen-reader spam; instead an `sr-only` static block renders all four steps' full copy in order, so the content is always available linearly.
- Auto-advance satisfies WCAG 2.2.2 via: pause on hover, permanent stop on interaction, and the reduced-motion opt-out.
- Focus-visible styling on pills per existing app conventions.

## Performance

- No new dependencies. framer-motion is already in the landing bundle; use it only for what CSS can't do cleanly (AnimatePresence on copy swap); crossfade + ticks + progress are plain CSS transitions/animations.
- The two jpgs are the existing ~25KB compressed landing assets, both mounted once, `loading="lazy"` (section is below the fold) with `decoding="async"`.
- Timer logic: single `setTimeout` chain in a `useEffect`, cleaned up on unmount/out-of-view; no `setInterval` leaks; no timers while out of view (battery).
- Zero layout shift: locked aspect ratio, absolutely-positioned stacked images, overlays absolutely positioned.

## What is deleted

- The four alternating 12-col step blocks and their per-step illustration components (`UploadIllustration`, `AnalyseIllustration`, `StageIllustration`, `DownloadValueIllustration`) are replaced by the stage (their overlay chrome is reused/adapted inside the stage states).
- The positioned annotation labels and their drift bug.

## Error handling

- If either image fails to load, the frame shows the existing warm-grey backdrop; overlays and copy still cycle (states remain meaningful text-wise). No JS error path can wedge the timer: state advance is wrapped in the effect's own lifecycle.

## Testing / verification

- `npm run build` must pass (apostrophe/no-unescaped-entities gate; use `&apos;`/`&hellip;` in JSX text).
- Existing drift-guard test suite (`npm run test`) must stay green; no test currently covers this component's markup, so verification is visual: dev-server screenshots at 375px (mobile emulation), 768px, and 1280px; reduced-motion check via emulation; keyboard-only walkthrough of the rail.
- Verify hover-pause, click-to-manual, out-of-view suspension, and loop wrap 04→01 in the browser before presenting.

## Out of scope

- No copy rewrites beyond what exists today.
- No changes to other landing sections. Tara has further improvement items queued; they are separate work.
