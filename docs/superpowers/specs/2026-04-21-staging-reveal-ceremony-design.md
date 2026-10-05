# Staging Reveal Ceremony — Gift Framework — Design

**Date:** 2026-04-21
**Status:** Design draft; pending spec review
**Scope:** Redesign the single-style staging flow's three emotional beats — the wait, the reveal, and the afterglow — to apply a gift/receipt framework. Specifically: (1) replace the generic loader with a full-frame concierge wait screen that narrates real observations from the analyser, (2) replace the 200 ms opacity fade reveal with a 2-second "lid-lift" slider sweep, (3) rebuild the afterglow with an editorial nameplate, a persistent concierge-notes expander, a share-export button that generates a vertical comparison image, and a one-time first-stage welcome toast.
**Out of scope:** Batch-page (`/stage/batch/[batchId]`) ceremony — same framework will be applied in a follow-on spec. Re-wiring the dormant conversational-edit feature. Audio design. Tutorial / onboarding changes. Pricing-tier changes. Any change to the Lambda staging-worker code.

---

## 1. Background & motivation

Today's single-style flow ships Stage 2 (reveal) only, and flatly. The 20–40 s wait presents a generic animated SVG and six hard-coded rotating messages identical regardless of style, room type, or user input. The reveal itself is a 200 ms opacity fade with the slider pre-positioned at 50/50 — zero anticipation window, no sweep, no hold. The afterglow is a one-line status header followed by three action buttons. This treats a moment of craft as a status bar.

The product's emotional peak — where an agent decides "this is magic" vs "another AI tool" — is being spent on chrome. We already have the raw material sitting in memory: the analyser (`runAnalysis` in `src/lib/ai/run-analysis.ts`) produces 200+ words of observational detail about the specific room that currently gets consumed by the Lambda and thrown away from the user's perspective. The slider component (`before-after-slider.tsx`) has an `autoPlay` prop wired and ready, just sequenced in the wrong direction for a reveal.

This spec applies Tim Gabe's gift framework (https://www.youtube.com/watch?v=uoLpH_20qKw — anticipation → reveal → afterglow) across all three stages using material we already generate.

---

## 2. Positioning & locked decisions

All four of these were settled during brainstorming and should not be re-litigated in implementation:

- **Register:** Concierge during the wait (personal designer narrating observations); Apple-restraint on the reveal (no confetti, no glow blast, no sound).
- **Audience:** Real-estate professionals. Anything that reads as casino / Duolingo / gamification is wrong. Anything that reads as craftsmanship respect is right.
- **Repeatability:** Agents stage many rooms per week. Total ceremony budget is ~2 s for the reveal and the existing 20–40 s for the wait — no additional time added. Touch-to-interrupt lets power users skip the reveal ceremony mid-animation; the wait ceremony rides on time we're already spending.
- **Sound:** None, ever. Audio in a listing meeting or client call is a liability.
- **Haptics:** A single subtle haptic tap on mobile at the 100 %-staged hold. Off-switchable only if testing shows it feels wrong; no user setting.
- **Scope of "first":** Everything in this spec ships in two PRs (see §10). We are not re-writing the whole flow — we are adding weight to the three beats.

---

## 3. Design principles

1. **The wait is observation, not waiting.** The user isn't waiting for a result; they're being walked through what the AI is noticing in their specific room. Every concierge note references something real about the image.
2. **The reveal earns the wait.** After anticipation, the image is progressively unveiled — every pixel-width of slider sweep is its own tiny dopamine event. No pre-positioned 50/50.
3. **The afterglow turns the result into identity.** The editorial nameplate frames the agent as a curator; the share export amplifies that framing to their professional network; the welcome toast marks the induction moment.
4. **Honesty over theatre.** We surface actual observations from the actual analyser output — not simulated "AI is thinking" beats. If analysis fails, we fall back to warm style+room templates, not fake activity.
5. **Every pixel of chrome is legible regardless of photo content.** Users upload dark rooms, bright rooms, busy rooms, flat rooms. All UI on top of the ghost hero must survive any of them.

---

## 4. Architecture & data flow

```
Wizard "Notes" step
  └── user clicks Stage
      │
      ├── (1) POST /api/analyse ──────► runAnalysis()
      │                                  ├── Claude Opus 4.7 (admin) / Bedrock Opus 4.6
      │                                  ├── returns { analysis, concierge_notes[] }   ◄─ NEW field
      │                                  └── concierge_notes parsed from the last
      │                                      section of the analysis text
      │
      ├── (2) setState({ conciergeNotes }) — wizard holds notes in state
      │
      ├── (3) setStep('generating')  ──► <StagingWaitConcierge>  ◄─ NEW full-frame component
      │                                   (replaces <StagingLoader> for the wizard;
      │                                    loader stays for /stage/batch page)
      │
      ├── (4) POST /api/stage ────────► Lambda invoked async (unchanged)
      │
      ├── (5) pollJob(jobId) loop — client polls /api/jobs every 3 s
      │
      └── (6) on 'done' → GET /api/jobs returns { imageUrl, s3Key, sessionId, isFirstStage }
             │                                                              ▲
             │                                                              └─ NEW flag,
             │                                                                 set when
             │                                                                 server
             │                                                                 atomically
             │                                                                 writes
             │                                                                 user.firstStageAt
             │
             └── setStep('result')  ──► <ResultStage>  ◄─ rewritten result section
                                         ├── <EditorialNameplate style={…} roomTypes={…} />
                                         ├── <BeforeAfterSlider autoReveal={…} />  ◄─ NEW mode
                                         ├── <ConciergeNotesExpander notes={…} />
                                         ├── sticky footer: Download | Share | Try another | Gallery
                                         ├── if isFirstStage: <FirstStageWelcomeToast />
                                         └── (existing) <FlagReviewDialog>
```

Everything after `/api/stage` stays on the current path — this is a presentation-layer redesign plus two small backend additions (concierge notes parsed from the analysis text, and `firstStageAt` written on first successful completion).

---

## 5. Data & type changes

### 5.1 `User` type (`src/types/index.ts`)

Add one optional field:

```ts
export interface User extends BaseEntity {
  // …existing fields…
  firstStageAt?: string | null;  // ISO timestamp of first successful stage
}
```

### 5.2 Analyser return type (`src/lib/ai/run-analysis.ts`)

```ts
export interface RunAnalysisResult {
  analysis: string;           // unchanged — the Lambda-facing text
  concierge_notes: string[];  // NEW — 3–5 short user-facing strings, ≤ 14 words each
}
```

### 5.3 `/api/analyse` response shape

Already returns `runAnalysis()`'s result object verbatim via `NextResponse.json(result)`. Adding `concierge_notes` is automatic once `runAnalysis` returns it. No schema changes on the route.

### 5.4 `/api/jobs` response shape (`src/app/api/jobs/route.ts`)

On `status === 'done'`, append one field:

```ts
return NextResponse.json({
  status: 'done',
  imageUrl: parsed.signedUrl,
  s3Key: parsed.s3Key,
  text: parsed.text,
  review: parsed.review,
  sessionId: parsed.sessionId,
  isFirstStage,             // NEW — true iff this poll transitioned firstStageAt from null
});
```

