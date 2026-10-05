# Batch Reveal Ceremony — Design

**Date:** 2026-04-23
**Status:** Design draft; pending spec review
**Scope:** Apply the gift framework (anticipation → reveal → afterglow) to the multi-style batch flow on `/stage/batch/[batchId]`. Full-frame concierge wait until the first variant completes, then a seamless transition into an enhanced compare layout with per-variant editorial nameplate, per-variant concierge-notes expander, 2-second lid-lift reveal on first-ready, and a 4-button action footer (Download / Share / Try another / Gallery). Removes the PR #2 stopgap (wizard's `generating` step can always use `StagingWaitConcierge` regardless of `styles.length`).
**Out of scope:** Any change to the compare-first list+slider affordance (it is the right tool for the job). Card-pack / slideshow alternative UX shapes. Pricing changes. Per-variant analyser re-runs beyond what the Lambda already does. Onboarding ceremony (separate spec).

---

## 1. Background & motivation

PR #1 shipped the gift framework for the **single-style** flow. PR #2's polish pass added a stopgap: when `styles.length > 1`, the wizard's `generating` step renders the old `WizardCard + StagingLoader` instead of `StagingWaitConcierge`, because the batch page itself still rendered the old generic loader and the flash between the two was jarring. This spec removes that asymmetry.

The batch flow's **job** is style comparison. An agent picks 3-5 styles to see a single room rendered five different ways and pick favourites. That constrains our ceremony choices — a card-pack or slideshow replacement would fight the compare affordance. So we **layer** the gift framework onto the existing slider+list structure rather than replacing it:

- **Wait phase** — full-frame `StagingWaitConcierge` takes over until the first variant completes. Same component as single-style. Notes during the wait are interleaved across the selected styles so each style gets airtime.
- **Reveal phase** — transition to the compare layout with a lid-lift sweep on the first-ready variant. Subsequent variants arrive as list rows with subtle thumbnail fade-in. Switching variants after the first reveal is a simple cross-fade — it's comparison, not reveal.
- **Afterglow** — per-variant editorial nameplate swap, per-variant concierge-notes expander, 4-button action footer (Download + Share + Try another + Gallery) for the active variant.

