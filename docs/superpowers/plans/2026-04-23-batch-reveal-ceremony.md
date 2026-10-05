# Batch Reveal Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the gift-framework ceremony to the multi-style batch staging flow — full-frame concierge wait, lid-lift reveal on first-ready variant, per-variant editorial nameplate + concierge-notes expander, 4-button action footer — and remove the PR #2 stopgap in the wizard.

**Architecture:** Layer ceremony onto the existing compare-first batch layout without replacing it. The Lambda gains a CONCIERGE NOTES section in its analysis prompt + a parser and persists per-variant notes back to the BATCH_JOB record. `/api/jobs/batch` surfaces those notes plus a first-stage flag. `BatchResult` is reworked to swap `EditorialNameplate` + `ConciergeNotesExpander` per active variant and adopt the single-style 4-button footer. A new `buildBatchWaitNotes` helper interleaves `STYLE_CONCIERGE_BASE` entries across the selected styles during the wait.

**Tech Stack:** Next.js 14, TypeScript (strict), Tailwind, framer-motion, AWS DynamoDB (via `@aws-sdk/lib-dynamodb`), Anthropic SDKs (Bedrock + direct) inside the Lambda, Vitest for tests.

**Source spec:** `docs/superpowers/specs/2026-04-23-batch-reveal-ceremony-design.md`.

---

## File structure

**New files:**
- `tests/lib/ai/build-batch-wait-notes.test.ts` — unit tests for the new helper

**Modified files:**
- `src/lib/ai/prompts.ts` — add `buildBatchWaitNotes` helper
- `src/lib/db/batch-jobs.ts` — `BatchSubJob.conciergeNotes` field + `markSubJobDone` helper signature
- `src/components/staging/batch-result.tsx` — full overhaul (nameplate, expander, keyed slider, 4-button footer, welcome toast, first-reveal tracking)
- `src/components/staging/batch-variant-row.tsx` — thumbnail fade-in on load
- `src/app/api/jobs/batch/route.ts` — `markFirstStage` call + `isFirstStage` in response + `conciergeNotes` passthrough per sub-job
- `src/app/stage/batch/[batchId]/page.tsx` — wait-then-result state, read `styles` from checkpoint, compute `waitNotes` via `buildBatchWaitNotes`, pass `isFirstStage` to `BatchResult`
- `src/app/stage/page.tsx` — remove multi-style stopgap, pre-fill batch wait notes, add `styles` to pending-batch checkpoint
- `lambda/staging-worker/index.mjs` — section 6 CONCIERGE NOTES in `ANALYSIS_SYSTEM_PROMPT`, inline `parseConciergeNotes` + `stripConciergeNotes` helpers, `runAnalysisInLambda` returns `{ analysis, concierge_notes }`, `propagateToBatch` accepts + persists `conciergeNotes`, `max_tokens` 1200 → 1400

**Manual deploy step:**
- Lambda redeploy via `aws lambda update-function-code` — see Task 3

**Files intentionally not touched:** `src/components/staging/staging-wait-concierge.tsx`, `src/components/staging/editorial-nameplate.tsx`, `src/components/staging/concierge-notes-expander.tsx`, `src/components/staging/first-stage-welcome-toast.tsx`, `src/components/staging/share-export-button.tsx`, `src/components/comparison/before-after-slider.tsx`, `src/lib/db/first-stage.ts`, `src/lib/ai/parse-concierge-notes.ts`. All already exist from PR #1/#2 and are reused as-is.

---

## Task 1: Type additions — `BatchSubJob.conciergeNotes` + `markSubJobDone` signature

**Files:**
- Modify: `src/lib/db/batch-jobs.ts`

Adds the `conciergeNotes` field to the sub-job type and threads it through the `markSubJobDone` helper (which the Next.js side uses for non-Lambda-path updates, kept in sync for future use).

- [ ] **Step 1: Add `conciergeNotes` to `BatchSubJob` interface**

In `src/lib/db/batch-jobs.ts`, find:

```ts
export interface BatchSubJob {
  jobId: string;
  style: string;
  status: BatchSubJobStatus;
  stagedS3Key?: string;
  sessionId?: string;
  error?: string;
}
```

Replace with:

```ts
export interface BatchSubJob {
  jobId: string;
  style: string;
  status: BatchSubJobStatus;
  stagedS3Key?: string;
  sessionId?: string;
  error?: string;
  conciergeNotes?: string[];  // 0-4 room observations parsed by the Lambda; shown per-variant in the concierge-notes expander
}
```

- [ ] **Step 2: Update `markSubJobDone` signature to accept and persist `conciergeNotes`**

Find:

```ts
export async function markSubJobDone(args: {
  batchId: string;
  jobId: string;
  stagedS3Key: string;
  sessionId: string;
}): Promise<void> {
  await mutateSubJob(
    args.batchId,
    args.jobId,
    (s) => ({ ...s, status: 'done', stagedS3Key: args.stagedS3Key, sessionId: args.sessionId }),
    'completed',
    false,
  );
}
```

Replace with:

```ts
export async function markSubJobDone(args: {
  batchId: string;
  jobId: string;
  stagedS3Key: string;
  sessionId: string;
  conciergeNotes?: string[];
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

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS. No errors expected because the field is optional.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/batch-jobs.ts
git commit -m "types(batch): add conciergeNotes to BatchSubJob + markSubJobDone signature"
```

---

## Task 2: Lambda — section 6 CONCIERGE NOTES + parser + persist

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

The Lambda's `ANALYSIS_SYSTEM_PROMPT` today ends at section 5 (verified: file ends template literal at `CRITICAL: constraints come FIRST. Function over aesthetics.\``). Port the section 6 block from `src/lib/ai/run-analysis.ts` byte-identically, add the parse + strip helpers inline, plumb `conciergeNotes` through `runAnalysisInLambda` into `propagateToBatch`, and bump `max_tokens` 1200 → 1400.