The `isFirstStage` flag is computed inside the GET handler using a ConditionalUpdate against DynamoDB (see §6.1.3). This makes first-stage detection atomic across parallel tabs and idempotent across repeated polls — only one poll of one session ever sees `isFirstStage: true` for a given user.

---

## 6. Detailed component-by-component spec

### 6.1 Backend

#### 6.1.1 Analyser prompt change (`src/lib/ai/run-analysis.ts`)

Append a new section #6 to `ANALYSIS_SYSTEM_PROMPT` (after the existing section #5, "Furniture WITHIN constraints"). Exact text to append:

```
6. **CONCIERGE NOTES** — 2 to 3 short observations about this SPECIFIC ROOM, written for the USER to read during the 20–40 s wait for their staged image. These layer on top of 3 style-derived notes the app already has (see §6.1.4) — your job here is ROOM-SPECIFIC observation, not STYLE-GENERAL description. Rules:
   - Each note ≤ 14 words. Present tense. Warm, observational, no jargon.
   - Reference something real and visible in the hero photo (a feature, a lighting direction, a proportion).
   - Observational, NOT promissory. Say "Noted the bay window — keeping that sightline clear" not "We'll fix the wall crack".
   - Never mention structural changes, colour changes, or anything we would not deliver.
   - If USER NOTES are present in the user message (above the style calibration block), include EXACTLY ONE note that echoes the user's wording back (e.g. user said "cosy" → "You asked for cosy — leaning into soft timber tones"). This is a single, concrete acknowledgement, not a paraphrase.
   - Do NOT include the style name or room type unless it adds real information beyond the user already knowing what they picked.

Format the section EXACTLY as below, with one bullet per note and no extra commentary:

CONCIERGE NOTES:
- [note 1]
- [note 2]
- [note 3]
(optional 4th and 5th notes, same format)
```

After the Claude call returns, add a parser and return both fields:

```ts
function parseConciergeNotes(analysis: string): string[] {
  const match = analysis.match(/CONCIERGE NOTES:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 200) // guard against runaway bullets
    .slice(0, 3);
}

// …inside runAnalysis, replacing the final `return { analysis };`:
const conciergeNotes = parseConciergeNotes(analysis);
return { analysis, concierge_notes: conciergeNotes };
```

Cache behaviour: the system prompt change invalidates Anthropic's prompt cache ephemeral entries. Cache refills on the first call. No action required on our side.

Max-tokens: current value is 1200. The added section should add ~100 tokens of output. Raise `max_tokens` to 1400 to give headroom and avoid truncation mid-bullet.

#### 6.1.2 Lambda (`lambda/staging-worker/index.mjs`) — **no changes**

The Lambda reads `roomAnalysis` as free-form text (which is exactly what it's always been — the CONCIERGE NOTES section sits at the end as additional context, harmless for staging). No re-deploy needed for PR 1.

#### 6.1.3 `/api/jobs` — first-stage detection (`src/app/api/jobs/route.ts`)

Inside the `status === 'done'` branch, before the `return NextResponse.json`:

```ts
// Atomic first-stage detection. ConditionExpression guarantees only one
// poll (across all tabs / reloads) transitions firstStageAt from unset → set.
// `attribute_not_exists` is sufficient because createUser does not write the
// field at all; we only ever write it as an ISO timestamp (never as null).
let isFirstStage = false;
try {
  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${session.user.id}`, sk: 'PROFILE' },
    UpdateExpression: 'SET firstStageAt = :now, updatedAt = :now',
    ConditionExpression: 'attribute_not_exists(firstStageAt)',
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
    },
  }));
  isFirstStage = true;
} catch (err) {
  // Conditional check failed ⇒ firstStageAt was already set by an earlier poll.
  // Any other error swallowed — the welcome toast is a nice-to-have, not critical.
  // (Distinguish ConditionalCheckFailedException from real errors if you want
  // to log the latter; the flag stays false either way.)
  isFirstStage = false;
}
```

Add the `UpdateCommand` import from `@aws-sdk/lib-dynamodb` at the top of the file (currently only imports `GetCommand`).

Cost note: One ConditionalUpdate per completed poll per user. Each stage's job-polling loop eventually hits this branch exactly once (subsequent polls for the same job are rare — the client tears down the loop on the first `done`). Insignificant.

Admin consideration: admins' `firstStageAt` is also set on their first stage. Fine — admins don't see the toast because they've already completed many stages in development, and the toast is designed to be show-once anyway.

#### 6.1.4 Style-derived concierge base notes (`src/lib/ai/prompts.ts`)

The wait-screen narration must NEVER fall back to generic stock phrases like "Matching the lighting and perspective" — those are UI filler and undercut the concierge tone. Instead, we author 3 concierge-voiced notes per style, derived directly from each style's `STYLE_DETAILS` design direction (i.e. the actual instructions we give the staging model). These notes are always available; no API call needed.

**Add to `src/lib/ai/prompts.ts`:**

```ts
/**
 * Concierge-voiced base notes per style. Three per style, rendered to the
 * user during the wait screen alongside (0-3) room-specific observations
 * from the analyser. Interpolation: `{roomLabel}` is replaced at render time
 * with `roomTypes[0]?.toLowerCase() ?? 'room'`.
 *
 * Derived from STYLE_DETAILS — these are the actual design directions the
 * staging model is told to execute, voiced as concierge narration.
 */