The important implementation detail surfaced during exploration: **analysis runs INSIDE each sub-Lambda per-style now** (not shared at batch-creation time — that changed after the initial batch-staging design for Amplify SSR timeout reasons). This means:
- The Lambda's `ANALYSIS_SYSTEM_PROMPT` must be updated to include section 6 (CONCIERGE NOTES) — currently absent.
- Concierge notes are per-variant (each Lambda parses its own) — each variant's expander shows that variant's own style-derived base notes + its own room observations.
- The wait phase uses client-side style-derived base notes from `STYLE_CONCIERGE_BASE` (no analyser notes yet — analysis hasn't run), interleaved across the selected styles.

---

## 2. Positioning & locked decisions

All settled during brainstorming — do not re-litigate in implementation:

- **Layout for the wait:** full-frame takeover via `StagingWaitConcierge` (same as single-style). Hides the variant list until first-ready.
- **Layout for the result:** existing slider+list compare layout, with ceremony layered on top.
- **First-ready reveal:** full 2s lid-lift via `BeforeAfterSlider autoReveal`. Plays exactly once per batch session.
- **Subsequent variant switches:** simple cross-fade (current 200ms opacity animation). NOT lid-lift.
- **Per-variant editorial nameplate:** yes — `EditorialNameplate` pinned above the slider, swaps content on variant change.
- **Per-variant concierge-notes expander:** yes — content updates on variant switch. Combines the active variant's style base notes (`STYLE_CONCIERGE_BASE`) with that variant's own analyser-derived room observations.
- **4-button action footer:** Download + Share + Try another + Gallery. Download + Share apply to the **active** variant only. Same responsive grid as single-style (2×2 mobile, 1×4 desktop).
- **First-stage welcome toast:** fires once per account across single- and batch-stage paths. Atomic `markFirstStage` added to the batch poll endpoint.
- **Sound:** none. Mobile haptic at reveal peak only, same as single-style.

---

## 3. Design principles

1. **Compare is the job — ceremony serves it, not replaces it.** The slider+list layout survives because it's the right affordance for picking favourites. Ceremony happens in the wait and the first reveal; after that we stay out of the agent's way.
2. **Reveal is a one-time beat per batch.** Lid-lift fires on the first variant that completes. Every subsequent variant click is a compare action, not a reveal action. A second lid-lift would feel wrong — the agent is no longer discovering, they're evaluating.
3. **Each variant owns its editorial identity.** Nameplate + expander content swap per variant. The agent feels they're viewing "Coastal" then "Modern" as distinct designed outputs, not interchangeable grid cells.
4. **Wait notes tease all chosen styles, not just one.** Interleave style-derived base notes across the selected styles so each style gets airtime during the ~30-60s wait. Reinforces "we're working on all your picks."
5. **Batch is its own entrance — arrive unified with single-style.** Same `StagingWaitConcierge` component on both paths. Single-style and batch feel like the same product, not two products.

---

## 4. Architecture & data flow

```
/stage (wizard, multi-style)
  └── user clicks Stage with styles.length >= 2
      │
      ├── advanceTo('generating')
      │   └── <StagingWaitConcierge> — full-frame, waitNotes = buildBatchWaitNotes(styles, roomTypes)
      │       (stopgap removed — wizard always uses concierge wait now)
      │
      ├── POST /api/stage/batch ────────► returns { batchId, subJobs }
      │
      └── router.push(`/stage/batch/${batchId}`)
             │
             ▼
/stage/batch/[batchId]
  │
  ├── (on mount) state: data=null, conciergeNotes captured from wizard localStorage checkpoint (waitNotes)
  │   └── shows <StagingWaitConcierge> full-frame using waitNotes — visually seamless with wizard wait
  │
  ├── pollJob loop — GET /api/jobs/batch?id={batchId} every 3s
  │       │
  │       └── response (NEW fields marked ◄─ NEW):
  │           {
  │             batchId, status, total, completed, failed, refundedCredits,
  │             heroImageUrl,
  │             isFirstStage: boolean,            ◄─ NEW (written atomically on completed 0→1+)
  │             subJobs: [{
  │               jobId, style, status, imageUrl, s3Key,
  │               sessionId, error,
  │               conciergeNotes: string[],        ◄─ NEW (per-variant, from Lambda's parsed analysis)
  │             }]
  │           }
  │
  ├── while completed === 0 → keep rendering <StagingWaitConcierge> with waitNotes
  │
  └── on first poll where completed >= 1 → cross-fade to <BatchResult>
        │
        └── <BatchResult> (reworked)
              ├── <EditorialNameplate> (per active variant, pinned above slider)
              ├── <BeforeAfterSlider autoReveal=firstReveal onRevealPeak=…> — lid-lift on first-ready only
              ├── <ConciergeNotesExpander notes=variantNotes style=active.style>
              ├── <VariantList> (per sub-job row with thumbnail fade-in on done)
              ├── action footer: Download | Share | Try another | Gallery (for active variant)
              └── if isFirstStage: <FirstStageWelcomeToast> (AnimatePresence-wrapped)
```

Everything after the Lambda is presentation-layer. The backend additions are:
1. Lambda emits section 6 (CONCIERGE NOTES) and parses/persists them per sub-job.
2. `BatchSubJob` type + `propagateToBatch` signature gain a `conciergeNotes` field.
3. `/api/jobs/batch` route calls `markFirstStage` on the `completed` counter's 0→1+ transition, and surfaces per-sub-job `conciergeNotes`.

---

## 5. Data & type changes

### 5.1 `BatchSubJob` type (`src/lib/db/batch-jobs.ts`)

```ts
export interface BatchSubJob {
  jobId: string;
  style: string;
  status: BatchSubJobStatus;
  stagedS3Key?: string;
  sessionId?: string;
  error?: string;
  conciergeNotes?: string[];  // NEW — 0-4 observations parsed by the Lambda
}
```

### 5.2 Lambda `propagateToBatch` signature (`lambda/staging-worker/index.mjs`)

Add a `conciergeNotes?: string[]` parameter. When `success === true`, include it in the `newSubJobs` patch:

```js
// before:
{ ...s, status: 'done', stagedS3Key, sessionId }
// after:
{ ...s, status: 'done', stagedS3Key, sessionId, conciergeNotes }
```

### 5.3 `/api/jobs/batch` response shape (`src/app/api/jobs/batch/route.ts`)

```ts
// Existing:
{
  batchId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  heroImageUrl?: string;
  subJobs: BatchResultSubJob[];
}

// Extensions:
{
  ...existing,
  isFirstStage: boolean;                    // NEW — atomic write on completed 0→1+
  subJobs: Array<{
    ...existing,
    conciergeNotes: string[];               // NEW — per variant, [] if Lambda hasn't persisted yet
  }>;
}
```

### 5.4 `BatchResultSubJob` client type (`src/components/staging/batch-result.tsx`)

```ts
export interface BatchResultSubJob {
  jobId: string;
  style: StagingStyle;
  status: 'pending' | 'running' | 'done' | 'error';
  imageUrl?: string;
  s3Key?: string;             // ALREADY PRESENT on server but not on this client type — add it
  error?: string;
  conciergeNotes?: string[];  // NEW
}
```

### 5.5 `BatchResultProps` (`src/components/staging/batch-result.tsx`)

```ts
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
  isFirstStage: boolean;   // NEW
}
```

No change to `BatchJob` storage shape — the existing `subJobs` array already accepts new fields because DynamoDB attribute mutation is schemaless.

---

## 6. Detailed component-by-component spec

### 6.1 Backend

#### 6.1.1 Lambda — CONCIERGE NOTES in analysis + parse + persist (`lambda/staging-worker/index.mjs`)

The Lambda's `ANALYSIS_SYSTEM_PROMPT` currently ends at section 5 (verified: `CRITICAL: constraints come FIRST. Function over aesthetics.` closes the template literal without a section 6). This predates PR #1, which added section 6 to the Next.js `src/lib/ai/run-analysis.ts`. Port the section 6 block verbatim into the Lambda:

**Change 1 — update the prompt.** Find the existing closing in `ANALYSIS_SYSTEM_PROMPT`:

```
5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

CRITICAL: constraints come FIRST. Function over aesthetics.`;
```

Replace with (insert section 6 before the closing `CRITICAL` line):

```
5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

6. **CONCIERGE NOTES** — 3 to 4 short observations about this SPECIFIC ROOM, written for the USER to read during the 20–40 s wait for their staged image. These layer on top of 3 style-derived notes the app already has — your job here is ROOM-SPECIFIC observation, not STYLE-GENERAL description. Rules:
   - Each note ≤ 14 words. Present tense. Warm, observational, no jargon.
   - Reference something real and visible in the hero photo (a feature, a lighting direction, a proportion).
   - Observational, NOT promissory. Say "Noted the bay window — keeping that sightline clear" not "We'll fix the wall crack".
   - Never mention structural changes, colour changes, or anything we would not deliver.
   - If USER NOTES are present in the user message (above the style calibration block), include EXACTLY ONE note that echoes the user's wording back (e.g. user said "cosy" → "You asked for cosy — leaning into soft timber tones"). This is a single, concrete acknowledgement, not a paraphrase.
   - Do NOT include the style name or room type unless it adds real information beyond the user already knowing what they picked.

Format the section EXACTLY as below, with one bullet per note and no extra commentary. Emit ONE optional third bullet when a user-echo note is warranted, per the rule above — do NOT echo this instruction in your output:

CONCIERGE NOTES:
- [note 1]
- [note 2]

CRITICAL: constraints come FIRST. Function over aesthetics.`;
```

This matches the exact text shipped in `src/lib/ai/run-analysis.ts` (post PR #1 and post the `7a42e9f` scaffolding-parenthetical fix). It must stay byte-identical.

**Change 2 — bump `max_tokens` from 1200 to 1400** in the `client.messages.create` call inside `runAnalysisInLambda`:

```js
const response = await client.messages.create({
  model: modelId,
  max_tokens: 1400,   // was 1200 — extra room for CONCIERGE NOTES bullets
  thinking: { type: 'adaptive' },
  // …rest unchanged…
});
```

**Change 3 — port the parser + stripper into the Lambda** as inline functions (the Lambda has no module graph). Add these to `lambda/staging-worker/index.mjs` alongside `runAnalysisInLambda`:

```js
function parseConciergeNotes(analysis) {
  const match = analysis.match(/CONCIERGE NOTES:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, 4);
}

function stripConciergeNotes(analysis) {
  return analysis
    .replace(/(?:^|\n+)CONCIERGE NOTES:\s*\n(?:\s*-\s*.+\n?)+/i, '')
    .trim();
}
```

**Change 4 — update `runAnalysisInLambda` return shape.** Currently:

```js
return { analysis };
```

Replace with:

```js
const conciergeNotes = parseConciergeNotes(analysis);
const analysisForStaging = stripConciergeNotes(analysis);
return { analysis: analysisForStaging, concierge_notes: conciergeNotes };
```

**Change 5 — thread `conciergeNotes` into `propagateToBatch`.** In the `stageRoom` callsite that invokes analysis, capture `concierge_notes` from the return object and pass it through to `propagateToBatch`:

```js
// where runAnalysisInLambda is called from stageRoom (find the existing destructure):
const { analysis, concierge_notes } = await runAnalysisInLambda({ … });
// (use `analysis` downstream exactly as before — strip already ran)
// …later, when staging succeeds and we call propagateToBatch:
await propagateToBatch({
  batchId, jobId, style,
  success: true,
  stagedS3Key, sessionId,
  userId,
  conciergeNotes: concierge_notes,   // NEW
});
```

Update the `propagateToBatch` function signature to accept and persist `conciergeNotes`:

```js
async function propagateToBatch({
  batchId, jobId, style,
  success, stagedS3Key, sessionId, error,
  userId,
  conciergeNotes,   // NEW
}) {
  // …inside the subJobs map, success branch:
  return success
    ? { ...s, status: 'done', stagedS3Key, sessionId, conciergeNotes }
    : { ...s, status: 'error', error };
  // …rest unchanged
}
```

**Deployment required.** Any Lambda change requires manual CLI deploy per `project_lambda_deploy.md` — this spec's implementation plan must include that step explicitly. Without deploy, the changes above do nothing.

#### 6.1.2 `batch-jobs.ts` type update (`src/lib/db/batch-jobs.ts`)

Add `conciergeNotes?: string[]` to `BatchSubJob` (per §5.1). `markSubJobDone` helper (Next.js side) should also accept an optional `conciergeNotes` param and pass it through:

```ts
export async function markSubJobDone(args: {
  batchId: string;
  jobId: string;
  stagedS3Key: string;
  sessionId: string;
  conciergeNotes?: string[];   // NEW
}): Promise<void> {
  await mutateSubJob(
    args.batchId,
    args.jobId,
    (s) => ({
      ...s,
      status: 'done',
      stagedS3Key: args.stagedS3Key,
      sessionId: args.sessionId,
      conciergeNotes: args.conciergeNotes,
    }),
    'completed',
    false,
  );
}
```

This helper is used by the Next.js routes (not the Lambda, which has its own `propagateToBatch`). Keeping it in sync means both paths can write concierge notes consistently if a future flow uses it.

#### 6.1.3 `/api/jobs/batch` — first-stage atomic detection + concierge notes passthrough (`src/app/api/jobs/batch/route.ts`)

Add `markFirstStage` call when `batch.completed > 0` (meaning at least one sub-job has succeeded). The call is idempotent — `markFirstStage` uses `ConditionalUpdate` with `attribute_not_exists(firstStageAt)`, so only the first poll in the user's lifetime (across single + batch) that sees a completed stage will flip the flag.

```ts
import { markFirstStage } from '@/lib/db/first-stage';

// …inside the GET handler, after computing `batch` and checking access…

const subJobs = await Promise.all(
  batch.subJobs.map(async (s) => ({
    jobId: s.jobId,
    style: s.style,
    status: s.status,
    imageUrl: s.stagedS3Key ? await getSignedDownloadUrl(s.stagedS3Key) : undefined,
    s3Key: s.stagedS3Key,
    sessionId: s.sessionId,
    error: s.error,
    conciergeNotes: s.conciergeNotes ?? [],   // NEW
  })),
);

// NEW: first-stage detection. Only fire when at least one sub-job is done.
// The helper swallows all errors (ConditionalCheckFailedException included)
// and returns false — safe to call on every poll, only ever wins once per user.
let isFirstStage = false;
if (batch.completed > 0) {
  isFirstStage = await markFirstStage(session.user.id);
}

return NextResponse.json({
  batchId: batch.batchId,
  status: allFailed ? 'error' : terminal ? 'done' : 'running',
  total: batch.total,
  completed: batch.completed,
  failed: batch.failed,
  refundedCredits: batch.refundedCredits,
  heroImageUrl,
  subJobs,
  isFirstStage,   // NEW
});
```

No lambda-deploy dependency for this route change.

### 6.2 Client

#### 6.2.1 `buildBatchWaitNotes` helper (`src/lib/ai/prompts.ts`)

Interleaves style-derived base notes across the selected styles so every chosen style gets airtime during the wait, rather than the user seeing 5 notes for style 1 then never seeing anything about styles 2-5.

**Implementation** (append alongside `buildConciergeNotes`):

```ts
/**
 * Build wait-screen notes for a multi-style batch.
 *
 * Takes N selected styles, reads each one's 5 base notes from
 * STYLE_CONCIERGE_BASE, interpolates {roomLabel}, and interleaves them
 * round-robin so the first N notes shown touch each style once before
 * deepening into any single style. For 3 styles × 5 notes each, the
 * output order is:
 *   style0[0], style1[0], style2[0],
 *   style0[1], style1[1], style2[1],
 *   style0[2], style1[2], style2[2],
 *   …
 *
 * Guarantees:
 *  - Every style gets at least one note in the first pass.
 *  - No analyser notes — analysis hasn't run yet at wait start.
 *  - Pure. No side effects.
 */
export function buildBatchWaitNotes(args: {
  styles: StagingStyle[];
  roomTypes: string[];
}): string[] {
  if (args.styles.length === 0) return [];
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const perStyle = args.styles.map((s) =>
    STYLE_CONCIERGE_BASE[s].map((n) => n.replace('{roomLabel}', roomLabel)),
  );
  const maxLen = Math.max(...perStyle.map((a) => a.length));
  const result: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const arr of perStyle) {
      if (arr[i]) result.push(arr[i]);
    }
  }
  return result;
}
```

**Unit tests** (`tests/lib/ai/build-batch-wait-notes.test.ts`):

- One style returns that style's 5 base notes with `{roomLabel}` interpolated.
- Two styles return 10 notes in interleaved order: `[style0[0], style1[0], style0[1], style1[1], …]`.
- Three styles with 5 notes each return 15 notes, first 3 touching all 3 styles.
- Empty styles array returns `[]`.
- `{roomLabel}` is replaced from `roomTypes[0]?.toLowerCase()`, falls back to `'room'`.

#### 6.2.2 `/stage/batch/[batchId]` page — wait-then-result state (`src/app/stage/batch/[batchId]/page.tsx`)

**Current behaviour:** on mount, starts polling, renders a lightweight spinner (`<div className="size-8 …animate-spin" />`) while `data === null`, then renders `<BatchResult>` as soon as the first poll returns.

**New behaviour:** render `<StagingWaitConcierge>` full-frame while `completed === 0`, render `<BatchResult>` as soon as `completed >= 1`.

**Reading the wait notes.** The wizard's pending-batch checkpoint (set in `src/app/stage/page.tsx` when it calls `/api/stage/batch`) needs to carry both `styles` and the user's `roomTypes` forward so the batch page can compute `buildBatchWaitNotes(styles, roomTypes)` on mount without waiting for poll data. The existing checkpoint already stores `roomTypes`; verify `styles` is also stored (it isn't in the current `stage/page.tsx` — stores `roomTypeLabel` only). Add `styles: StagingStyle[]` to the checkpoint.

**Expected checkpoint shape** (update in `src/app/stage/page.tsx`):

```ts
localStorage.setItem(
  'stageright:pending-batch',
  JSON.stringify({
    batchId,
    originalImageUrl: heroSignedUrl,
    roomTypeLabel: roomTypes[0] ?? 'room',
    heroS3Key,
    roomTypes,
    styles,            // NEW — used by batch page for buildBatchWaitNotes on mount
    startedAt: Date.now(),
  }),
);
```

**Batch page mount:**

```tsx
// pseudo-code of the changed parts:
const [waitNotes, setWaitNotes] = useState<string[]>([]);
const [heroImageUrl, setHeroImageUrl] = useState<string>('');

useEffect(() => {
  try {
    const cp = localStorage.getItem('stageright:pending-batch');
    if (cp) {
      const parsed = JSON.parse(cp) as {
        styles?: StagingStyle[];
        roomTypes?: string[];
        originalImageUrl?: string;
        // …existing fields…
      };
      if (parsed.batchId === batchId) {
        if (parsed.originalImageUrl) setOriginalImageUrl(parsed.originalImageUrl);
        if (parsed.roomTypeLabel) setRoomTypeLabel(parsed.roomTypeLabel);
        if (parsed.heroS3Key) setHeroS3Key(parsed.heroS3Key);
        if (Array.isArray(parsed.roomTypes)) setRoomTypes(parsed.roomTypes);
        if (Array.isArray(parsed.styles) && parsed.styles.length > 0 && Array.isArray(parsed.roomTypes)) {
          setWaitNotes(buildBatchWaitNotes({ styles: parsed.styles, roomTypes: parsed.roomTypes }));
        }
      }
    }
  } catch { /* ignore */ }
}, [batchId]);

// in the render tree:
if (error) { /* existing error UI */ }

if (!data || data.completed === 0) {
  // Wait phase — full-frame concierge narration, using wait notes interleaved
  // across the selected styles. heroImageUrl may still be empty on first
  // mount (before first poll returns); the StagingWaitConcierge component
  // handles missing heroImageUrl gracefully with its onError fallback.
  return (
    <main className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden">
      <StagingWaitConcierge
        heroImageUrl={originalImageUrl || ''}
        conciergeNotes={waitNotes}
      />
    </main>
  );
}

// Result phase
return (
  <main className="min-h-screen bg-surface">
    <BatchResult
      originalImageUrl={originalImageUrl}
      roomTypeLabel={roomTypeLabel}
      total={data.total}
      completed={data.completed}
      failed={data.failed}
      subJobs={data.subJobs}
      refundedCredits={data.refundedCredits}
      allTerminal={data.status !== 'running'}
      heroS3Key={heroS3Key}
      roomTypes={roomTypes}
      isFirstStage={data.isFirstStage}   // NEW pass-through
    />
  </main>
);
```

**Transition smoothness.** The `StagingWaitConcierge` is rendered inside a `<main className="h-[100dvh]">` wrapper so it fills the full viewport minus the Next.js layout chrome. When `completed >= 1` flips, React unmounts the wait screen and mounts `<BatchResult>`. Wrap the swap in an `AnimatePresence mode="wait"` block at the page level for a 250ms cross-fade:

```tsx
<AnimatePresence mode="wait">
  {(!data || data.completed === 0) ? (
    <motion.div key="wait" exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="h-[100dvh]">
      <StagingWaitConcierge … />
    </motion.div>
  ) : (
    <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <BatchResult … />
    </motion.div>
  )}
</AnimatePresence>
```

#### 6.2.3 `BatchResult` — layout overhaul (`src/components/staging/batch-result.tsx`)

**Replaces** the existing implementation. New layout:

```
┌ global header (existing) ───────────────────────────┐
│  STAGED VARIANTS                                     │
│  5 styles, one living room.                          │
│  3 of 5 complete                                     │
└──────────────────────────────────────────────────────┘

┌ card container ────────────────────────────────────────────────┐
│  ┌ slider column (sticky on md+) ──┐  ┌ variant list ─────┐  │
│  │ ┌ EditorialNameplate ────────┐ │  │  ◆ Coastal  ready │  │
│  │ │ STAGED · LIVING ROOM       │ │  │  ◆ Modern   ready │←─│active
│  │ │ Coastal                    │ │  │  ◇ Luxury   queued│  │
│  │ └────────────────────────────┘ │  │  ◇ Hamptons run…  │  │
│  │ ┌ BeforeAfterSlider ─────────┐ │  │  ◇ Japandi  run…  │  │
│  │ │ key=active.jobId           │ │  └───────────────────┘  │
│  │ │ autoReveal=firstRevealOnly │ │                         │
│  │ └────────────────────────────┘ │                         │
│  │ ┌ ConciergeNotesExpander ────┐ │                         │
│  │ │ 8 things we watched for…   │ │                         │
│  │ └────────────────────────────┘ │                         │
│  └────────────────────────────────┘                         │
│                                                              │
│  ┌ action footer (bottom) ───────────────────────────────┐  │
│  │  Download | Share | Try another | Gallery             │  │
│  │  (grid-cols-2 mobile, grid-cols-4 sm+)                │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

<FirstStageWelcomeToast /> — conditionally rendered outside card, AnimatePresence-wrapped
```

**Key implementation details:**

**First-reveal tracking.** Use a `useRef<boolean>` to ensure `autoReveal` fires exactly once per batch result view (across all variant switches):

```tsx
const hasRevealedRef = useRef(false);

const isFirstReveal = activeJobId === firstReady?.jobId && !hasRevealedRef.current;

// slider:
<BeforeAfterSlider
  key={active.jobId}  // remount on variant switch — enables cross-fade
  beforeSrc={originalImageUrl}
  afterSrc={active.imageUrl!}
  beforeLabel="Empty"
  afterLabel={active.style}
  autoReveal={isFirstReveal}
  onRevealPeak={() => {
    hasRevealedRef.current = true;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
  }}
/>
```

The initial auto-selection effect (`useEffect` that sets `activeJobId = firstReady.jobId`) already exists; no change needed there.

**Per-variant concierge notes.** Combine the active variant's style base notes with the variant's own analyser observations (the Lambda persisted them per §6.1.1):

```tsx
const activeNotes = useMemo(() => {
  if (!active) return [];
  return buildConciergeNotes({
    style: active.style,
    roomTypes,
    analyserNotes: active.conciergeNotes ?? [],
  });
}, [active, roomTypes]);
```

Pass `activeNotes` to `<ConciergeNotesExpander notes={activeNotes} style={active.style} />`. Content updates automatically when `activeJobId` changes.

**4-button action footer.** Replaces the current 2-button flex row. Uses the same responsive grid class as the single-style footer:

```tsx
<div className="mt-5 pt-5 border-t border-surface-border">
  <div className="mx-auto w-full max-w-[720px] grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
    {active?.s3Key && active.status === 'done' && (
      <a
        href={`/api/download?key=${encodeURIComponent(active.s3Key)}&style=${encodeURIComponent(active.style)}&rooms=${encodeURIComponent(roomTypes.join(','))}`}
        className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-medium text-sm rounded-xl hover:bg-brand-navy-light transition-colors whitespace-nowrap"
      >
        <svg … download-icon />
        Download
      </a>
    )}
    {active?.imageUrl && active.status === 'done' && originalImageUrl && (
      <ShareExportButton
        beforeImageUrl={originalImageUrl}
        afterImageUrl={active.imageUrl}
        style={active.style}
        roomTypes={roomTypes}
      />
    )}
    <Link
      href={tryAnotherHref}
      className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm rounded-xl hover:bg-surface-secondary transition-colors whitespace-nowrap"
    >
      <span className="sm:hidden">Try another</span>
      <span className="hidden sm:inline">Try another style</span>
    </Link>
    <Link
      href="/dashboard"
      className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm rounded-xl hover:bg-surface-secondary transition-colors whitespace-nowrap"
    >
      Gallery
    </Link>
  </div>
  {allTerminal && (
    <p className="mt-3 text-xs text-ink-muted text-center">All done.</p>
  )}
</div>
```

Download and Share only render when the active variant is `done` — otherwise the grid renders 2 cells (Try another + Gallery) on mobile and 2 empty + 2 filled cells on desktop. Simpler visual: conditionally wrap Download + Share in a fragment; on mobile that keeps the 2×2 grid tidy regardless. Acceptable either way; implementer can pick.

**Welcome toast.** Render conditionally at the bottom, wrapped in its own `AnimatePresence`:

```tsx
<AnimatePresence>
  {isFirstStage && active?.status === 'done' && (
    <FirstStageWelcomeToast onDismiss={() => setShowWelcomeToast(false)} />
  )}
</AnimatePresence>
```

Use a local `showWelcomeToast` state initialised from the `isFirstStage` prop so dismissing it at the component level doesn't require re-poll. If `isFirstStage` turns true and `showWelcomeToast` is still initially true, render. On dismiss, set `showWelcomeToast = false` — toast unmounts, slides out via AnimatePresence.

#### 6.2.4 `BatchVariantRow` — arrival animation (`src/components/staging/batch-variant-row.tsx`)

**One small polish:** fade in the thumbnail image when `imageUrl` becomes defined. Today `<img src={imageUrl}>` renders immediately; add an opacity transition via a small state:

```tsx
// Inside BatchVariantRow:
const [imgLoaded, setImgLoaded] = useState(false);

return (
  // …existing wrapper…
  <span className="flex-shrink-0 size-14 sm:size-16 rounded-lg overflow-hidden bg-surface-secondary relative">
    {imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        className="size-full object-cover transition-opacity duration-300"
        style={{ opacity: imgLoaded ? 1 : 0 }}
        onLoad={() => setImgLoaded(true)}
      />
    ) : (
      <span className="absolute inset-0 skeleton-shimmer" aria-hidden />
    )}
  </span>
  // …rest…
);
```

No other change — keeps the row simple.

#### 6.2.5 `src/app/stage/page.tsx` — remove stopgap

Remove the `styles.length > 1` branch in the generating step. The current PR #2 code:

```tsx
{step === 'generating' && (
  styles.length > 1 ? (
    <WizardCard key="generating" tag="Staging" tagTone="teal" question="Creating your staged rooms" subtitle="This takes 20–40 seconds. Keep this tab open.">
      <StagingLoader />
    </WizardCard>
  ) : (
    <StagingWaitConcierge key="generating" heroImageUrl={…} conciergeNotes={conciergeNotes} />
  )
)}
```

becomes:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    key="generating"
    heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
    conciergeNotes={conciergeNotes}
  />
)}
```

**Important — pre-fill batch wait notes before `/api/stage/batch`.** Currently the wizard's `runStaging` function pre-fills `conciergeNotes` with single-style base notes inside `runSingleStaging`. The multi-style branch (which routes to `/api/stage/batch`) does not. Add an equivalent pre-fill in the multi-style branch of `runStaging`:

```ts
const runStaging = useCallback(async () => {
  if (styles.length === 0) return;
  if (!hasEnoughCredits) { /* existing */ }
  if (styles.length === 1) {
    return runSingleStaging(styles[0]);
  }

  // Multi-style: batch branch
  setError(null);
  advanceTo('generating');

  // NEW: pre-fill wait notes using the interleaved batch helper so the
  // concierge wait mounts with real content before /api/stage/batch returns.
  setConciergeNotes(buildBatchWaitNotes({ styles, roomTypes }));

  try {
    const res = await fetch('/api/stage/batch', { … });
    // …rest unchanged, including the localStorage checkpoint that now
    // ALSO stores `styles` per §6.2.2…
  }
}, [styles, heroS3Key, refS3Keys, roomTypes, notes, heroSignedUrl, advanceTo, router, runSingleStaging, hasEnoughCredits, creditsNeeded, userCredits]);
```

Also remove the now-unused `StagingLoader` import (the wizard no longer references it at all).

---

## 7. Copy library

### Wait screen during batch
Uses `buildBatchWaitNotes(styles, roomTypes)` — interleaved `STYLE_CONCIERGE_BASE` entries per §6.2.1. No new strings authored.

### Concierge-notes expander per variant
"N things we watched for in your {roomLabel}" — existing `ConciergeNotesExpander` copy, unchanged. N is `notes.length` (5 base + 0-4 analyser = 5-9 depending on how many notes the Lambda emitted).

### Action footer buttons
- Download: "Download" (same as single-style)
- Share: "Share" (mobile), "Share results" (desktop) — same as polish PR's post-fix copy
- Try another: "Try another" (mobile), "Try another style" (desktop)
- Gallery: "Gallery"

### First-stage welcome toast
Same copy as single-style:
```
Your first staged room.
It lives in your gallery now.
```
Note: copy intentionally keeps "room" singular even when the batch user staged multiple variants — this toast is about their first staged image in the gallery, not the first batch job. Simple; consistent across flows.

### Orientation chip during batch wait
Same as single-style: `Staging · 20–40s`. The batch can take longer (parallel Lambdas + rate limits) but 20-40s is still the median for the first variant's arrival, which is what triggers the transition.

### Global header
Existing copy, no change:
- Eyebrow: `Staged variants`
- Title: `{total} {total === 1 ? 'style' : 'styles'}, one {roomTypeLabel.toLowerCase()}.`
- Progress: `{completed} of {total} complete` + `{failed} failed` + refund suffix

---

## 8. Edge cases & error handling

| Scenario | Behaviour |
|---|---|
| All sub-jobs fail (status=error) | `BatchResult` receives `completed=0, failed=total`, `allTerminal=true`. Current behaviour preserves this already. `isFirstStage` stays false (no successful stage → `markFirstStage` not called). No welcome toast. Result page shows all-error list; no active variant to nameplate, expander, or footer Download/Share. Footer shows Try another + Gallery only. |
| Mix of success + failure | `completed > 0, failed > 0`. Wait phase exits (completed transitions 0→1+). Result renders. Failed rows show with red dot + error message in the list. Active variant picks first-ready, skipping errored. |
| User refreshes during wait | Page mounts with `data = null, completed = 0`. Wait notes repopulate from localStorage checkpoint. Welcome toast hasn't fired yet (server-side first-stage flag hasn't transitioned). First poll returns current state → either still running (keep waiting) or at least one done (go to result). Seamless. |
| localStorage missing (user opened the batch URL directly in a new browser) | Checkpoint is null, `waitNotes` stays `[]`. `StagingWaitConcierge` renders with the `'Staging in progress…'` fallback string. First poll returns `heroImageUrl`; we update `originalImageUrl` but not `waitNotes` (the wait phase ends when `completed >= 1` anyway, so the fallback displays briefly). Acceptable degradation. |
| Lambda persists no `conciergeNotes` (old deploy, or analyser drifted off-format) | `s.conciergeNotes` is `undefined` → client coerces to `[]` in the `/api/jobs/batch` mapping → `buildConciergeNotes({..., analyserNotes: []})` on the client falls back to just the 5 style-base notes. Expander renders with 5 notes instead of 5-9. No error. |
| User rapidly clicks multiple variants before first reveal completes | `activeJobId` changes via `setActiveJobId`. The slider's `key={active.jobId}` forces remount. But `hasRevealedRef.current` is still false, so `autoReveal` fires on EACH switch until onRevealPeak finally runs once. That would produce multiple lid-lift attempts. Fix: set `hasRevealedRef.current = true` at the **start** of the `autoReveal` effect as well, not only in `onRevealPeak`. Implement in `BatchResult`'s first-reveal tracking: `const isFirstReveal = !hasRevealedRef.current && active?.jobId === firstReady?.jobId; if (isFirstReveal) hasRevealedRef.current = true;` (evaluated during render to ensure ref is flipped before effect fires). |
| `markFirstStage` DDB write fails mid-poll | Helper catches all errors, returns false. `isFirstStage` stays false. Toast doesn't show this time; will show on the next successful single- or batch-stage completion (server-side field is still null). Acceptable. |
| User has never stated any single-style stage but does batch first | Batch poll returns `isFirstStage: true` on the poll that sees `completed 0→1+`. Toast fires once. Future single- or batch-stage polls see `firstStageAt` already set, return `isFirstStage: false`. Behaviour is consistent across entry paths. |
| Lambda deploy not applied (old Lambda, new client) | Lambda's `ANALYSIS_SYSTEM_PROMPT` doesn't emit section 6 → `s.conciergeNotes` always `[]` → expander shows 5 style-base notes. Client renders fine; wait screen uses pre-fill only. No crash, degraded narration. |
| Slider key collides between two variants with same style (shouldn't happen — dedupe enforced at batch creation) | N/A — `/api/stage/batch` rejects duplicate styles per its validation. Spec safeguard; no action needed. |

---

## 9. Acceptance criteria

**Wait phase:**
- [ ] On navigating to `/stage/batch/[batchId]` immediately after submitting a 2+ style batch, the page renders full-frame `<StagingWaitConcierge>` (ghost hero + rotating notes + orientation chip + progress line), NOT the old spinner.
- [ ] The notes shown during the wait are interleaved across the selected styles — first N notes touch all N styles (verify with a 3+ style batch).
- [ ] Hero photo shows blurred + ken-burns + gradient overlay.
- [ ] Transition from wait → result is a smooth 250ms cross-fade when the first variant completes.
- [ ] No flash of the old loader mid-navigation from wizard → batch page.

**Reveal phase:**
- [ ] On first-ready, the slider mounts at position=0 and runs the full 2s lid-lift sweep (same timing as single-style).
- [ ] Handle glows at the 100% peak.
- [ ] Mobile haptic fires at the peak.
- [ ] Desktop hover scale works on the handle.

**Subsequent variant switches:**
- [ ] Clicking another variant in the list cross-fades the slider to that variant (~200ms).
- [ ] Lid-lift does NOT replay on subsequent switches.
- [ ] EditorialNameplate content updates to the new active variant's style name.
- [ ] ConciergeNotesExpander content updates; if it was open, notes re-stagger in with new content.

**Per-variant afterglow:**
- [ ] EditorialNameplate shows "Staged · {roomType}" eyebrow + DM Serif style name above the slider.
- [ ] ConciergeNotesExpander button reads "N things we watched for in your {roomLabel}", collapsed by default, opens with staggered note entry.
- [ ] Expander notes include the 5 style-base notes for the active variant (always) + any per-variant analyser notes the Lambda persisted (0-4).
- [ ] Download button works for active variant — downloads with slug filename.
- [ ] Share Export button generates a 1080×1920 PNG with the active variant.
- [ ] "Try another" routes back to `/stage?hero=…&rooms=…` with prefill (existing behaviour).
- [ ] "Gallery" goes to `/dashboard` (existing behaviour).

**First-stage toast:**
- [ ] On a fresh account that has never staged anywhere, running a batch shows the welcome toast once after first-variant reveal.
- [ ] Toast auto-dismisses after 8s + manual dismiss works + AnimatePresence plays the slide-out.
- [ ] Subsequent batch or single-style completions on the same account do NOT re-show the toast.
- [ ] A user who completes single-style first does NOT see the toast during a subsequent batch.

**Backend / data:**
- [ ] `/api/jobs/batch` response includes `isFirstStage: boolean`.
- [ ] `/api/jobs/batch` response's `subJobs` entries include `conciergeNotes: string[]` (empty array when Lambda hasn't persisted yet).
- [ ] Unit tests pass: `buildBatchWaitNotes` covers the interleave cases in §6.2.1.
- [ ] `npm run build` clean, `npm run type-check` clean.

**Regression:**
- [ ] Single-style stage flow unchanged (still pre-fills base notes, still uses StagingWaitConcierge, still lid-lifts).
- [ ] `src/app/stage/page.tsx` wizard's generating step renders `StagingWaitConcierge` for both single and multi-style (stopgap removed).
- [ ] Gallery "Try another style" still pre-loads correctly.
- [ ] The batch page's existing polling / error / timeout behaviour is unchanged.

---

## 10. Implementation phases (PR breakdown)

**Single PR.** The changes are tightly coupled — removing the stopgap in the wizard depends on the batch page being ready to take over the concierge narration. Splitting would create an awkward intermediate state where multi-style flashes the old loader because the batch page wait UX hasn't shipped yet.

Suggested task order:
1. Backend first — Lambda prompt + parser + persist + propagate (needs Lambda redeploy before anything client-side is verifiable).
2. `batch-jobs.ts` type addition (trivial).
3. `/api/jobs/batch` route additions (markFirstStage + conciergeNotes passthrough). TDD the markFirstStage integration (already tested in isolation from PR #1).
4. `buildBatchWaitNotes` helper + unit tests (TDD).
5. `BatchResult` overhaul (layout, nameplate, expander, footer, welcome toast, first-reveal tracking).
6. `BatchVariantRow` thumbnail fade-in.
7. `/stage/batch/[batchId]` page — wait-then-result state.
8. `src/app/stage/page.tsx` — remove stopgap + pre-fill batch wait notes + checkpoint `styles` field.
9. Manual acceptance walkthrough + push + open PR.

Lambda deploy happens as a discrete step in #1. The rest of the plan is gated on that deploy completing successfully.

---

## 11. Explicitly out of scope

- **Card-pack / slideshow UX alternatives.** Picked the compare-first layered approach during brainstorming.
- **Per-variant analyser re-runs on demand.** The Lambda runs analysis once per sub-job, persists it, done.
- **Onboarding ceremony pass** — separate spec, separate initiative.
- **Regen-token celebration** — separate spec.
- **Batch page authoring changes to the action-list affordance** — the current list+sticky-slider is the right compare tool; we layer ceremony, we don't redesign it.
- **Changes to `/api/stage/batch` (the create route)** — it already returns fast and stays under the Amplify SSR budget. No changes needed there.
- **Audio design.** Same "silent, ever" rule as PR #1.

---

## 12. Open implementation questions (for the plan)

1. **Lambda deploy gate.** Before running any client-side verification, the Lambda must be redeployed with the prompt + parser changes. The plan should include the manual `powershell Compress-Archive` + `aws lambda update-function-code` steps from `project_lambda_deploy.md` as an explicit, marked task. Without it, `conciergeNotes` will always be `[]` on batch responses and the expander content will be 5 notes instead of 5-9.

2. **Lambda analysis behaviour confirmed.** Verified during spec authoring: `lambda/staging-worker/index.mjs:414` already runs `runAnalysisInLambda` when `roomAnalysis.trim() === ''`, so per-style analysis is happening today — just without section 6 (CONCIERGE NOTES) in the prompt. The spec's concierge-per-variant approach is compatible with the current Lambda flow.

3. **First-reveal ref timing.** The `hasRevealedRef.current = true` flip should happen at render time via a `useMemo` or inline assignment inside the component body, NOT in the `onRevealPeak` callback. Otherwise rapid variant switches before the peak fires would each see `isFirstReveal=true` and each kick off a lid-lift. Pattern in §6.2.3 already covers this — verify during implementation that the ref flip happens synchronously on the first render where `activeJobId === firstReady?.jobId`.

4. **Share export performance with multi-variant.** Each click of Share renders a fresh canvas. If the agent is comparing 5 styles and shares each one, that's 5 sequential canvas renders (~2s each). Acceptable. No need to cache exports.

5. **BatchResultSubJob type change is a public API** (it's exported from `batch-result.tsx`). The batch page and any future consumer of that type see the new `conciergeNotes?` field. No breaking changes — the field is optional and additive.

---

*End of spec.*