**Important — do not deploy yet.** Task 3 is the deploy step and must run in order.

- [ ] **Step 1: Add section 6 to `ANALYSIS_SYSTEM_PROMPT`**

Find the closing block of `ANALYSIS_SYSTEM_PROMPT`:

```js
5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

CRITICAL: constraints come FIRST. Function over aesthetics.`;
```

Replace with:

```js
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

This matches the Next.js module's text byte-for-byte. Preserve em-dashes (U+2014 `—`) and the word "cosy" (not "cozy").

- [ ] **Step 2: Add `parseConciergeNotes` + `stripConciergeNotes` helpers**

The Lambda has no module graph, so copy the parser functions inline. Add these two functions alongside `runAnalysisInLambda` (before `runAnalysisInLambda` is fine):

```js
// ---------- CONCIERGE NOTES parser (ported inline from src/lib/ai/parse-concierge-notes.ts) ----------

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

- [ ] **Step 3: Bump `max_tokens` and update `runAnalysisInLambda` return shape**

Inside `runAnalysisInLambda`, find:

```js
const response = await client.messages.create({
  model: modelId,
  max_tokens: 1200,
  thinking: { type: 'adaptive' },
  // …
});
```

Change `max_tokens: 1200` to `max_tokens: 1400`:

```js
const response = await client.messages.create({
  model: modelId,
  max_tokens: 1400,   // was 1200 — extra room for CONCIERGE NOTES bullets
  thinking: { type: 'adaptive' },
  // …
});
```

Then find the return statement at the bottom of `runAnalysisInLambda`:

```js
if (!analysis) {
  throw new Error('Claude returned no analysis text');
}

return { analysis };
```

Replace with:

```js
if (!analysis) {
  throw new Error('Claude returned no analysis text');
}