export const STYLE_CONCIERGE_BASE: Record<StagingStyle, [string, string, string]> = {
  Modern: [
    'Layering clean lines and neutral tones through your {roomLabel}.',
    'Adding geometric shapes and polished surfaces.',
    'Finishing with one or two bold accent pieces.',
  ],
  Scandinavian: [
    'Warming your {roomLabel} with light wood and soft whites.',
    'Layering cozy textiles for hygge.',
    'Keeping shapes organic, mood calm.',
  ],
  Coastal: [
    'Pulling light blues and sandy beiges into your {roomLabel}.',
    'Weaving in rattan and linen textures.',
    'Aiming for that relaxed beach-house feel.',
  ],
  Hamptons: [
    'Layering classic white and navy across your {roomLabel}.',
    'Adding natural timber and elegant proportions.',
    'Finishing with relaxed-luxury details.',
  ],
  Luxury: [
    'Layering marble, velvet, and brass accents into your {roomLabel}.',
    'Placing statement lighting as the anchor.',
    'Finishing with high-end designer touches.',
  ],
  Farmhouse: [
    'Warming your {roomLabel} with rustic timber and natural fabrics.',
    'Adding warm whites and vintage-inspired pieces.',
    'Keeping it cozy and inviting.',
  ],
  'Mid-Century Modern': [
    'Choosing organic curves and tapered-leg pieces for your {roomLabel}.',
    'Layering warm woods with bold retro colours.',
    'Placing iconic 1950s–60s pieces as anchors.',
  ],
  Industrial: [
    'Balancing exposed metal and raw timber in your {roomLabel}.',
    'Adding leather and concrete tones.',
    'Aiming for that urban-warehouse feel.',
  ],
  Minimalist: [
    'Choosing very few carefully placed pieces for your {roomLabel}.',
    'Keeping the palette monochrome.',
    'Leaving clean negative space — less is more.',
  ],
  'Contemporary Australian': [
    'Layering native timber and natural stone through your {roomLabel}.',
    'Pulling in earthy tones and indoor-outdoor touches.',
    'Keeping the mood relaxed but refined.',
  ],
  Japandi: [
    'Choosing low-profile natural wood furniture for your {roomLabel}.',
    'Layering ceramic, linen, and a muted earthy palette.',
    'Leaving negative space — warm minimalism.',
  ],
  Boho: [
    'Layering rattan, textiles, and warm earth tones in your {roomLabel}.',
    'Adding terracotta and ochre accents.',
    'Finishing with plants and eclectic, free-spirited pieces.',
  ],
};
```

**Render-time combination** (see §6.3.2 for the wizard integration):

```ts
function buildConciergeNotes(args: {
  style: StagingStyle;
  roomTypes: RoomType[];
  analyserNotes: string[];  // 0-3 strings from /api/analyse; [] if analyser failed
}): string[] {
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const base = STYLE_CONCIERGE_BASE[args.style].map(
    (n) => n.replace('{roomLabel}', roomLabel),
  );
  return [...base, ...args.analyserNotes];
}
```

**Resulting note counts per stage:**

| Analyser state | Notes shown | Total |
|---|---|---|
| Happy path, no user-typed notes | 3 base + 2–3 room observations | 5–6 |
| Happy path, user-typed notes present | 3 base + 2 observations + 1 user-echo | 6 |
| Analyser failed entirely | 3 base only | 3 |
| Analyser returned empty `concierge_notes[]` | 3 base only | 3 |

With note-rotation timing `max(6000, min(8000, 40000 / N))` (see §6.2.1.4), `N = 6` gives ~6.7 s per note — fits the 40 s budget cleanly. `N = 3` gives the 8 s clamp, which also fits a shorter wait.

**Why this matters.** Every user who triggers the wait screen sees real style-intent content from the first second of the wait. Generic "Reading your room…" filler is removed from the product entirely. The only bar a note has to clear is "was this authored against the actual style direction the staging model is following?" — and all 36 base notes are.

---

### 6.2 Client — new components

All new components live under `src/components/staging/` unless noted.

#### 6.2.1 `staging-wait-concierge.tsx` (NEW)

Replaces `<StagingLoader>` for the wizard's `generating` step. Lives under `src/components/staging/staging-wait-concierge.tsx`.

**Props:**

```ts
interface StagingWaitConciergeProps {
  /** Signed or local blob URL for the hero photo. Required — the component
   *  always renders a ghost background. Caller is responsible for having
   *  a URL ready before mounting. */
  heroImageUrl: string;
  /** Pre-combined concierge notes from the wizard — style-derived base
   *  (§6.1.4) + 0-3 room observations from the analyser (§6.1.1). Always
   *  non-empty in practice (at minimum 3 base notes). Component is a pure
   *  presentational consumer; it does NOT compute fallbacks itself. */
  conciergeNotes: string[];
}
```

**Layout (positioning).** Fills the `<main>` work area — the same flex region that WizardCard occupies in other steps. On mobile that's viewport-minus-header; on desktop that's the centred padded area at max-w-6xl. Does NOT use `position: fixed` or `100vw/100vh` — stays inside the normal document flow.

```
<section className="relative w-full h-full overflow-hidden rounded-none sm:rounded-2xl bg-brand-navy">
  ─ Ghost photo layer (absolute inset-0) — may fail to load; onError hides it
  ─ Gradient overlay layer (absolute inset-0) — always visible, sits over ghost
  ─ Content layer (absolute inset-0, flex, centred, padding for safe areas + chrome)
     ─ Orientation chip (top-right, safe-area-inset-top aware)
     ─ Note text (centred, max-w-[52ch])
  ─ Progress line (absolute bottom-0, safe-area-inset-bottom aware)
</section>
```

The `bg-brand-navy` on the section is critical — if the ghost photo fails to load (hidden via `onError`), the gradient overlay sits on top of the navy background and the component still looks intentional, not broken.

**6.2.1.1 Ghost photo layer.**

```tsx
<img
  src={heroImageUrl}
  alt=""
  aria-hidden
  className="absolute inset-0 size-full object-cover"
  style={{
    filter: 'blur(24px) brightness(0.7) saturate(0.8)',
    transform: 'scale(1.08)',  // pre-overshoot to hide blur edge artefacts
    animation: 'stage-wait-ken-burns 40s linear forwards',
  }}
  onError={(e) => {
    // Hero failed to load — hide the image so the underlying navy
    // gradient (below) carries the component alone. Notes still render.
    (e.currentTarget as HTMLImageElement).style.display = 'none';
  }}
/>
```

Ken-burns animation keyframes (add to `src/app/globals.css` or a module CSS file):

```css
@keyframes stage-wait-ken-burns {
  from { transform: scale(1.08); }
  to   { transform: scale(1.16); }
}
```

The 8 % zoom over 40 s is ~0.2 % / s — imperceptible individually, felt cumulatively. Starting at 1.08 × pre-overshoots the blur's edge blur artefacts so the photo always fully covers the viewport even with object-fit: cover.

**6.2.1.2 Gradient overlay layer.**

```tsx
<div
  aria-hidden
  className="absolute inset-0"
  style={{
    background:
      'radial-gradient(ellipse at center, rgba(15, 29, 46, 0.55) 0%, rgba(15, 29, 46, 0.78) 100%)',
  }}
/>
```

The navy RGB is `brand-navy` in the design system. Radial gradient darkens the edges more than the centre, directing attention to the note text. Alpha values are tuned so that the brightest possible hero photo (a direct flash of a white wall) still allows white 32 px DM Serif text at the centre to pass WCAG AA (4.5:1 contrast) — verify during implementation with an actual bright photo; bump the edge alpha to 0.82 if it fails.

**6.2.1.3 Orientation chip (top-right).**

```tsx
<div
  className="absolute top-0 right-0 pt-3 pr-4"
  style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
>
  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/80 text-[11px] font-medium px-3 py-1.5 tracking-wide">
    <span className="size-1.5 rounded-full bg-brand-teal animate-pulse" />
    Staging · 20–40s
  </span>
</div>
```

Chip is **translucent**, not solid — it reads as environmental, not a UI element. The pulsing teal dot is the only subtle motion cue besides the ken-burns.

**6.2.1.4 Note rotator (centre).**

Logic: given `N = notes.length`, rotate through them sequentially with 500 ms cross-fade between notes. Time per note = `max(6000, min(8000, 40000 / N))` — scales with expected 40 s wait, clamped [6, 8] s.

For N = 3: ~8 s each. For N = 4: 8 s each (capped). For N = 5: 8 s each (capped). The loader keeps rendering the last note after the rotation completes; it does not loop.

```tsx
const [index, setIndex] = useState(0);
useEffect(() => {
  if (notes.length <= 1) return;
  const msPerNote = Math.max(6000, Math.min(8000, 40000 / notes.length));
  const id = setInterval(() => {
    setIndex((i) => Math.min(i + 1, notes.length - 1));
  }, msPerNote);
  return () => clearInterval(id);
}, [notes.length]);

<AnimatePresence mode="wait">
  <motion.p
    key={index}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -6 }}
    transition={{ duration: 0.5, ease: 'easeOut' }}
    className="font-heading text-white text-[28px] sm:text-[32px] leading-snug text-center max-w-[52ch] px-6"
  >
    {notes[index]}
  </motion.p>
</AnimatePresence>
```

Font is `font-heading` (DM Serif Display) — already loaded app-wide. Max-width 52 ch keeps the line from stretching thin on ultra-wide monitors. Mobile gets 28 px; sm: bumps to 32 px.

**6.2.1.5 Progress line.**

```tsx
<div
  className="absolute left-0 right-0 h-[2px] bg-white/10"
  style={{ bottom: 'env(safe-area-inset-bottom)' }}
>
  <motion.div
    className="h-full bg-brand-teal"
    initial={{ width: '0%' }}
    animate={{ width: '95%' }}
    transition={{ duration: 30, ease: 'linear' }}
  />
</div>
```

Stops at 95 % so it doesn't reach "complete" before the image actually arrives — the last 5 % is conceptually "rendering the final frame". When the wizard transitions to `step === 'result'`, this component unmounts entirely, so there's no need to animate to 100 %.

#### 6.2.2 `editorial-nameplate.tsx` (NEW)

Under `src/components/staging/editorial-nameplate.tsx`.

**Props:**

```ts
import type { StagingStyle } from '@/lib/ai/prompts';

interface EditorialNameplateProps {
  style: StagingStyle;  // e.g. "Coastal" — must be one of STAGING_STYLES
  roomTypes: string[];  // e.g. ["Living Room"] or ["Living Room", "Dining Room"]
}
```

**Layout.** Replaces the current `<header>` row in the `result` step of `src/app/stage/page.tsx` (lines 807–817). Takes the same flex-shrink-0 position at the top of the result section.

```tsx
<header className="flex-shrink-0 px-5 sm:px-8 py-4 sm:py-5 text-center border-b border-surface-border/60 bg-white">
  <p className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.14em]">
    Staged · {roomTypes.join(' · ')}
  </p>
  <h2 className="mt-1 font-heading text-[26px] sm:text-[32px] text-brand-navy tracking-tight leading-tight">
    {style}
  </h2>
</header>
```

Mobile: 26 px serif style name, 10 px tracked eyebrow. Desktop: 32 px serif name. Checkmark icon is removed — confidence replaces confirmation. Credit count is removed from this surface; it lives in the top-bar `<CreditBalance>` component already.

Multi-room display: "Living Room · Dining Room" rendered in the eyebrow, style stays unitary.

Edge case: on very narrow phones (< 340 px) with long styles like "Contemporary Australian", the serif name may wrap. Two lines is acceptable — do NOT force no-wrap.

#### 6.2.3 `concierge-notes-expander.tsx` (NEW)

Under `src/components/staging/concierge-notes-expander.tsx`. Sits under the slider, above the action footer.

**Props:**

```ts
import type { StagingStyle } from '@/lib/ai/prompts';

interface ConciergeNotesExpanderProps {
  notes: string[];     // same concierge notes the user saw during the wait
  style: StagingStyle; // drives the palette accent (STYLE_PALETTES from prompts.ts)
}
```

**Empty-notes behaviour.** The wizard always supplies at least the 3 style-derived base notes (§6.1.4 and §6.3.2), so `notes.length` is never 0 in normal use. The component keeps a defensive `if (notes.length === 0) return null;` guard in case someone wires it up outside the wizard without the combination logic, but under normal wizard flow the expander always renders with 5–6 real, style-intent-backed notes.

**Collapsed state.**

```tsx
<button
  type="button"
  onClick={() => setExpanded((e) => !e)}
  className="mx-auto inline-flex items-center gap-2 rounded-full border border-surface-border bg-white hover:bg-surface-secondary px-4 py-2 text-xs font-medium text-brand-navy transition-colors"
>
  <span className="size-1.5 rounded-full" style={{ backgroundColor: STYLE_PALETTES[style][0] }} />
  {notes.length} things we watched for in your room
  <svg className={cn('size-3 transition-transform', expanded && 'rotate-180')} … chevron-down />
</button>
```

**Expanded state — staggered reveal.**

```tsx
<motion.ul
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: 'auto', opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.25, ease: 'easeOut' }}
  className="overflow-hidden mt-3 space-y-2 max-w-[640px] mx-auto"
>
  {notes.map((note, i) => (
    <motion.li
      key={i}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 + i * 0.08 }}
      className="flex items-start gap-3 text-sm text-ink-secondary"
    >
      <span className="mt-1.5 size-1 rounded-full flex-shrink-0" style={{ backgroundColor: STYLE_PALETTES[style][i % 3] }} />
      <span>{note}</span>
    </motion.li>
  ))}
</motion.ul>
```

Palette dot per note — cycles through the three-colour style palette. Ties the notes visually to the style the agent just rendered.

**Stagger timing.** Each note enters 80 ms after the previous, starting at 100 ms (first note appears while the container is still opening). Entry is opacity 0 → 1 plus an 8 px left-to-right shift, so each note feels like it "slides in from the margin" rather than popping. For a 6-note list the total entry animation is ~500 ms. The micro-interaction pattern is straight from the video's Duolingo reference — the expander feels alive, not like a wall of text dumped in one frame.

#### 6.2.4 `share-export-button.tsx` (NEW)

Under `src/components/staging/share-export-button.tsx`. Sits in the sticky footer next to `<Download>` and `<Try another style>`.

**Props:**

```ts
interface ShareExportButtonProps {
  beforeImageUrl: string;  // signed URL or blob URL for the empty-room hero
  afterImageUrl: string;   // signed URL for the staged result
  style: string;           // rendered on the export
  roomTypes: string[];     // rendered on the export eyebrow
}
```

**Behaviour.**

On click:
1. Show a loading state on the button (spinner replacing the icon).
2. Call `renderShareExport({ before, after, style, roomTypes })` — returns a Blob.
3. Trigger a browser download of the Blob as `stageright-<style-slug>-<room-slug>.png`.
4. Restore button state.

**`renderShareExport` implementation (in `src/lib/utils/share-export.ts`, NEW file).**

```ts
interface RenderShareExportInput {
  beforeImageUrl: string;
  afterImageUrl: string;
  style: string;
  roomTypes: string[];
}