const concierge_notes = parseConciergeNotes(analysis);
const analysisForStaging = stripConciergeNotes(analysis);
return { analysis: analysisForStaging, concierge_notes };
```

- [ ] **Step 4: Thread `concierge_notes` through `stageRoom` into `propagateToBatch`**

Inside `stageRoom`, find the existing destructure of the `runAnalysisInLambda` return:

```js
const result = await runAnalysisInLambda({
  heroBase64,
  refsBase64: refImages,
  style,
  notes: notes || '',
  roomTypes: roomTypes || [],
  useOpus47: !!useOpus47,
});
roomAnalysis = result.analysis;
```

Replace with:

```js
const result = await runAnalysisInLambda({
  heroBase64,
  refsBase64: refImages,
  style,
  notes: notes || '',
  roomTypes: roomTypes || [],
  useOpus47: !!useOpus47,
});
roomAnalysis = result.analysis;
var conciergeNotes = result.concierge_notes;   // NEW — hoist with var so the post-try scope still sees it
```

(Using `var` intentionally so it escapes the `try` block and is visible to the success-path `propagateToBatch` call later. Alternatively declare `let conciergeNotes` above the `if (!roomAnalysis || …)` block; pick based on style preference, but the variable MUST be reachable after the try/catch.)

Handle the error path — if in-Lambda analysis fails, there are no concierge notes. Add to the catch block where `roomAnalysis = ''` is set:

```js
} catch (err) {
  console.error(`${tag} In-Lambda analysis failed:`, err.message);
  roomAnalysis = '';
  conciergeNotes = [];   // NEW
}
```

Then find the success path's `propagateToBatch` call (when staging completes and batchId is set). Add `conciergeNotes` as a param:

```js
await propagateToBatch({
  batchId, jobId, style,
  success: true,
  stagedS3Key, sessionId,
  userId,
  conciergeNotes,   // NEW
});
```

If there's a call site where the analysis wasn't run (caller provided pre-computed analysis — legacy single-stage path), pass `conciergeNotes: undefined` or `[]` — the receiver treats absent as "no notes persisted", which falls back to 5 base notes on the client.

- [ ] **Step 5: Update `propagateToBatch` signature to persist `conciergeNotes`**

Find:

```js
async function propagateToBatch({ batchId, jobId, style, success, stagedS3Key, sessionId, error, userId }) {
```

Change to:

```js
async function propagateToBatch({ batchId, jobId, style, success, stagedS3Key, sessionId, error, userId, conciergeNotes }) {
```

Inside the function, find:

```js
const newSubJobs = (current.subJobs || []).map((s) => {
  if (s.jobId !== jobId) return s;
  return success
    ? { ...s, status: 'done', stagedS3Key, sessionId }
    : { ...s, status: 'error', error };
});
```

Change to:

```js
const newSubJobs = (current.subJobs || []).map((s) => {
  if (s.jobId !== jobId) return s;
  return success
    ? { ...s, status: 'done', stagedS3Key, sessionId, conciergeNotes }
    : { ...s, status: 'error', error };
});
```

- [ ] **Step 6: Syntax-check the Lambda file (no type-check — Lambda is JS)**

Run: `node --check lambda/staging-worker/index.mjs`
Expected: no output (silent success) — any syntax error will print here.

- [ ] **Step 7: Commit**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): section 6 CONCIERGE NOTES + parser + persist per sub-job"
```

---

## Task 3: Lambda deploy (manual CLI step)

**Files:** (deployment only — no code changes)

Amplify ships Next.js only; `lambda/staging-worker/` is NOT auto-deployed per `project_lambda_deploy.md`. The Task 2 changes stay dormant until this manual step runs.

- [ ] **Step 1: Zip the Lambda directory**

From the project root, run (bash on Windows uses PowerShell's `Compress-Archive`):

```bash
powershell.exe -NoProfile -Command "cd 'lambda/staging-worker'; if (Test-Path '../staging-worker.zip') { Remove-Item '../staging-worker.zip' }; Compress-Archive -Path ./* -DestinationPath '../staging-worker.zip' -CompressionLevel Optimal"
```

Expected: `lambda/staging-worker.zip` created, ~10MB.

- [ ] **Step 2: Upload to Lambda**

```bash
cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2
```

Expected: JSON output with `"LastUpdateStatus": "InProgress"` (or already `"Successful"` on fast rollovers).

- [ ] **Step 3: Wait for rollover**

```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
```

Wait until `LastUpdateStatus: "Successful"` AND `State: "Active"`. Typically <30s.

Return to project root:

```bash
cd ..
```

- [ ] **Step 4: Smoke-test (quick sanity check)**

No automated test — the Lambda doesn't have unit tests. The rest of this plan's tasks will exercise the change end-to-end via Task 10's manual acceptance walkthrough. For now, continue to Task 4.

---

## Task 4: `/api/jobs/batch` — add `markFirstStage` + `isFirstStage` + `conciergeNotes` passthrough

**Files:**
- Modify: `src/app/api/jobs/batch/route.ts`

- [ ] **Step 1: Add `markFirstStage` import and conciergeNotes passthrough**

Open `src/app/api/jobs/batch/route.ts`. At the top, add the import alongside the existing imports:

```ts
import { markFirstStage } from '@/lib/db/first-stage';
```

- [ ] **Step 2: Update the subJobs mapping to include `conciergeNotes`**

Find:

```ts
const subJobs = await Promise.all(
  batch.subJobs.map(async (s) => ({
    jobId: s.jobId,
    style: s.style,
    status: s.status,
    imageUrl: s.stagedS3Key ? await getSignedDownloadUrl(s.stagedS3Key) : undefined,
    s3Key: s.stagedS3Key,
    sessionId: s.sessionId,
    error: s.error,
  })),
);
```

Replace with:

```ts
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
```

- [ ] **Step 3: Add `markFirstStage` call + `isFirstStage` in response**

Find the final return block:

```ts
const terminal = batch.completed + batch.failed === batch.total;
const allFailed = batch.failed === batch.total;

const heroImageUrl = batch.heroS3Key ? await getSignedDownloadUrl(batch.heroS3Key) : undefined;

return NextResponse.json({
  batchId: batch.batchId,
  status: allFailed ? 'error' : terminal ? 'done' : 'running',
  total: batch.total,
  completed: batch.completed,
  failed: batch.failed,
  refundedCredits: batch.refundedCredits,
  heroImageUrl,
  subJobs,
});
```

Replace with:

```ts
const terminal = batch.completed + batch.failed === batch.total;
const allFailed = batch.failed === batch.total;

const heroImageUrl = batch.heroS3Key ? await getSignedDownloadUrl(batch.heroS3Key) : undefined;

// First-stage detection. Only fire when at least one sub-job is done.
// markFirstStage is idempotent (ConditionalUpdate on attribute_not_exists);
// only one poll across a user's lifetime ever returns true.
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
  isFirstStage,
});
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jobs/batch/route.ts
git commit -m "feat(jobs-batch): surface conciergeNotes per sub-job + isFirstStage flag"
```

---

## Task 5: `buildBatchWaitNotes` helper + tests

**Files:**
- Modify: `src/lib/ai/prompts.ts`
- Test: `tests/lib/ai/build-batch-wait-notes.test.ts` (new)

- [ ] **Step 1: Write failing tests** — create `tests/lib/ai/build-batch-wait-notes.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildBatchWaitNotes, STYLE_CONCIERGE_BASE } from '@/lib/ai/prompts';

describe('buildBatchWaitNotes', () => {
  it('returns the 5 base notes for a single style with roomLabel interpolated', () => {
    const result = buildBatchWaitNotes({ styles: ['Coastal'], roomTypes: ['Living Room'] });
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('Pulling light blues and sandy beiges into your living room.');
    expect(result[1]).toBe('Weaving in rattan and linen textures.');
    expect(result[4]).toBe('Keeping the layout airy and the palette breathable.');
  });

  it('interleaves notes across two styles so both get airtime in the first pass', () => {
    const result = buildBatchWaitNotes({
      styles: ['Coastal', 'Modern'],
      roomTypes: ['Bedroom'],
    });
    expect(result).toHaveLength(10);
    // first pass: index 0 of each style in order
    expect(result[0]).toBe('Pulling light blues and sandy beiges into your bedroom.');
    expect(result[1]).toBe('Layering clean lines and neutral tones through your bedroom.');
    // second pass: index 1 of each style
    expect(result[2]).toBe('Weaving in rattan and linen textures.');
    expect(result[3]).toBe('Adding geometric shapes and polished surfaces.');
  });

  it('interleaves three styles so the first three notes touch all three', () => {
    const result = buildBatchWaitNotes({
      styles: ['Coastal', 'Modern', 'Japandi'],
      roomTypes: ['Studio'],
    });
    expect(result).toHaveLength(15);
    expect(result[0]).toContain('Pulling light blues');
    expect(result[1]).toContain('Layering clean lines');
    expect(result[2]).toContain('Choosing low-profile natural wood');
    // Each of the first 3 notes is from a different style
    expect(result[0]).not.toBe(result[1]);
    expect(result[1]).not.toBe(result[2]);
    expect(result[0]).not.toBe(result[2]);
  });

  it('falls back to "room" when roomTypes is empty', () => {
    const result = buildBatchWaitNotes({ styles: ['Modern'], roomTypes: [] });
    expect(result[0]).toContain('your room');
  });

  it('uses the first room type when multiple are provided', () => {
    const result = buildBatchWaitNotes({
      styles: ['Boho'],
      roomTypes: ['Living Room', 'Dining Room'],
    });
    expect(result[0]).toContain('living room');
    expect(result[0]).not.toContain('dining');
  });

  it('returns [] when styles array is empty', () => {
    const result = buildBatchWaitNotes({ styles: [], roomTypes: ['Bedroom'] });
    expect(result).toEqual([]);
  });

  it('never mutates STYLE_CONCIERGE_BASE', () => {
    const before = STYLE_CONCIERGE_BASE.Coastal[0];
    buildBatchWaitNotes({ styles: ['Coastal'], roomTypes: ['Kitchen'] });
    expect(STYLE_CONCIERGE_BASE.Coastal[0]).toBe(before);
    expect(STYLE_CONCIERGE_BASE.Coastal[0]).toContain('{roomLabel}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/ai/build-batch-wait-notes.test.ts`
Expected: FAIL — `buildBatchWaitNotes` is not exported yet.

- [ ] **Step 3: Add `buildBatchWaitNotes` to `src/lib/ai/prompts.ts`**

Append after `buildConciergeNotes` (near the bottom of the file):

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
 *  - No analyser notes — analysis runs per-Lambda at stage time; the wait
 *    screen uses style-derived base notes only.
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/lib/ai/build-batch-wait-notes.test.ts`
Expected: PASS (all 7 tests green).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/prompts.ts tests/lib/ai/build-batch-wait-notes.test.ts
git commit -m "feat(staging): buildBatchWaitNotes helper — interleaved style notes for batch wait"
```

---

## Task 6: `BatchVariantRow` — thumbnail fade-in on load

**Files:**
- Modify: `src/components/staging/batch-variant-row.tsx`

- [ ] **Step 1: Add `imgLoaded` state and transition the thumbnail**

Find the top of `BatchVariantRow`:

```tsx
'use client';

import { cn } from '@/lib/utils/cn';
import type { StagingStyle } from '@/lib/ai/prompts';
```

Add the `useState` import:

```tsx
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import type { StagingStyle } from '@/lib/ai/prompts';
```

Find the thumbnail block:

```tsx
<span className="flex-shrink-0 size-14 sm:size-16 rounded-lg overflow-hidden bg-surface-secondary relative">
  {imageUrl ? (
    <img src={imageUrl} alt="" className="size-full object-cover" />
  ) : (
    <span className="absolute inset-0 skeleton-shimmer" aria-hidden />
  )}
</span>
```

Replace with:

```tsx
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
```

Add the state hook inside the component body (before the return):

```tsx
const [imgLoaded, setImgLoaded] = useState(false);
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/batch-variant-row.tsx
git commit -m "polish(batch): thumbnail fade-in on load in BatchVariantRow"
```

---

## Task 7: `BatchResult` overhaul — nameplate + expander + footer + first-reveal tracking

**Files:**
- Modify: `src/components/staging/batch-result.tsx`

This is the biggest single task. Rewrites the result component to add per-variant editorial nameplate, per-variant concierge-notes expander, 4-button action footer (Download / Share / Try another / Gallery), first-reveal tracking for the lid-lift, and conditional welcome toast.

- [ ] **Step 1: Update imports at the top of the file**

Find the current imports:

```tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { BatchVariantRow } from '@/components/staging/batch-variant-row';
import { StagingLoader } from '@/components/staging/staging-loader';
import type { StagingStyle } from '@/lib/ai/prompts';
```

Replace with:

```tsx
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { BatchVariantRow } from '@/components/staging/batch-variant-row';
import { EditorialNameplate } from '@/components/staging/editorial-nameplate';
import { ConciergeNotesExpander } from '@/components/staging/concierge-notes-expander';
import { ShareExportButton } from '@/components/staging/share-export-button';
import { FirstStageWelcomeToast } from '@/components/staging/first-stage-welcome-toast';
import { buildConciergeNotes, type StagingStyle } from '@/lib/ai/prompts';
```

Note: `StagingLoader` import is removed — the wait is now handled by the parent page component (Task 8).

- [ ] **Step 2: Update `BatchResultSubJob` interface to include `conciergeNotes` + `s3Key`**

Find:

```tsx
export interface BatchResultSubJob {
  jobId: string;
  style: StagingStyle;
  status: 'pending' | 'running' | 'done' | 'error';
  imageUrl?: string;
  error?: string;
}
```

Replace with:

```tsx
export interface BatchResultSubJob {
  jobId: string;
  style: StagingStyle;
  status: 'pending' | 'running' | 'done' | 'error';
  imageUrl?: string;
  s3Key?: string;              // For Download — comes from s.stagedS3Key on the server
  error?: string;
  conciergeNotes?: string[];   // Per-variant observations persisted by the Lambda
}
```

- [ ] **Step 3: Update `BatchResultProps` to include `isFirstStage`**

Find:

```tsx
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
}
```

Replace with:

```tsx
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
  isFirstStage: boolean;   // NEW — driven by /api/jobs/batch; welcome toast fires once when true
}
```

Update the function signature destructuring similarly — add `isFirstStage` to the parameter destructure.

- [ ] **Step 4: Rewrite the component body**

Replace the entire component body (from `export function BatchResult` through the closing brace of the function) with:

```tsx
export function BatchResult({
  originalImageUrl,
  roomTypeLabel,
  total,
  completed,
  failed,
  subJobs,
  refundedCredits,
  allTerminal,
  heroS3Key,
  roomTypes,
  isFirstStage,
}: BatchResultProps) {
  const firstReady = useMemo(
    () => subJobs.find((s) => s.status === 'done' && s.imageUrl),
    [subJobs],
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Auto-select the first-ready sub-job once it arrives, if nothing is selected yet.
  useEffect(() => {
    if (!activeJobId && firstReady) setActiveJobId(firstReady.jobId);
  }, [activeJobId, firstReady]);

  const active = subJobs.find((s) => s.jobId === activeJobId) ?? firstReady ?? null;

  // First-reveal tracking — lid-lift fires exactly once per batch session.
  // Flipped at render time (not in onRevealPeak) so rapid variant switches
  // before the peak fires do not each re-trigger the sweep.
  const hasRevealedRef = useRef(false);
  const isFirstReveal =
    active?.jobId === firstReady?.jobId &&
    active?.status === 'done' &&
    !hasRevealedRef.current;
  if (isFirstReveal) hasRevealedRef.current = true;

  // Per-variant concierge notes — combines the active variant's style base
  // notes with that variant's own analyser observations (persisted by the
  // Lambda). Content updates automatically on variant switch.
  const activeNotes = useMemo(() => {
    if (!active) return [];
    return buildConciergeNotes({
      style: active.style,
      roomTypes,
      analyserNotes: active.conciergeNotes ?? [],
    });
  }, [active, roomTypes]);

  // Local welcome-toast state — initialised from the server flag so dismissing
  // it at the component level doesn't require a new poll.
  const [showWelcome, setShowWelcome] = useState(isFirstStage);
  useEffect(() => {
    if (isFirstStage) setShowWelcome(true);
  }, [isFirstStage]);

  const tryAnotherHref = heroS3Key
    ? `/stage?hero=${encodeURIComponent(heroS3Key)}&rooms=${encodeURIComponent(roomTypes.join(','))}`
    : '/stage';

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8 py-6 sm:py-10">
      <header className="mb-5">
        <p className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.12em]">
          Your staged variants
        </p>
        <h1 className="mt-1 font-heading text-2xl sm:text-3xl text-brand-navy tracking-tight">
          {total} {total === 1 ? 'style' : 'styles'}, one {roomTypeLabel.toLowerCase()}.
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {completed} of {total} complete
          {failed > 0 && ` · ${failed} failed`}
          {refundedCredits > 0 &&
            ` · ${refundedCredits} credit${refundedCredits === 1 ? '' : 's'} refunded`}
        </p>
      </header>

      <div className="bg-white border border-surface-border rounded-2xl shadow-soft p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-[1.9fr_1fr] gap-5 md:gap-8 items-start">
          {/* Slider column — sticky on md+. On mobile, sticky top so comparison stays in view. */}
          <div className="md:sticky md:top-24 md:self-start sticky top-0 z-10 bg-white pb-3 md:pb-0">
            {active ? (
              <>
                <EditorialNameplate style={active.style} roomTypes={roomTypes} />
                <div className="mt-3">
                  {active.imageUrl ? (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={active.jobId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <BeforeAfterSlider
                          key={active.jobId}
                          beforeSrc={originalImageUrl}
                          afterSrc={active.imageUrl}
                          beforeLabel="Empty"
                          afterLabel={active.style}
                          autoReveal={isFirstReveal}
                          onRevealPeak={() => {
                            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                              navigator.vibrate(12);
                            }
                          }}
                        />
                      </motion.div>
                    </AnimatePresence>
                  ) : (
                    <div className="aspect-[4/3] rounded-2xl border border-surface-border bg-surface-secondary flex items-center justify-center text-sm text-ink-muted">
                      {active.status === 'error' ? (active.error || 'This variant failed.') : 'Waiting…'}
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <ConciergeNotesExpander notes={activeNotes} style={active.style} />
                </div>
              </>
            ) : (
              <div className="aspect-[4/3] rounded-2xl border border-dashed border-surface-border bg-surface-secondary flex items-center justify-center text-sm text-ink-muted">
                Pick a variant from the list →
              </div>
            )}
          </div>

          {/* Variant list — right column */}
          <div>
            <p className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.12em] mb-2">
              Variants
            </p>
            <ul className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1">
              {subJobs.map((s) => (
                <li key={s.jobId}>
                  <BatchVariantRow
                    style={s.style}
                    status={s.status}
                    imageUrl={s.imageUrl}
                    active={s.jobId === activeJobId}
                    errorMessage={s.error}
                    onClick={() => setActiveJobId(s.jobId)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Action footer — 4-button responsive grid matches single-style */}
        <div className="mt-5 pt-5 border-t border-surface-border">
          <div className="mx-auto w-full max-w-[720px] grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {active?.s3Key && active.status === 'done' ? (
              <a
                href={`/api/download?key=${encodeURIComponent(active.s3Key)}&style=${encodeURIComponent(active.style)}${roomTypes.length > 0 ? `&rooms=${encodeURIComponent(roomTypes.join(','))}` : ''}`}
                className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-medium text-sm rounded-xl hover:bg-brand-navy-light transition-colors whitespace-nowrap"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Download
              </a>
            ) : (
              <span className="h-11 sm:h-12 rounded-xl bg-surface-secondary" aria-hidden />
            )}
            {active?.imageUrl && active.status === 'done' && originalImageUrl ? (
              <ShareExportButton
                beforeImageUrl={originalImageUrl}
                afterImageUrl={active.imageUrl}
                style={active.style}
                roomTypes={roomTypes}
              />
            ) : (
              <span className="h-11 sm:h-12 rounded-xl bg-surface-secondary" aria-hidden />
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
      </div>

      <AnimatePresence>
        {showWelcome && active?.status === 'done' && (
          <FirstStageWelcomeToast onDismiss={() => setShowWelcome(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

If `npm run build` flags any `react/no-unescaped-entities` errors, check for unescaped apostrophes (`'`) in JSX text and replace with `&apos;`.

- [ ] **Step 6: Commit**

```bash
git add src/components/staging/batch-result.tsx
git commit -m "feat(batch-result): nameplate, expander, 4-button footer, first-reveal, welcome toast"
```

---

## Task 8: `/stage/batch/[batchId]` page — wait-then-result state

**Files:**
- Modify: `src/app/stage/batch/[batchId]/page.tsx`

Renders `<StagingWaitConcierge>` full-frame until `completed >= 1`, then cross-fades to `<BatchResult>`. Reads `styles` and `roomTypes` from the pending-batch localStorage checkpoint so `buildBatchWaitNotes` can pre-fill notes before the first poll returns. Passes `isFirstStage` through to `BatchResult`.

- [ ] **Step 1: Update imports and state**

Open `src/app/stage/batch/[batchId]/page.tsx`. Find the current imports:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BatchResult, type BatchResultSubJob } from '@/components/staging/batch-result';
```

Replace with:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BatchResult, type BatchResultSubJob } from '@/components/staging/batch-result';
import { StagingWaitConcierge } from '@/components/staging/staging-wait-concierge';
import { buildBatchWaitNotes, type StagingStyle } from '@/lib/ai/prompts';
```

- [ ] **Step 2: Update the `BatchPollResponse` interface to include `isFirstStage`**

Find:

```tsx
interface BatchPollResponse {
  batchId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  heroImageUrl?: string;
  subJobs: BatchResultSubJob[];
}
```

Replace with:

```tsx
interface BatchPollResponse {
  batchId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  heroImageUrl?: string;
  subJobs: BatchResultSubJob[];
  isFirstStage: boolean;
}
```

- [ ] **Step 3: Add `waitNotes` state + compute on mount from checkpoint**

Find the state block inside `BatchResultPage`:

```tsx
const [data, setData] = useState<BatchPollResponse | null>(null);
const [error, setError] = useState<string | null>(null);
const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
const [roomTypeLabel, setRoomTypeLabel] = useState<string>('room');
const [heroS3Key, setHeroS3Key] = useState<string | null>(null);
const [roomTypes, setRoomTypes] = useState<string[]>([]);
```

Replace with:

```tsx
const [data, setData] = useState<BatchPollResponse | null>(null);
const [error, setError] = useState<string | null>(null);
const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
const [roomTypeLabel, setRoomTypeLabel] = useState<string>('room');
const [heroS3Key, setHeroS3Key] = useState<string | null>(null);
const [roomTypes, setRoomTypes] = useState<string[]>([]);
const [waitNotes, setWaitNotes] = useState<string[]>([]);
```

- [ ] **Step 4: Populate `waitNotes` from the checkpoint read-back**

Find the effect that reads `stageright:pending-batch`:

```tsx
try {
  const cp = localStorage.getItem(CHECKPOINT_KEY);
  if (cp) {
    const parsed = JSON.parse(cp) as {
      originalImageUrl?: string;
      roomTypeLabel?: string;
      batchId?: string;
      heroS3Key?: string;
      roomTypes?: string[];
    };
    if (parsed.batchId === batchId) {
      if (parsed.originalImageUrl) setOriginalImageUrl(parsed.originalImageUrl);
      if (parsed.roomTypeLabel) setRoomTypeLabel(parsed.roomTypeLabel);
      if (parsed.heroS3Key) setHeroS3Key(parsed.heroS3Key);
      if (Array.isArray(parsed.roomTypes)) setRoomTypes(parsed.roomTypes);
    }
  }
} catch {
  // Invalid localStorage → ignore and proceed
}
```

Replace with:

```tsx
try {
  const cp = localStorage.getItem(CHECKPOINT_KEY);
  if (cp) {
    const parsed = JSON.parse(cp) as {
      originalImageUrl?: string;
      roomTypeLabel?: string;
      batchId?: string;
      heroS3Key?: string;
      roomTypes?: string[];
      styles?: StagingStyle[];
    };
    if (parsed.batchId === batchId) {
      if (parsed.originalImageUrl) setOriginalImageUrl(parsed.originalImageUrl);
      if (parsed.roomTypeLabel) setRoomTypeLabel(parsed.roomTypeLabel);
      if (parsed.heroS3Key) setHeroS3Key(parsed.heroS3Key);
      if (Array.isArray(parsed.roomTypes)) setRoomTypes(parsed.roomTypes);
      if (
        Array.isArray(parsed.styles) &&
        parsed.styles.length > 0 &&
        Array.isArray(parsed.roomTypes)
      ) {
        setWaitNotes(
          buildBatchWaitNotes({ styles: parsed.styles, roomTypes: parsed.roomTypes }),
        );
      }
    }
  }
} catch {
  // Invalid localStorage → ignore and proceed
}
```

- [ ] **Step 5: Replace the render logic to cross-fade between wait and result**

Find the render return that currently renders the error/loading/result states:

```tsx
if (error) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-2xl text-brand-navy tracking-tight">{error}</h1>
        <button
          onClick={() => router.push('/stage')}
          className="mt-6 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm"
        >
          Back to the wizard
        </button>
      </div>
    </main>
  );
}

if (!data) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="size-8 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
    </main>
  );
}

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
    />
  </main>
);
```

Replace with:

```tsx
if (error) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <h1 className="font-heading text-2xl text-brand-navy tracking-tight">{error}</h1>
        <button
          onClick={() => router.push('/stage')}
          className="mt-6 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm"
        >
          Back to the wizard
        </button>
      </div>
    </main>
  );
}

const showWait = !data || data.completed === 0;

return (
  <AnimatePresence mode="wait">
    {showWait ? (
      <motion.main
        key="wait"
        className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <StagingWaitConcierge
          heroImageUrl={originalImageUrl || ''}
          conciergeNotes={waitNotes}
        />
      </motion.main>
    ) : (
      <motion.main
        key="result"
        className="min-h-screen bg-surface"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <BatchResult
          originalImageUrl={originalImageUrl}
          roomTypeLabel={roomTypeLabel}
          total={data!.total}
          completed={data!.completed}
          failed={data!.failed}
          subJobs={data!.subJobs}
          refundedCredits={data!.refundedCredits}
          allTerminal={data!.status !== 'running'}
          heroS3Key={heroS3Key}
          roomTypes={roomTypes}
          isFirstStage={data!.isFirstStage}
        />
      </motion.main>
    )}
  </AnimatePresence>
);
```

- [ ] **Step 6: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/stage/batch/[batchId]/page.tsx
git commit -m "feat(batch-page): wait-then-result state with concierge narration and isFirstStage"
```

---

## Task 9: Wizard — remove stopgap, pre-fill batch wait, checkpoint `styles`

**Files:**
- Modify: `src/app/stage/page.tsx`

Three changes in the wizard:
1. Remove the PR #2 stopgap (the `styles.length > 1 ? WizardCard+StagingLoader : StagingWaitConcierge` branch) — always use `StagingWaitConcierge`.
2. Pre-fill `conciergeNotes` with `buildBatchWaitNotes(styles, roomTypes)` in the multi-style path of `runStaging` before calling `/api/stage/batch`.
3. Include `styles` in the `stageright:pending-batch` localStorage checkpoint so the batch page can reconstruct wait notes on deep link / refresh.

- [ ] **Step 1: Update imports**

Near the top of `src/app/stage/page.tsx`, find:

```ts
import { STYLE_CONCIERGE_BASE, buildConciergeNotes, type StagingStyle } from '@/lib/ai/prompts';
```

Replace with:

```ts
import { STYLE_CONCIERGE_BASE, buildConciergeNotes, buildBatchWaitNotes, type StagingStyle } from '@/lib/ai/prompts';
```

Then find and remove the `StagingLoader` import if present (from the PR #2 stopgap):

```ts
// REMOVE this line if it exists:
import { StagingLoader } from '@/components/staging/staging-loader';
```

Also find and remove the `WizardCard` import IF it's only used for the stopgap generating-step branch. If `WizardCard` is used elsewhere in the file (it is, across other steps — upload, reference, rooms, style, notes), KEEP the import.

- [ ] **Step 2: Replace the stopgap branch in the `generating` step JSX**

Find the generating-step branch (the PR #2 stopgap):

```tsx
{step === 'generating' && (
  styles.length > 1 ? (
    <WizardCard
      key="generating"
      tag="Staging"
      tagTone="teal"
      question="Creating your staged rooms"
      subtitle="This takes 20–40 seconds. Keep this tab open."
    >
      <StagingLoader />
    </WizardCard>
  ) : (
    <StagingWaitConcierge
      key="generating"
      heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
      conciergeNotes={conciergeNotes}
    />
  )
)}
```

Replace with:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    key="generating"
    heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
    conciergeNotes={conciergeNotes}
  />
)}
```

- [ ] **Step 3: Pre-fill batch wait notes in `runStaging` (multi-style branch)**

Find the multi-style branch inside `runStaging`. It calls `/api/stage/batch`. Before the `fetch`, add the pre-fill:

Find:

```tsx
// Multi-style: batch branch
setError(null);
advanceTo('generating');
try {
  const res = await fetch('/api/stage/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heroS3Key,
      referenceS3Keys: refS3Keys,
      roomTypes,
      styles,
      notes: (notes || '').trim() || undefined,
      quality: 'standard',
    }),
  });
```

Replace with:

```tsx
// Multi-style: batch branch
setError(null);
advanceTo('generating');

// Pre-fill wait notes using the interleaved batch helper so the concierge
// wait mounts with real content before /api/stage/batch returns.
setConciergeNotes(buildBatchWaitNotes({ styles, roomTypes }));

try {
  const res = await fetch('/api/stage/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heroS3Key,
      referenceS3Keys: refS3Keys,
      roomTypes,
      styles,
      notes: (notes || '').trim() || undefined,
      quality: 'standard',
    }),
  });
```

- [ ] **Step 4: Add `styles` to the pending-batch localStorage checkpoint**

Find the checkpoint-write block after the batch fetch succeeds:

```tsx
try {
  localStorage.setItem(
    'stageright:pending-batch',
    JSON.stringify({
      batchId,
      originalImageUrl: heroSignedUrl,
      roomTypeLabel: roomTypes[0] ?? 'room',
      heroS3Key,
      roomTypes,
      startedAt: Date.now(),
    }),
  );
} catch { /* noop */ }
```

Replace with:

```tsx
try {
  localStorage.setItem(
    'stageright:pending-batch',
    JSON.stringify({
      batchId,
      originalImageUrl: heroSignedUrl,
      roomTypeLabel: roomTypes[0] ?? 'room',
      heroS3Key,
      roomTypes,
      styles,             // NEW — consumed by /stage/batch/[batchId]/page.tsx to build waitNotes
      startedAt: Date.now(),
    }),
  );
} catch { /* noop */ }
```

- [ ] **Step 5: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Watch for `react/no-unescaped-entities` in case any unrelated JSX was touched during the edit.

- [ ] **Step 6: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): remove multi-style stopgap, pre-fill batch wait notes, checkpoint styles"
```

---

## Task 10: Manual acceptance + push + open PR

**Files:** (verification + ship)

Before opening the PR, walk through the spec's §9 acceptance criteria on the local dev server.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts (port 3000 or next free).

- [ ] **Step 2: Walk the wait-phase checklist (multi-style)**

Sign in, upload a hero, pick **3 or more styles** and a room type, hit Stage. Verify:

- [ ] The wizard's `generating` step shows the full-frame `StagingWaitConcierge` (not the old `WizardCard + StagingLoader`). Stopgap is gone.
- [ ] After ~200ms, the router navigates to `/stage/batch/[batchId]` and the full-frame concierge wait continues visually seamless (same component, possibly different hero image). No flash of the old spinner or a blank frame.
- [ ] The notes shown during the wait are interleaved across the selected styles — first N notes touch all N styles.
- [ ] Orientation chip + progress line behave as single-style.

- [ ] **Step 3: Walk the first-reveal checklist**

Wait for the first variant to complete (~30-45s):

- [ ] Wait screen cross-fades out (~250ms) and the slider+list layout cross-fades in.
- [ ] The first-ready variant auto-selects in the list.
- [ ] The slider runs the full 2s lid-lift sweep (0% → 100% → 50%).
- [ ] Handle glows at peak.
- [ ] Mobile haptic fires at peak (if testing on a real mobile device).
- [ ] EditorialNameplate shows "Staged · {roomType}" + style name in DM Serif.
- [ ] ConciergeNotesExpander button reads "N things we watched for in your {roomLabel}" — where N is 5 (base only, if Lambda hasn't persisted notes yet) or 5-9 (base + Lambda analyser notes).

- [ ] **Step 4: Walk the subsequent-variant checklist**

Click another variant in the right-hand list:

- [ ] Slider cross-fades (~200ms) to the new variant. NO lid-lift sweep.
- [ ] EditorialNameplate content updates to the new variant's style.
- [ ] ConciergeNotesExpander content updates — if open, notes re-stagger in.
- [ ] Action footer's Download + Share apply to the new active variant.

Keep switching — lid-lift must NOT replay on any subsequent switch.

- [ ] **Step 5: Test Download + Share per-variant**

- [ ] Download → downloads a PNG named `stageright-{style}-{room}-staged.png` (or equivalent slug).
- [ ] Share image → generates the 1080×1920 share PNG for the active variant.

- [ ] **Step 6: Test the first-stage welcome toast**

Reset your account's `firstStageAt` (if testing against a used admin account):

```bash
aws dynamodb update-item --table-name stageright \
  --key '{"pk":{"S":"USER#<your-cognito-sub>"},"sk":{"S":"PROFILE"}}' \
  --update-expression "REMOVE firstStageAt" \
  --region ap-southeast-2
```

Run another batch stage. Verify:

- [ ] The welcome toast appears 1.5s after the first reveal settles.
- [ ] Text: "Your first staged room." / "It lives in your gallery now."
- [ ] Auto-dismisses after 8s with a clean slide-out (AnimatePresence).
- [ ] Manual X dismiss also slides out cleanly.
- [ ] Refreshing the page during the 8s window does NOT re-show the toast.
- [ ] Completing another stage (single OR batch) does NOT re-show the toast.

- [ ] **Step 7: Regression check**

- [ ] Single-style stage still works — ceremony unchanged.
- [ ] Gallery → "Try another style" on any variant still pre-loads the hero and routes to the style step.
- [ ] Batch page error state (`error !== null`) still renders the error fallback.

- [ ] **Step 8: Unit tests + final build**

Run: `npm run test && npm run type-check && npm run build`
Expected: all `tests/lib/**` green (the pre-existing `tests/api/stage-batch.test.ts` failures from security PR `b26ec48` are still expected; other new tests pass). Type-check and build both clean.

- [ ] **Step 9: Push the branch and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(staging): batch reveal ceremony — wait / reveal / afterglow + stopgap removal" --body "$(cat <<'EOF'
## Summary
Applies the gift-framework ceremony to the multi-style batch flow:
- Full-frame concierge wait until the first variant completes (interleaved
  style notes across all selected styles via new buildBatchWaitNotes)
- 2s lid-lift reveal on first-ready; subsequent switches cross-fade
- Per-variant EditorialNameplate + ConciergeNotesExpander + 4-button footer
- First-stage welcome toast works across single + batch paths
- Removes PR #2's multi-style stopgap in the wizard

Backend: Lambda ANALYSIS_SYSTEM_PROMPT gains section 6 (CONCIERGE NOTES),
inline parser + stripper, per-sub-job persistence via propagateToBatch.
Lambda redeployed manually via CLI. /api/jobs/batch surfaces the per-
variant conciergeNotes and an isFirstStage flag.

Spec: docs/superpowers/specs/2026-04-23-batch-reveal-ceremony-design.md
Plan: docs/superpowers/plans/2026-04-23-batch-reveal-ceremony.md

## Test plan
- [x] Unit: buildBatchWaitNotes interleave + fallback + non-mutation (7 tests)
- [x] Type-check + build clean
- [ ] Manual: multi-style → full-frame wait → first-ready lid-lift → per-variant nameplate + expander + footer
- [ ] Manual: subsequent variant switch cross-fades, no re-lift
- [ ] Manual: share export + download work for active variant
- [ ] Manual: first-stage welcome toast fires once across single + batch paths
- [ ] Manual: single-style flow unchanged, gallery Try-another still works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out of scope reminders

- **Card-pack / slideshow alternative UX shapes** — decided against during brainstorming.
- **Onboarding ceremony pass** — separate spec, separate initiative.
- **Regen-token celebration** — separate spec.
- **Audio design** — silent by design (same rule as PR #1).
- **Changes to `/api/stage/batch` create route** — already fast enough; not touched.
- **Stopgap fallback preservation** — the stopgap was explicitly temporary; it's removed by this plan.

---

*End of plan.*