export async function renderShareExport(input: RenderShareExportInput): Promise<Blob> {
  const WIDTH = 1080;
  const HEIGHT = 1920;

  // Ensure DM Serif Display is ready before we measure/render text.
  if ('fonts' in document) {
    await document.fonts.load('600 64px "DM Serif Display"');
    await document.fonts.load('500 24px "Outfit"');
  }

  const [beforeImg, afterImg] = await Promise.all([
    loadImage(input.beforeImageUrl),
    loadImage(input.afterImageUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — soft warm off-white, not pure white
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Layout constants
  const PAD = 60;
  const TEXT_BAND_HEIGHT = 240;  // centre band between before/after
  const IMG_HEIGHT = (HEIGHT - TEXT_BAND_HEIGHT - PAD * 2) / 2; // two equal image bands
  const IMG_WIDTH = WIDTH - PAD * 2;

  // Before image (top)
  drawCoveredImage(ctx, beforeImg, PAD, PAD, IMG_WIDTH, IMG_HEIGHT);

  // After image (bottom)
  drawCoveredImage(ctx, afterImg, PAD, PAD + IMG_HEIGHT + TEXT_BAND_HEIGHT, IMG_WIDTH, IMG_HEIGHT);

  // Text band — style nameplate + room label
  const bandTop = PAD + IMG_HEIGHT;
  ctx.fillStyle = '#0f1d2e'; // brand-navy
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Eyebrow — small label
  ctx.font = '500 22px "Outfit"';
  ctx.fillStyle = '#64748b'; // ink-muted
  const eyebrow = input.roomTypes.join(' · ').toUpperCase();
  ctx.fillText(eyebrow, WIDTH / 2, bandTop + 70);

  // Style name — editorial serif
  ctx.font = '600 96px "DM Serif Display"';
  ctx.fillStyle = '#0f1d2e';
  ctx.fillText(input.style, WIDTH / 2, bandTop + 150);

  // Footer — StageRight mark
  ctx.font = '500 20px "Outfit"';
  ctx.fillStyle = '#94a3b8'; // ink-subtle
  ctx.fillText('Staged with StageRight', WIDTH / 2, HEIGHT - 40);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob returned null'));
    }, 'image/png', 0.95);
  });
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawCoveredImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
): void {
  const srcRatio = img.width / img.height;
  const dstRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcRatio > dstRatio) {
    // source wider — crop sides
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    // source taller — crop top/bottom
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
```

**CORS requirement.** S3 signed URLs must respond with `Access-Control-Allow-Origin: *` (or matching origin) so canvas `toBlob` doesn't taint. Verify this during implementation by opening the Network tab on the existing staging result page and checking the response headers of the signed URLs. If they don't include the CORS header, add `AllowedOrigins: ["*"]` to the S3 bucket CORS policy. **This is a pre-flight check — the spec assumes CORS is already permissive because the signed URLs are `<img>`-loaded today without issue, but this must be confirmed before implementing the canvas export, because `<img>` tags load cross-origin without CORS while `canvas.toBlob` does not.**

**Fallback.** If `renderShareExport` throws (CORS, missing font, out-of-memory), the button catches and shows an inline error toast: *"Couldn't build the share image — please try again."* — and does not download anything.

#### 6.2.5 `first-stage-welcome-toast.tsx` (NEW)

Under `src/components/staging/first-stage-welcome-toast.tsx`.

**Props:**

```ts
interface FirstStageWelcomeToastProps {
  onDismiss: () => void;  // called when user clicks X or after auto-dismiss
}
```

**Behaviour.**

- Mounts when the wizard's `result` step first renders AND `isFirstStage === true` from the `/api/jobs` response.
- Slides in from the bottom after a 1.5 s delay (lets the reveal sweep complete first).
- Auto-dismisses after 8 s, or on click of the X, or on any click outside.
- LocalStorage key `stageright:welcome-seen` is set to `'1'` on mount as a secondary guard — if a user refreshes during the toast window, they won't see it twice. Server-side `firstStageAt` is the primary guard; this is belt-and-braces.

**Markup.**

```tsx
<motion.div
  initial={{ y: 80, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 80, opacity: 0 }}
  transition={{ duration: 0.4, ease: 'easeOut', delay: 1.5 }}
  className="fixed left-1/2 -translate-x-1/2 z-50 bottom-4 sm:bottom-6 max-w-[420px] w-[calc(100vw-2rem)]"
  style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
  role="status"
  aria-live="polite"
>
  <div className="flex items-start gap-3 bg-brand-navy text-white rounded-2xl shadow-elevated px-4 py-3.5 pr-2">
    <span className="flex-shrink-0 size-8 rounded-full bg-brand-teal/20 text-brand-teal flex items-center justify-center">
      <svg … sparkle-icon />
    </span>
    <div className="flex-1 min-w-0 pt-0.5">
      <p className="font-medium text-[14px] leading-snug">
        Your first staged room.
      </p>
      <p className="text-[12px] text-white/70 leading-snug mt-0.5">
        It lives in your gallery now.
      </p>
    </div>
    <button
      type="button"
      onClick={onDismiss}
      className="flex-shrink-0 size-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
      aria-label="Dismiss"
    >
      <svg … x-icon className="size-3.5" />
    </button>
  </div>
</motion.div>
```

Copy (exact): top line *"Your first staged room."* — full stop included. Bottom line *"It lives in your gallery now."* — full stop included.

### 6.3 Client — modified components

#### 6.3.1 `before-after-slider.tsx` (MODIFIED)

At `src/components/comparison/before-after-slider.tsx`.

**What changes.**

The existing `autoPlay` prop sequences `100 → 0 → 50` — wrong direction for a gift reveal (the current code shows the staged payoff first, then wipes to empty, then settles). Replace the `autoPlay` effect with an `autoReveal` effect that sequences `0 → 100 → 50`.

**New prop signature.**

```ts
interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  /** When true, runs the 2 s lid-lift reveal animation on mount.
   *  Replaces the legacy autoPlay prop. Handler-safe: any user pointer
   *  interaction cancels the animation and hands control over. */
  autoReveal?: boolean;
  fitParent?: boolean;
  /** Optional callback fired exactly once when the sweep hits 100 %
   *  (t = 1400 ms). Used by the wizard to trigger the mobile haptic. */
  onRevealPeak?: () => void;
}
```

**Remove** the existing `autoPlay` prop entirely. There are zero other callers (verified: the wizard sets it `false` by default, the batch result passes no value so defaults to `false`). No backwards-compatibility shim needed.

**Update the initial `position` state** to respect `autoReveal`:

```ts
// BEFORE:
const [position, setPosition] = useState(autoPlay ? 100 : 50);

// AFTER:
const [position, setPosition] = useState(autoReveal ? 0 : 50);
```

When `autoReveal` is true, the slider mounts with the empty room visible (position = 0), not the staged room. The animation effect then takes over.

**New animation effect.**

```ts
useEffect(() => {
  if (!autoReveal) return;
  let rafId = 0;
  let startTime: number | null = null;
  let cancelled = false;
  let peakFired = false;

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const tick = (now: number) => {
    if (cancelled || hasInteractedRef.current) return;
    if (startTime === null) startTime = now;
    const t = now - startTime;

    if (t < 200) {
      // hold at 0% (empty room visible) — the anticipation beat
      setPosition(0);
    } else if (t < 1400) {
      // sweep 0 → 100 over 1200 ms (t=200..1400) with ease-out
      const p = easeOut((t - 200) / 1200);
      setPosition(p * 100);
    } else if (t < 1700) {
      // hold at 100 % (staged room fully visible) — the gift beat
      if (!peakFired) {
        peakFired = true;
        onRevealPeak?.();
      }
      setPosition(100);
    } else if (t < 2000) {
      // ease 100 → 50 over 300 ms — settle into comparison
      const p = easeOut((t - 1700) / 300);
      setPosition(100 - p * 50);
    } else {
      setPosition(50);
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}, [autoReveal, onRevealPeak]);
```

**Handle glow at peak + tactile desktop hover.** Two small additions to the drag-handle element:

1. **Glow:** a white blur halo appears only while `position ∈ [95, 100]` — signalling the reveal peak.
2. **Hover scale (desktop):** on devices that support hover, the handle scales from 1.0 → 1.05 on cursor-over. Drag/active state escalates to 1.1 as before. On touch devices `onPointerEnter` fires on touch-start and `isDragging` immediately takes over, so hover state is unobservable — no mobile regression.

Add `isHovered` state alongside the existing `isDragging`:

```tsx
const [isHovered, setIsHovered] = useState(false);

// Handle element:
<div
  onPointerEnter={() => setIsHovered(true)}
  onPointerLeave={() => setIsHovered(false)}
  className="absolute top-1/2 size-10 rounded-full bg-white shadow-elevated flex items-center justify-center"
  style={{
    left: `${position}%`,
    transform: `translateX(-50%) translateY(-50%) scale(${
      isDragging ? 1.1 : isHovered ? 1.05 : 1
    })`,
    transition: 'transform 150ms ease-out',
    boxShadow: position >= 95
      ? '0 0 24px 6px rgba(255, 255, 255, 0.5), 0 8px 24px rgba(15, 29, 46, 0.25)'
      : '0 8px 24px rgba(15, 29, 46, 0.25)',
  }}
>
```

The transition duration lifts from 100ms → 150ms — the slower curve makes the hover response feel weighted rather than jumpy. All three states (rest / hover / drag) ride the same curve, so escalation feels like one continuous gesture.

**Pointer interaction cancels the animation.** Already handled — `handlePointerDown` sets `hasInteractedRef.current = true`, and the animation tick exits early when that's true. No change needed.

**Labels during reveal.** Currently the "Before" / "Staged" labels are visible from mount. Keep them visible during the reveal — at position=0 only the "Before" label is over visible content, at position=100 only the "Staged" label is. The labels become the caption for what's currently shown. Working as-is.

#### 6.3.2 `src/app/stage/page.tsx` (MODIFIED — wizard orchestration)

**Change set:**

1. **Add `conciergeNotes` state** alongside existing wizard state:

```ts
const [conciergeNotes, setConciergeNotes] = useState<string[]>([]);
```

2. **Build combined concierge notes and set to state** — pre-fill with style-derived base immediately so they're visible the instant the wait screen mounts, then replace with `base + analyser observations` once the analyse call returns.

   Import the helper and the base record:

```ts
import { STYLE_CONCIERGE_BASE, type StagingStyle } from '@/lib/ai/prompts';

function buildConciergeNotes(args: {
  style: StagingStyle;
  roomTypes: RoomType[];
  analyserNotes: string[];  // 0-3; [] if analyser failed
}): string[] {
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const base = STYLE_CONCIERGE_BASE[args.style].map(
    (n) => n.replace('{roomLabel}', roomLabel),
  );
  return [...base, ...args.analyserNotes];
}
```

   Inside `runSingleStaging`, **before** the analyse call — pre-fill base notes:

```ts
setConciergeNotes(buildConciergeNotes({
  style: usedStyle,
  roomTypes,
  analyserNotes: [],  // base-only until analyser returns
}));
```

   When analyse returns (happy path), re-compute with the observations appended:

```ts
if (aRes.ok) {
  const aData = await aRes.json();
  if (aData.analysis) {
    analysis = aData.analysis as string;
    analysisCacheRef.current.set(cacheKey, analysis);
  }
  const analyserNotes = Array.isArray(aData.concierge_notes) ? aData.concierge_notes : [];
  setConciergeNotes(buildConciergeNotes({
    style: usedStyle,
    roomTypes,
    analyserNotes,
  }));
}
```

   If analyse fails (network error, 5xx), the earlier pre-fill stays — user keeps seeing the 3 base notes without any drama. No additional error handling needed.

   Note: when the `notes.length` prop changes mid-wait (because analyser returned mid-rotation), the note rotator's `useEffect` re-runs and recomputes the interval timing from the new length. The current index stays valid (it's just an array index), so the rotation continues seamlessly — no visual skip or reset.

   Clear on start-over only:

```ts
// inside startOver:
setConciergeNotes([]);
```

3. **Add `isFirstStage` state and capture it** in both the `runSingleStaging` completion block and the resume-in-flight effect (two places):

```ts
const [isFirstStage, setIsFirstStage] = useState(false);
// …
// inside the two places pollJob().then((data) => …)
setIsFirstStage(Boolean(data.isFirstStage));
```

4. **Replace the `generating` WizardCard branch** (lines 775–786 in current file) with:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    key="generating"
    heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
    conciergeNotes={conciergeNotes}
  />
)}
```

   Note: this branch drops the WizardCard wrapper entirely — the concierge wait component handles its own chrome. `StagingWaitConcierge` is full-bleed within the main flex container and takes over the wizard card's visual slot.

5. **Replace the `result` header** (current lines 807–817, the one-line checkmark + style + credit) with the `<EditorialNameplate>` component:

```tsx
<EditorialNameplate style={styles[0] ?? ''} roomTypes={roomTypes} />
```

6. **Drop the slider's default 50/50 behaviour on first mount in the result step.** Inside the result branch, pass `autoReveal` and `onRevealPeak`:

```tsx
<BeforeAfterSlider
  beforeSrc={heroSignedUrl || heroPhoto?.preview || ''}
  afterSrc={stagedImage}
  beforeLabel="Empty"
  afterLabel="Staged"
  className="rounded-xl"
  fitParent
  autoReveal
  onRevealPeak={() => {
    // Subtle mobile haptic at the 100 % beat. Quietly absent on
    // desktop and on mobile browsers without the Vibration API.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
  }}
/>
```

   **Nuance:** `autoReveal` should fire only on the very first mount of the slider per stage, not on every re-render or on "Try another style" (which re-uses the result step with a new image). To guarantee this, the slider is keyed by `lastStagedS3Key`:

```tsx
<BeforeAfterSlider
  key={lastStagedS3Key}
  …
/>
```

   This forces React to unmount and remount when the staged image changes — guaranteeing fresh `autoReveal`. The slider's internal `hasInteractedRef` also resets, so the animation runs cleanly on every new stage.

7. **Insert the `<ConciergeNotesExpander>`** under the slider, above the existing flag-review / start-new-upload dashed row:

```tsx
<div className="mx-auto w-full max-w-[720px] pt-3 pb-1">
  <ConciergeNotesExpander notes={conciergeNotes} style={styles[0] ?? 'Modern'} />
</div>
```

8. **Add a `<ShareExportButton>` to the sticky footer**, between Download and Try another:

```tsx
<footer …>
  <div className="mx-auto w-full max-w-[720px] flex gap-2 sm:gap-3">
    {lastStagedS3Key && (<a …Download… />)}
    {stagedImage && (heroSignedUrl || heroPhoto?.preview) && (
      <ShareExportButton
        beforeImageUrl={heroSignedUrl || heroPhoto?.preview || ''}
        afterImageUrl={stagedImage}
        style={styles[0] ?? ''}
        roomTypes={roomTypes}
      />
    )}
    <button …Try another…>…</button>
    <Link …Gallery… />
  </div>
</footer>
```

   On mobile, four buttons in a row get cramped. The design accommodates: Download + Share are primary (dark nav + teal accent on Share); Try another + Gallery are ghost. Button copy on mobile: "Share" for share-export. Copy on desktop: "Share image". Download stays as-is.

   **Responsive refinement.** If testing on 360 px-wide viewports shows the four-button row wrapping ugly, collapse to a two-row grid on `sm` and below:

```tsx
<div className="mx-auto w-full max-w-[720px] grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
```

9. **Render `<FirstStageWelcomeToast>` conditionally** at the bottom of the page (outside `<main>`, near `<FlagReviewDialog>`):

```tsx
{isFirstStage && step === 'result' && (
  <FirstStageWelcomeToast onDismiss={() => setIsFirstStage(false)} />
)}
```

   `isFirstStage` is driven by `/api/jobs`. When dismissed, the local state flips so the toast unmounts — no re-render issues.

---

## 7. Copy library

Every user-facing string in this spec, in one place, so translators / copy reviewers have a single surface.

### Loader base notes — style-derived (always shown)

The 36 base notes (12 styles × 3 each) live in `STYLE_CONCIERGE_BASE` — see §6.1.4 for the full record. At render time, `{roomLabel}` in each note is replaced with `roomTypes[0]?.toLowerCase() ?? 'room'`.

These notes are shown on every stage regardless of analyser outcome — they describe the actual style direction the staging model is executing. They are the floor; analyser observations stack on top.

There is **no generic-template fallback copy** in this product. "Reading your room…" / "Matching the lighting…" / "Scaling the furniture…" are explicitly not acceptable — they read as stock UI filler and break the concierge tone.

### Orientation chip

```
Staging · 20–40s
```

Exact en-dash, spaced around the middle-dot separator. Keep the unit lowercase.

### Editorial nameplate

Eyebrow: `Staged · {roomTypes joined by " · "}` — uppercase handled via CSS, not in the string.
Title: `{style}` — literal style name from `STAGING_STYLES`.

### Concierge-notes expander trigger

```
{n} things we watched for in your room
```

`{n}` = `notes.length` (digits only; don't spell out). Note: "things" is deliberate. Not "observations" (sterile), not "details" (dry).

### First-stage welcome toast

```
Your first staged room.
It lives in your gallery now.
```

Two lines, two full stops. No emoji. No "welcome aboard". No "you did it!"

### Share-export button

- Mobile label: `Share`
- Desktop label: `Share image`
- Error toast on render failure: `Couldn't build the share image — please try again.`

### Filename for the exported PNG

```
stageright-{styleSlug}-{roomSlug}-share.png
```

Matches the existing download-route slug function (`src/app/api/download/route.ts` lines 8–10). Example: `stageright-coastal-living-room-share.png`.

---

## 8. Edge cases & error handling

| Scenario | Behaviour |
|---|---|
| Analyser call fails entirely (network, 5xx) | Wizard still proceeds to `/api/stage`. The pre-fill of 3 style-derived base notes (§6.3.2 step 2) remains in state — wait screen and expander both render with real content. No stock-filler fallback. |
| Analyser returns but `concierge_notes` parser returns `[]` | Same as above — user sees only the 3 style-derived base notes. |
| Analyser returns 1 or 2 observations | Whatever it returns is appended to base. Combined array is 4 or 5 notes; rotator timing scales to `40000 / N` within the 6–8s clamp. |
| Analyser returns more than 3 observations | Parser clamps to 3. |
| User navigates back from the wait screen via browser back button | The existing `beforeunload` warning handles this (current behaviour). Wait screen unmounts normally. |
| User has no hero photo URL (edge case — shouldn't happen given wizard state machine) | Wait screen falls back to a solid navy gradient without the ghost photo. Notes still render. Never crash. |
| Hero photo fails to load | Same as above — the `<img onError>` sets a fallback solid background. `img.src` errors are caught by the ken-burns layer silently. |
| CORS blocks canvas export | `renderShareExport` throws; the button catches and shows the error toast. Nothing downloaded. |
| User is on iOS 15 or older with limited `document.fonts` API | Fonts fallback to serif system stack inside the canvas — not ideal but legible. DM Serif is a web font; if unavailable the canvas uses the browser's default serif. Acceptable degradation. |
| User is on a browser without `navigator.vibrate` | Haptic call is skipped silently (feature detection in place). |
| `isFirstStage` conditional write fails for reasons other than the conditional check (e.g. transient DDB error) | The `try/catch` around the UpdateCommand returns `isFirstStage: false`. The welcome toast won't show this time, but the user will see it the next time they complete a stage (since `firstStageAt` is still null). Acceptable degradation. |
| User completes two stages in rapid succession in two tabs | Only the first-to-poll-done sets `firstStageAt`. The other tab's `isFirstStage` is `false`. Toast shows once. |
| "Try another style" flow after the first reveal | Slider re-mounts (key change), `autoReveal` replays, haptic fires again. Welcome toast does NOT re-show (server-side `firstStageAt` is now set). |
| Very long style name ("Mid-Century Modern", "Contemporary Australian") in nameplate on narrow phones | Wraps to 2 lines — acceptable. Don't truncate. |
| User clicks the orientation chip or the progress line | Nothing — both are decorative, not interactive. |
| User's upload is a portrait-orientation photo, and viewport is landscape | Ghost photo uses `object-fit: cover` and crops; ken-burns zoom still applies. Blur hides the crop seam. |
| Haptic fires when device is muted | No. Vibration API is independent of audio muting. |
| User's first-ever completed stage is a batch (`/api/stage/batch`) | `firstStageAt` is NOT set by the batch path in this spec. The user will not see the welcome toast until / unless they later complete a single-style stage. This is acceptable for now — the batch path is out of scope and will get its own "first-stage" ceremony in the follow-on spec. When that lands, it will also need to write `firstStageAt` atomically so the toast never double-shows. |

---

## 9. Acceptance criteria

Implementer should be able to check each of these off before opening a PR.

**Wait screen (`StagingWaitConcierge`):**
- [ ] Renders full-frame inside the main work area on all viewport widths from 360 px up.
- [ ] Ghost photo visible with blur and darkening overlay; white serif notes legible over any photo.
- [ ] Ken-burns zoom runs from scale 1.08 to 1.16 over 40 s — verify with devtools.
- [ ] Rotates through concierge notes every 6–8 s, cross-fade transition is smooth.
- [ ] Stops rotating on the last note, does not loop.
- [ ] When the analyser fails or returns empty, the 3 style-derived base notes still display — the wait screen is never empty or generic.
- [ ] Orientation chip renders above safe-area-inset-top on iOS notched devices.
- [ ] Progress line animates 0 → 95 % over 30 s, then holds at 95 %.

**Reveal (`BeforeAfterSlider` with `autoReveal`):**
- [ ] On first mount in the `result` step, slider position starts at 0 %.
- [ ] Holds at 0 % for ~200 ms.
- [ ] Sweeps from 0 % to 100 % over ~1200 ms with ease-out (verify visual smoothness, not exact ms).
- [ ] Holds at 100 % for ~300 ms.
- [ ] Settles to 50 % over ~300 ms.
- [ ] Touching the slider mid-animation instantly hands control to the user.
- [ ] Handle shows a white glow ring when position ∈ [95, 100].
- [ ] On desktop with hover support, handle scales 1.0 → 1.05 on mouse-over; cursor-leave returns to 1.0 smoothly. Drag/active state escalates to 1.1. Transition is 150 ms ease-out.
- [ ] On mobile, a single subtle haptic fires at the 100 % peak; never on desktop.
- [ ] "Try another style" re-triggers the full reveal on the new image.

**Afterglow:**
- [ ] `EditorialNameplate` replaces the chip-style header; no checkmark icon, no credit count on that surface.
- [ ] `ConciergeNotesExpander` is collapsed by default; chevron rotates on open; container animates open with height/opacity transition; individual notes enter with staggered 80 ms-per-note offset starting at 100 ms, with a subtle left-to-right slide on each.
- [ ] `ShareExportButton` generates a 1080×1920 PNG with the before photo on top, style nameplate centre, after photo bottom, "Staged with StageRight" footer; downloads with the specified filename.
- [ ] `FirstStageWelcomeToast` appears exactly once per account on the first successful stage, 1.5 s after the result renders; auto-dismisses after 8 s; dismissible via X button.
- [ ] Refreshing the browser after seeing the toast does NOT show it again.

**Backend:**
- [ ] `/api/analyse` returns `{ analysis, concierge_notes }` where `concierge_notes` is a non-empty array for the happy path.
- [ ] Concierge notes echo the user's typed notes when notes are provided.
- [ ] `/api/jobs` returns `isFirstStage: true` on exactly one poll per user for their first completed stage, and `false` for every subsequent completed stage (verify via manual test with a fresh account).
- [ ] `firstStageAt` is persisted on the user's DynamoDB record after the first completion.

**Regression (nothing should break):**
- [ ] Single-style stage flow end-to-end still works for admin and free users.
- [ ] Batch stage flow (`/stage/batch/[batchId]`) still uses the old `StagingLoader` without visual regression.
- [ ] Gallery page ("Try another style" flow) still pre-loads the hero correctly.
- [ ] Flag-for-review dialog still opens from the result step.
- [ ] `npm run build` passes with no `react/no-unescaped-entities` warnings or type errors.

---

## 10. Implementation phases (PR breakdown)

### PR 1 — Ceremony core (ships together because they're visually coupled)

- Backend: analyser prompt + parser + return shape change; `/api/jobs` first-stage detection; `User.firstStageAt` type.
- New components: `StagingWaitConcierge`, `EditorialNameplate`, `ConciergeNotesExpander`, `FirstStageWelcomeToast`.
- Modified: `BeforeAfterSlider` (replace `autoPlay` with `autoReveal`), `src/app/stage/page.tsx` (wiring).
- Ken-burns keyframes in global CSS.

Scope check: this is one cohesive feature. All four components must land together or the page looks half-redesigned.

### PR 2 — Share export

- New: `src/lib/utils/share-export.ts` (canvas renderer), `ShareExportButton`.
- Modified: `src/app/stage/page.tsx` (adds button to sticky footer).
- CORS verification pre-flight (see §6.2.4).

Ships independently because the share export is the biggest single piece of code and has the most risk surface (canvas fonts, CORS).

**Order.** PR 1 first, review, merge. PR 2 after — builds on the nameplate copy pattern.

---

## 11. Explicitly out of scope

- **Batch-page ceremony** (`src/app/stage/batch/[batchId]/page.tsx` and `src/components/staging/batch-result.tsx`). Same gift framework applies, but the architecture is different (sequential card-flip reveal, per-style nameplates in the variant list). Separate spec.
- **Audio design.** No sound, ever, per §2.
- **Multi-turn edit flow.** Components exist but are dormant per project memory.
- **Onboarding / first-time tutorial.** The welcome toast is one beat, not a tutorial. Separate concern.
- **Gallery-side ceremony.** The gallery viewer (`gallery-viewer.tsx`) is out of scope.
- **Pricing and credit-UI changes.** Removing the credit count from the nameplate is an aesthetic move, not a pricing-surface change — the number still lives in the top bar.
- **Performance optimisation of the wait screen.** If the 40 s ken-burns ever paints badly on low-end Android, that's a follow-up.
- **Admin debug panel on the result step.** Keep as-is; nameplate spec doesn't touch it.

---

## 12. Open implementation questions (for the plan)

The implementation plan should resolve these before touching code — flagging them here so they're not surprises.

1. **CORS verification.** Before starting PR 2, confirm that S3 signed URLs (as served to `<img>` today) include `Access-Control-Allow-Origin`. Check a signed URL's response headers in dev. If missing, the S3 bucket CORS policy needs a one-line change (spec'd in §6.2.4).
2. **DM Serif Display font loading in canvas.** Some browsers require the font to be explicitly loaded via `document.fonts.load()` before a canvas text call will use it. The `renderShareExport` code includes this; the implementer should verify by generating an export on a cold page load.
3. **Ken-burns performance.** 40 s CSS `transform: scale` at 60 fps = 2400 frames. Shouldn't be a problem on modern devices, but test on a mid-tier Android.
4. **Interaction between "Try another style" and the slider key.** The spec uses `lastStagedS3Key` as the React key. Confirm this changes between successive stages on the same hero — it should (Lambda writes a new staged-key per stage), but flag if not.
5. **Lambda impact of the longer analysis text.** The extra CONCIERGE NOTES block adds ~100 tokens to the analysis that the Lambda receives as `roomAnalysis`. Verify no prompt-length issue downstream (staging prompt is well under Nano Banana Pro's input limit, but check the composed prompt length doesn't regress somewhere else). Secondary: consider whether the Lambda should STRIP the CONCIERGE NOTES section out of the analysis text before feeding it to Nano Banana — those notes are user-facing and may confuse the image model. Safest fix: strip anything from `CONCIERGE NOTES:` onward in the runAnalysis function before returning `analysis`, and return the raw bulleted list as `concierge_notes` only. This way the Lambda gets the technical analysis (sections 1–5) and the user gets the narration (section 6). Update §6.1.1's parser to splice out the notes section from `analysis` as well.

---

*End of spec.*
