# Three Takes Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Triple-Takes bundle — make 3-image (NB Pro + GPT Med + GPT High) the default per-style staging at 2 credits, keep single-image at 1 credit as opt-out, with shared Opus analysis, persistent-slider variant carousel, listing-set grouping, partial-refund on per-variant failure, per-credit-spent bonus counting, and updated landing copy.

**Architecture:** Extend the existing `BatchJob` entity in DDB to carry per-style **variants** (already has `subJobs`, just needs them grouped under styles). Move analysis from per-Lambda back to API-layer for triple mode (matches `/admin/compare`'s pattern; `maxDuration = 60` accepts the longer SSR window). Lambda gains a simple silent retry-once. One `VariantCarousel` component drives reveal, gallery viewer, and listing detail — same persistent slider drag pattern as `/admin/compare`. Bonus credit counting moves from Lambda (per stage completion) to API (per credit deduction).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, AWS Lambda (Node.js ESM), DynamoDB single-table, Tailwind, Framer Motion, Sharp+Pango watermarking, Zod validation, ulid, `@google/genai` (Nano Banana), `openai` (GPT Image 2).

**Spec:** `docs/superpowers/specs/2026-04-27-three-takes-bundle-design.md` — read it before starting Phase A.

**Phase order is sequenced; do not parallelise across phases.** Within a phase, tasks build on each other.

---

## Phase A — Type & schema foundations

Lock the data shape that everything downstream depends on.

### Task A.1: Add bundle types to `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Open `src/types/index.ts`. Add bundle-related types**

Append near the bottom of the file (before the file's last `export` block, or at the end if there isn't one):

```ts
// ────────────────────────────────────────────────────────────────────────
// Three Takes Bundle types
// ────────────────────────────────────────────────────────────────────────

/** Bundle choice: 'single' = 1 take, 1 credit; 'triple' = 3 takes, 2 credits. */
export type Bundle = 'single' | 'triple';

/**
 * Variant slot within a triple bundle. Maps fixedly to internal engines:
 *   slot 1 → NB Pro
 *   slot 2 → GPT Image 2 Full Medium
 *   slot 3 → GPT Image 2 Full High
 * For single bundles, slot is always 1 (NB Pro).
 *
 * Slot is internal. User-facing chip labels are landing-order based ("Take 1/2/3"),
 * NOT slot-based. Cover defaults pin to slot 3 (or highest succeeded slot).
 */
export type VariantSlot = 1 | 2 | 3;

export interface VariantConfig {
  slot: VariantSlot;
  provider: 'gemini' | 'openai';
  model: 'nano-banana-pro' | 'gpt-image-2';
  quality: 'standard' | 'medium' | 'high';
}

export const TRIPLE_VARIANTS: readonly VariantConfig[] = [
  { slot: 1, provider: 'gemini', model: 'nano-banana-pro', quality: 'standard' },
  { slot: 2, provider: 'openai', model: 'gpt-image-2', quality: 'medium' },
  { slot: 3, provider: 'openai', model: 'gpt-image-2', quality: 'high' },
] as const;

export const SINGLE_VARIANTS: readonly VariantConfig[] = [
  { slot: 1, provider: 'gemini', model: 'nano-banana-pro', quality: 'standard' },
] as const;

export function variantsForBundle(bundle: Bundle): readonly VariantConfig[] {
  return bundle === 'triple' ? TRIPLE_VARIANTS : SINGLE_VARIANTS;
}

export function creditsPerStyle(bundle: Bundle): number {
  return bundle === 'triple' ? 2 : 1;
}

export function maxStylesForBundle(bundle: Bundle): number {
  return bundle === 'triple' ? 3 : 10;
}
```

- [ ] **Step 2: Update `FREE_TRIAL_CREDITS` (or whatever the trial-credit constant is named) to 14**

Search the file for `15` near a credit-related identifier; if a `FREE_TRIAL_CREDITS` constant or similar exists, change `15` → `14`. If it doesn't exist as a constant, leave for Task F.1 (bonus mechanic) to address — `users.ts` may set it inline at signup.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS (the new types are pure additions; nothing breaks)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Bundle, VariantSlot, and bundle config helpers"
```

### Task A.2: Extend `BatchSubJob` to carry variants

**Files:**
- Modify: `src/lib/db/batch-jobs.ts`

The existing `BatchSubJob` represents one style. We need each style to carry up to 3 variant jobs. We extend `BatchSubJob` with a `variants[]` field rather than introducing a separate entity.

- [ ] **Step 1: Update `BatchSubJob` and `BatchJob` interfaces**

In `src/lib/db/batch-jobs.ts`, replace the existing `BatchSubJobStatus`, `BatchSubJob`, `BatchJob`, and `BatchJobInput` declarations with:

```ts
import type { Bundle, VariantSlot } from '@/types';

export type BatchSubJobStatus = 'pending' | 'running' | 'done' | 'error';
export type VariantStatus = 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';

export interface BatchVariant {
  slot: VariantSlot;
  jobId: string;                  // unique Lambda job id
  status: VariantStatus;
  stagedS3Key?: string;
  error?: string;
  retried?: boolean;              // true once silent retry has run
  conciergeNotes?: string[];
}

export interface BatchSubJob {
  /**
   * Style-level grouping. Holds one or more variants:
   *   single bundle → 1 variant (slot 1)
   *   triple bundle → 3 variants (slots 1, 2, 3)
   *
   * Style status is derived from variant statuses by consumers; persisted
   * `status` mirrors a coarse "any-running / all-terminal" state for the
   * existing batch progress API.
   */
  style: string;
  status: BatchSubJobStatus;
  variants: BatchVariant[];
  coverSlot?: VariantSlot;        // user-overridable cover; default rule applied at read time
  // Legacy single-style fields preserved for backwards-compat reads of
  // pre-bundle BatchJob records.
  jobId?: string;                 // DEPRECATED: use variants[0].jobId
  stagedS3Key?: string;           // DEPRECATED: use variants[0].stagedS3Key
  sessionId?: string;
  error?: string;
  conciergeNotes?: string[];
  stageCounted?: boolean;
  bonusTriggered?: boolean;
  bonusStageCount?: number;
}

export interface BatchJob {
  pk: string;
  sk: string;
  batchId: string;
  userId: string;
  bundle: Bundle;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
  /**
   * Per-style room analysis text, indexed by style. For triple mode, analysis
   * runs once per style at the API layer and is shared across the variants.
   * For single mode this map will be empty (analysis runs in the Lambda).
   */
  roomAnalysisByStyle?: Record<string, string>;
  /** Legacy field kept for reading old records that ran shared analysis once per batch. */
  roomAnalysis: string;
  subJobs: BatchSubJob[];
  total: number;       // total variants across all subJobs
  completed: number;   // variants in 'done' state
  failed: number;      // variants in 'failed_after_retry' state
  refundedCredits: number;
  createdAt: string;
  listingId?: string;
}

export interface BatchJobInput {
  userId: string;
  bundle: Bundle;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
  roomAnalysisByStyle?: Record<string, string>;
  styles: string[];
  listingId?: string;
}
```

- [ ] **Step 2: Update `createBatchJob` to build variants per style**

Replace the body of `createBatchJob` with:

```ts
import { variantsForBundle } from '@/types';

export async function createBatchJob(data: BatchJobInput): Promise<BatchJob> {
  const now = new Date();
  const batchId = ulid();
  const variantsConfig = variantsForBundle(data.bundle);

  const subJobs: BatchSubJob[] = data.styles.map((style) => {
    const variants: BatchVariant[] = variantsConfig.map((v) => ({
      slot: v.slot,
      jobId: ulid(),
      status: 'pending',
    }));
    return {
      style,
      status: 'pending',
      variants,
    };
  });

  const total = subJobs.reduce((sum, s) => sum + s.variants.length, 0);

  const item: BatchJob = {
    pk: `BATCH#${batchId}`,
    sk: 'META',
    batchId,
    userId: data.userId,
    bundle: data.bundle,
    heroS3Key: data.heroS3Key,
    referenceS3Keys: data.referenceS3Keys,
    roomTypes: data.roomTypes,
    notes: data.notes,
    ...(data.listingId ? { listingId: data.listingId } : {}),
    ...(data.roomAnalysisByStyle ? { roomAnalysisByStyle: data.roomAnalysisByStyle } : {}),
    roomAnalysis: '', // legacy field; per-style data lives in roomAnalysisByStyle
    subJobs,
    total,
    completed: 0,
    failed: 0,
    refundedCredits: 0,
    createdAt: now.toISOString(),
  };

  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}
```

- [ ] **Step 3: Update `getBatchJob` and any other helpers below this function** to handle the new shape — they should just pass data through (typed). Type-check will surface any miss. If any helper does `subJob.jobId` directly, refactor to walk `variants` first; fall back to legacy `jobId` only when `variants` is missing (legacy record).

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS — but expect callers (`/api/stage/batch`, `/api/jobs/batch`, the wizard, the gallery viewer, the listing page, the Lambda's progress writes) to flag type errors. Those are addressed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/batch-jobs.ts
git commit -m "feat(db): extend BatchJob to carry per-style variants for triple bundle"
```

Note: TypeScript will report errors in callers after this commit. That's expected — Phase B fixes them.

---

## Phase B — Backend (API + Lambda dispatch)

### Task B.1: Add bundle param + variant dispatch to `/api/stage/batch`

**Files:**
- Modify: `src/app/api/stage/batch/route.ts`

- [ ] **Step 1: Add `maxDuration = 60` and import the new helpers**

At the top, beside `export const dynamic = 'force-dynamic';`, add:

```ts
export const maxDuration = 60;
```

Add imports:

```ts
import { runAnalysis } from '@/lib/ai/run-analysis';
import {
  variantsForBundle,
  creditsPerStyle,
  maxStylesForBundle,
  type Bundle,
} from '@/types';
```

- [ ] **Step 2: Update the request body shape and validation**

Replace the existing body destructuring and validation block (lines ~22-57) with:

```ts
let body: {
  heroS3Key?: string;
  referenceS3Keys?: string[];
  roomTypes?: string[];
  styles?: string[];
  notes?: string;
  bundle?: Bundle;
  listingId?: string;
};
try {
  body = await req.json();
} catch {
  return NextResponse.json({ error: 'invalid json' }, { status: 400 });
}

const {
  heroS3Key,
  referenceS3Keys = [],
  roomTypes = [],
  styles = [],
  notes = '',
  bundle = 'triple',
} = body;

if (!heroS3Key) {
  return NextResponse.json({ error: 'heroS3Key required' }, { status: 400 });
}
if (bundle !== 'single' && bundle !== 'triple') {
  return NextResponse.json({ error: 'bundle must be single or triple' }, { status: 400 });
}

const access = assertKeysAccessible([heroS3Key, ...referenceS3Keys], session.user);
if (!access.ok) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

const maxStyles = maxStylesForBundle(bundle);
if (!Array.isArray(styles) || styles.length < 1 || styles.length > maxStyles) {
  return NextResponse.json(
    { error: `styles must be 1 to ${maxStyles} entries for bundle '${bundle}'` },
    { status: 400 },
  );
}
if (new Set(styles).size !== styles.length) {
  return NextResponse.json({ error: 'duplicate styles not allowed' }, { status: 400 });
}
for (const s of styles) {
  if (!VALID_STYLES.has(s)) {
    return NextResponse.json({ error: `unknown style: ${s}` }, { status: 400 });
  }
}
```

- [ ] **Step 3: Update credit deduction to use `creditsPerStyle`**

Replace the `deductCredits` call with:

```ts
const creditAction = bundle === 'triple' ? 'staging_triple' : 'staging_standard';
const creditCost = styles.length * creditsPerStyle(bundle);
const deductResult = await deductCredits(session.user.id, creditAction, creditCost);
if (!deductResult.success) {
  return NextResponse.json(
    { error: 'insufficient credits', creditsRemaining: deductResult.creditsRemaining },
    { status: 402 },
  );
}
```

(`staging_triple` is added to the union in Task F.2.)

- [ ] **Step 4: Run shared analysis for triple mode at the API layer**

Replace the comment block before `createBatchJob` and the `createBatchJob` call with:

```ts
const useOpus47 = true;

// Triple mode: run analysis ONCE per style at the API layer, share the
// roomAnalysis text across the 3 variant Lambdas. Mirrors /admin/compare's
// pattern. maxDuration=60 covers the wall-clock cost (parallel analyses).
//
// Single mode: keep today's behaviour — analysis runs inside the Lambda,
// roomAnalysisByStyle stays empty.
let roomAnalysisByStyle: Record<string, string> | undefined;
if (bundle === 'triple') {
  const analyses = await Promise.allSettled(
    styles.map((style) =>
      runAnalysis({
        heroS3Key,
        referenceS3Keys,
        roomTypes,
        style,
        notes,
        useOpus47: true,
      }),
    ),
  );
  roomAnalysisByStyle = {};
  styles.forEach((style, i) => {
    const r = analyses[i];
    roomAnalysisByStyle![style] = r.status === 'fulfilled' ? r.value.analysis : '';
  });
}

const batch = await createBatchJob({
  userId: session.user.id,
  bundle,
  heroS3Key,
  referenceS3Keys,
  roomTypes,
  notes,
  ...(roomAnalysisByStyle ? { roomAnalysisByStyle } : {}),
  styles,
  listingId,
});
```

- [ ] **Step 5: Replace the Lambda fan-out to dispatch one Lambda per variant**

Replace the existing `Promise.all(batch.subJobs.map(...))` block with:

```ts
const variantConfigs = variantsForBundle(bundle);

await Promise.all(
  batch.subJobs.flatMap((sub) =>
    sub.variants.map((variant) => {
      const cfg = variantConfigs.find((c) => c.slot === variant.slot)!;
      const sharedAnalysis = roomAnalysisByStyle?.[sub.style] ?? '';
      return invokeStagingWorker({
        jobId: variant.jobId,
        action: 'stage',
        batchId: batch.batchId,
        params: {
          userId: session.user.id,
          sessionId: variant.jobId,
          heroS3Key,
          referenceS3Keys,
          roomTypes,
          style: sub.style,
          notes,
          // Triple mode: pre-computed analysis. Single mode: empty → Lambda runs its own.
          roomAnalysis: sharedAnalysis,
          useOpus47,
          model: cfg.model,
          provider: cfg.provider,
          quality: cfg.quality,
          analysisMode: bundle === 'triple' ? 'full' : 'full',
          variantSlot: variant.slot,
          bundle,
          applyWatermark: !isAdmin,
          ...(listingId ? { listingId } : {}),
        },
      });
    }),
  ),
);
```

- [ ] **Step 6: Update the response payload shape**

Replace the `return NextResponse.json(...)` at the end with:

```ts
return NextResponse.json(
  {
    batchId: batch.batchId,
    bundle,
    subJobs: batch.subJobs.map((s) => ({
      style: s.style,
      variants: s.variants.map((v) => ({ slot: v.slot, jobId: v.jobId })),
    })),
  },
  { status: 202 },
);
```

- [ ] **Step 7: Type-check, build**

Run: `npm run type-check`
Run: `npm run build` (catches Amplify-style errors before deploy)
Expected: PASS for the route file. Other callers may still fail; subsequent tasks address them.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/stage/batch/route.ts
git commit -m "feat(api): bundle param + per-variant dispatch in /api/stage/batch"
```

### Task B.2: Update `/api/jobs/batch` to expose variant-aware status

**Files:**
- Modify: `src/app/api/jobs/batch/route.ts`

- [ ] **Step 1: Open and replace the response-shape construction**

The existing route maps `batch.subJobs` to a flat array. For variant-aware reads, expose variants under each style.

Replace the existing `subJobs = await Promise.all(...)` block and the `NextResponse.json(...)` call with:

```ts
const subJobs = await Promise.all(
  batch.subJobs.map(async (s) => {
    const variants = await Promise.all(
      (s.variants ?? []).map(async (v) => ({
        slot: v.slot,
        jobId: v.jobId,
        status: v.status,
        imageUrl: v.stagedS3Key ? await getSignedDownloadUrl(v.stagedS3Key) : undefined,
        s3Key: v.stagedS3Key,
        error: v.error,
        conciergeNotes: v.conciergeNotes ?? [],
      })),
    );

    // Legacy single-image record (no variants[]): synthesise one variant
    // from the deprecated top-level fields.
    if (variants.length === 0 && s.jobId) {
      variants.push({
        slot: 1,
        jobId: s.jobId,
        status: s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'pending',
        imageUrl: s.stagedS3Key ? await getSignedDownloadUrl(s.stagedS3Key) : undefined,
        s3Key: s.stagedS3Key,
        error: s.error,
        conciergeNotes: s.conciergeNotes ?? [],
      });
    }

    return {
      style: s.style,
      status: s.status,
      coverSlot: s.coverSlot ?? variants.find((v) => v.status === 'done')?.slot ?? 1,
      variants,
      bonusTriggered: s.bonusTriggered ?? false,
      bonusStageCount: s.bonusStageCount,
    };
  }),
);

const terminal = batch.completed + batch.failed === batch.total;
const allFailed = batch.failed === batch.total;

const heroImageUrl = batch.heroS3Key ? await getSignedDownloadUrl(batch.heroS3Key) : undefined;

let isFirstStage = false;
if (batch.completed > 0) {
  isFirstStage = await markFirstStage(session.user.id);
}

return NextResponse.json({
  batchId: batch.batchId,
  bundle: batch.bundle ?? 'single',
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

- [ ] **Step 2: Default-cover rule helper** — add a small helper that picks the cover slot per the spec:

Create `src/lib/staging/cover-slot.ts`:

```ts
import type { VariantSlot } from '@/types';

interface VariantStatus {
  slot: VariantSlot;
  status: 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';
}

/**
 * Default cover slot rule (per spec):
 *   - if slot 3 succeeded: 3
 *   - else if slot 2 succeeded: 2
 *   - else if slot 1 succeeded: 1
 *   - else: highest slot regardless of status (falls back to 3 / 2 / 1)
 *
 * Caller supplies an override (`coverSlot` set on the BatchSubJob); this
 * helper is only called when no override exists.
 */
export function defaultCoverSlot(variants: VariantStatus[]): VariantSlot {
  for (const slot of [3, 2, 1] as const) {
    const v = variants.find((x) => x.slot === slot);
    if (v && v.status === 'done') return slot as VariantSlot;
  }
  return (variants.find((v) => v.slot === 3) ? 3 : variants.find((v) => v.slot === 2) ? 2 : 1) as VariantSlot;
}
```

- [ ] **Step 3: Use the helper in the response builder above**

Replace the `coverSlot: s.coverSlot ?? ...` line with:

```ts
coverSlot: s.coverSlot ?? defaultCoverSlot(variants.map((v) => ({ slot: v.slot, status: v.status }))),
```

Add the import at the top of the file:

```ts
import { defaultCoverSlot } from '@/lib/staging/cover-slot';
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jobs/batch/route.ts src/lib/staging/cover-slot.ts
git commit -m "feat(api): variant-aware batch status with default cover-slot rule"
```

### Task B.3: Lambda — accept variant params and run silent retry-once

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

The Lambda already accepts `provider`, `quality`, `analysisMode`, `model` for `/admin/compare`. We extend it with `variantSlot` and `bundle`, and add silent retry-once on generation failure.

- [ ] **Step 1: Read the existing Lambda handler**

Read `lambda/staging-worker/index.mjs` end-to-end. Find the entry point (probably `export const handler` or a default export). Identify:
- where `params` is destructured
- where the generation call happens (NB Pro vs OpenAI branch)
- where success / failure writes back to the BatchJob's subJobs[i] state

- [ ] **Step 2: Accept and pass through `variantSlot` and `bundle`**

In the params destructuring, add `variantSlot` and `bundle` (both optional — old callers won't send them).

In the DDB writes that update batch progress, the variant-aware ones now need to update `batch.subJobs[styleIndex].variants[variantIndex]` instead of `batch.subJobs[i]`. The mapping is:
- find `subJob` where `subJob.style === params.style`
- find `variant` where `variant.jobId === params.jobId`

**Important:** the Lambda currently writes `subJobs[i].stagedS3Key`, `subJobs[i].status`, etc. directly. Change these to write through `subJobs[i].variants[j]` when the parent BatchJob has `bundle: 'triple'`. For backwards compatibility, when `bundle` is not present (legacy invocations), keep writing to the old top-level subJob fields — pre-existing batches must still work.

Concretely, replace the success-write block with:

```js
// Locate the sub-job and variant.
const styleIndex = batch.subJobs.findIndex((s) => s.style === params.style);
if (styleIndex < 0) {
  throw new Error(`style ${params.style} not in batch ${params.batchId}`);
}
const variantIndex = (batch.subJobs[styleIndex].variants ?? []).findIndex(
  (v) => v.jobId === params.jobId,
);

if (variantIndex >= 0) {
  // Variant-aware write.
  await dynamoDocClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${params.batchId}`, sk: 'META' },
    UpdateExpression: `
      SET subJobs[${styleIndex}].variants[${variantIndex}].status = :done,
          subJobs[${styleIndex}].variants[${variantIndex}].stagedS3Key = :s3,
          subJobs[${styleIndex}].variants[${variantIndex}].conciergeNotes = :notes,
          completed = completed + :one,
          updatedAt = :now
    `.trim().replace(/\s+/g, ' '),
    ExpressionAttributeValues: {
      ':done': 'done',
      ':s3': stagedS3Key,
      ':notes': conciergeNotes,
      ':one': 1,
      ':now': new Date().toISOString(),
    },
  }));
} else {
  // Legacy path: pre-bundle records. Keep today's writes.
  // [existing legacy write block goes here]
}
```

Apply the same shape to the failure write — but with a retry path inserted (next step).

- [ ] **Step 3: Add silent retry-once on generation failure**

Wrap the generation call in a retry-once loop. After the first failure, increment a `retried` flag on the variant and try again with the same params. If retry also fails, mark variant as `failed_after_retry`.

Sketch:

```js
async function generateOnce() {
  if (params.provider === 'openai') {
    return await stageRoomWithOpenAI({ /* ... */ });
  }
  return await stageRoomWithGemini({ /* ... */ });
}

let stagedBuffer;
let triedRetry = false;
try {
  stagedBuffer = await generateOnce();
} catch (firstErr) {
  console.warn(`[lambda] generation failed once for jobId=${params.jobId}, retrying…`, firstErr?.message);
  triedRetry = true;
  try {
    stagedBuffer = await generateOnce();
  } catch (secondErr) {
    // Mark variant terminally failed.
    await markVariantFailedAfterRetry({
      batchId: params.batchId,
      style: params.style,
      jobId: params.jobId,
      error: secondErr?.message ?? 'generation failed',
    });
    throw secondErr; // let Lambda terminate; per-variant failure is captured above
  }
}
```

Where `markVariantFailedAfterRetry` is a small helper that:
1. Locates the variant via the same `styleIndex` / `variantIndex` lookup.
2. Sets `variants[i].status = 'failed_after_retry'`, `variants[i].error = error`, `variants[i].retried = true`.
3. Increments `failed` on the BatchJob.

(Do not increment `completed` for failures.)

- [ ] **Step 4: Single-mode preservation**

Verify that when `bundle === 'single'` (or `bundle` is unset for legacy calls), the Lambda still:
- Runs its own `runAnalysis` if `roomAnalysis` is empty (today's behaviour for the production batch flow).
- Writes through the new variant path (single bundles still have `variants[0]`) so the read API works uniformly.

When `bundle === 'triple'`, the Lambda receives a non-empty `roomAnalysis` from the API and **skips** its own analysis call.

- [ ] **Step 5: Sync the bundled bonus-credit logic for now**

Leave today's bonus-on-completion logic in place inside the Lambda for this task — Phase F replaces it with API-layer per-credit-spent counting.

- [ ] **Step 6: Build the Lambda for Linux x64 and zip**

Per CLAUDE.md "Deploying the staging-worker Lambda" — install deps with `--os=linux --cpu=x64 --libc=glibc`, then zip via PowerShell long-path command, then upload via `aws lambda update-function-code`.

```bash
cd lambda/staging-worker && rm -rf node_modules package-lock.json && \
  npm install --omit=dev --include=optional --os=linux --cpu=x64 --libc=glibc
ls node_modules/sharp/ node_modules/@img/sharp-linux-x64/ # verify both exist
```

- [ ] **Step 7: Zip via PowerShell long-path safe command**

(Copy from CLAUDE.md "Deploying the staging-worker Lambda" — the `powershell.exe -NoProfile -Command "Add-Type ..."` invocation that uses `[System.IO.Compression.ZipFile]::CreateFromDirectory` with `\\?\` paths.)

- [ ] **Step 8: Upload and verify**

```bash
cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2

aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
# Wait for: LastUpdateStatus=Successful, State=Active
```

- [ ] **Step 9: Commit (Lambda source only — the zip is build artefact)**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): variant-aware writes + silent retry-once for triple bundle"
```

### Task B.4: Server-driven partial refund

**Files:**
- Create: `src/lib/credits/refund.ts`
- Modify: `src/lib/db/users.ts` (add `staging_partial_refund` action)
- Modify: a hook point that fires when a batch reaches terminal state — likely in `/api/jobs/batch` (read path) or a Lambda-side completion callback

- [ ] **Step 1: Add the new credit action to `users.ts`**

Find the `deductCredits` function (and any sibling `addCredits` / `applyCreditAction` style helper). Extend the action enum to include `staging_partial_refund`. Refund actions should ADD credits, not deduct.

If there's a single function that handles both deduct and refund, ensure it switches on action. If there's no refund helper, add one:

```ts
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export type RefundAction = 'staging_partial_refund';

/**
 * Idempotent partial refund. Caller supplies a unique `idempotencyKey`
 * (typically the batchId). If the same key is replayed, no double-refund.
 */
export async function refundCredits(params: {
  userId: string;
  amount: number;
  action: RefundAction;
  idempotencyKey: string;
}): Promise<{ success: boolean; creditsRemaining?: number }> {
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :amt SET refundedKeys.#k = :true, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(refundedKeys) OR attribute_not_exists(refundedKeys.#k)',
      ExpressionAttributeNames: { '#k': params.idempotencyKey },
      ExpressionAttributeValues: {
        ':amt': params.amount,
        ':true': true,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    return {
      success: true,
      creditsRemaining: (res.Attributes?.creditsRemaining as number) ?? undefined,
    };
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      // Already refunded for this key — idempotent no-op.
      return { success: true };
    }
    throw e;
  }
}
```

(If `refundedKeys` is a new attribute on the user record, that's fine — DDB tolerates new attributes without migration. The `attribute_not_exists` check on the map path correctly handles a missing parent.)

- [ ] **Step 2: Create the partial-refund logic at terminal state**

Create `src/lib/credits/partial-refund.ts`:

```ts
import { refundCredits } from '@/lib/db/users';
import type { BatchJob } from '@/lib/db/batch-jobs';

/**
 * Walk a terminal BatchJob and issue a partial refund for any style where
 * 1 or 2 of 3 variants succeeded. Idempotent on (batchId, style).
 *
 * Refund table (per spec):
 *   3/3 succeed: 0 refund
 *   2/3 succeed: +1 credit
 *   1/3 succeed: +1 credit
 *   0/3 succeed: handled by existing batch-error path, NOT this helper.
 */
export async function applyPartialRefundsForBatch(batch: BatchJob): Promise<number> {
  if (batch.bundle !== 'triple') return 0;

  let totalRefunded = 0;
  for (const sub of batch.subJobs) {
    const variants = sub.variants ?? [];
    const succeeded = variants.filter((v) => v.status === 'done').length;
    const failed = variants.filter((v) => v.status === 'failed_after_retry').length;

    // Only consider terminal styles.
    if (succeeded + failed < variants.length) continue;
    // 0/3 succeeded → existing batch error path handles it.
    if (succeeded === 0) continue;
    // 3/3 succeeded → no refund.
    if (succeeded === 3) continue;

    const result = await refundCredits({
      userId: batch.userId,
      amount: 1,
      action: 'staging_partial_refund',
      idempotencyKey: `${batch.batchId}:${sub.style}`,
    });
    if (result.success) totalRefunded += 1;
  }
  return totalRefunded;
}
```

- [ ] **Step 3: Wire the helper into terminal batch detection**

In `/api/jobs/batch/route.ts`, after determining `terminal`, call `applyPartialRefundsForBatch(batch)` and add the returned count to `batch.refundedCredits` via a DDB update. The helper is idempotent so polling doesn't double-refund.

```ts
// After: const terminal = batch.completed + batch.failed === batch.total;
if (terminal && batch.bundle === 'triple') {
  const newlyRefunded = await applyPartialRefundsForBatch(batch);
  if (newlyRefunded > 0) {
    // Persist on the BatchJob for client display.
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batch.batchId}`, sk: 'META' },
      UpdateExpression: 'ADD refundedCredits :n SET updatedAt = :now',
      ExpressionAttributeValues: {
        ':n': newlyRefunded,
        ':now': new Date().toISOString(),
      },
    }));
    batch.refundedCredits += newlyRefunded;
  }
}
```

(Add the `dynamodb`, `UpdateCommand`, `TABLE_NAME` imports if not already present.)

- [ ] **Step 4: Type-check, build**

Run: `npm run type-check && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/users.ts src/lib/credits/partial-refund.ts src/app/api/jobs/batch/route.ts
git commit -m "feat(credits): partial refund on per-variant failure (idempotent)"
```

---

## Phase C — Wizard

### Task C.1: Add Take Count step component

**Files:**
- Create: `src/components/staging/take-count-step.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import type { Bundle } from '@/types';
import { cn } from '@/lib/utils/cn';

interface TakeCountStepProps {
  value: Bundle;
  onChange: (next: Bundle) => void;
}

export function TakeCountStep({ value, onChange }: TakeCountStepProps) {
  return (
    <div className="space-y-3">
      <Card
        selected={value === 'triple'}
        recommended
        title="Three Takes per style"
        body="3 versions of every chosen style. Keep all of them."
        meta="2 credits per style · 3 for the price of 2"
        onClick={() => onChange('triple')}
      />
      <Card
        selected={value === 'single'}
        title="Single Take per style"
        body="One version per style."
        meta="1 credit per style"
        onClick={() => onChange('single')}
      />
    </div>
  );
}

interface CardProps {
  selected: boolean;
  recommended?: boolean;
  title: string;
  body: string;
  meta: string;
  onClick: () => void;
}

function Card({ selected, recommended, title, body, meta, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-5 transition-all',
        selected
          ? 'border-brand-teal bg-brand-teal/[0.06] text-brand-navy'
          : 'border-brand-navy/15 bg-white hover:border-brand-navy/30',
      )}
    >
      {recommended && (
        <p className="text-xs font-bold tracking-wider uppercase text-brand-teal mb-1">
          ★ Recommended
        </p>
      )}
      <p className="font-heading text-2xl text-brand-navy">{title}</p>
      <p className="mt-2 text-base text-brand-navy/80">{body}</p>
      <p className="mt-3 text-sm font-semibold text-brand-navy/70">{meta}</p>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/take-count-step.tsx
git commit -m "feat(staging): TakeCountStep component for bundle choice"
```

### Task C.2: Wire Take Count into the wizard

**Files:**
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 1: Add bundle state**

Near the other `useState` calls, add:

```tsx
import { type Bundle, creditsPerStyle, maxStylesForBundle } from '@/types';
import { TakeCountStep } from '@/components/staging/take-count-step';

// inside the component:
const [bundle, setBundle] = useState<Bundle>('triple');
```

- [ ] **Step 2: Insert the step into the existing step navigation**

This file is large; follow the existing pattern for steps. The new step sits between Room Types and Styles. Add a step entry that renders `<TakeCountStep value={bundle} onChange={setBundle} />` and a Continue button. Add a "Back" affordance to the Styles step that returns here.

If the file uses an enum or string union for the current step, add `'take-count'` to it. The wizard's progress / step navigation arithmetic must update accordingly (number of steps changes from 5 → 6 — verify any percentage / count UI).

- [ ] **Step 3: Style-cap and credit math in the styles step**

Find the existing cap of 10 (around `styles.length >= 10` per Grep — `src/app/stage/page.tsx:748`). Replace literal `10` with `maxStylesForBundle(bundle)`.

The "5 of 10 selected · 5 credits" line: replace the credit count with `styles.length * creditsPerStyle(bundle)` and the "of 10" with `of ${maxStylesForBundle(bundle)}`.

The per-card "+1 credit" pill: each style card needs a small pill in its top-right corner showing `+${creditsPerStyle(bundle)}`. If the cards live in `StyleRow`, pass `bundle` (or `creditCost`) as a prop.

- [ ] **Step 4: Bundle-switch trim warning**

When the user navigates back to step 3 and switches bundle while exceeding the new cap, show a banner above the styles list. After the styles step's existing JSX, insert:

```tsx
{styles.length > maxStylesForBundle(bundle) && (
  <div className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-900">
    <p className="font-semibold">
      Triple Takes max {maxStylesForBundle(bundle)} styles.
    </p>
    <p className="text-sm">
      Pick the {maxStylesForBundle(bundle)} you want most before continuing.
    </p>
  </div>
)}
```

The "Continue" button at the end of the styles step must disable when `styles.length > maxStylesForBundle(bundle)`. Find the existing disable condition and `||` this in.

- [ ] **Step 5: Submit CTA copy**

The submit button currently shows something like *"Stage 5 styles"*. Replace with bundle-aware copy:

```tsx
const totalCredits = styles.length * creditsPerStyle(bundle);
const totalVersions = styles.length * (bundle === 'triple' ? 3 : 1);
const submitLabel =
  bundle === 'triple'
    ? `Stage ${styles.length} ${styles.length === 1 ? 'room' : 'rooms'} · ${totalCredits} credits · ${totalVersions} versions`
    : `Stage ${styles.length} ${styles.length === 1 ? 'room' : 'rooms'} · ${totalCredits} credits`;
```

Pass `submitLabel` to the existing CTA.

- [ ] **Step 6: Send `bundle` in the POST body**

Find the `fetch('/api/stage/batch', ...)` (or wherever the wizard POSTs). Add `bundle` to the JSON body:

```ts
body: JSON.stringify({
  heroS3Key,
  referenceS3Keys,
  roomTypes,
  styles,
  notes,
  bundle,
  ...(listingId ? { listingId } : {}),
}),
```

- [ ] **Step 7: No-credits gate update**

The current client-side credit gate (per credit-UX-defence memory) compares `userCredits` to `styles.length`. Update the comparison:

```tsx
const requiredCredits = styles.length * creditsPerStyle(bundle);
const insufficientCredits = userCredits < requiredCredits;
```

Use `requiredCredits` and `insufficientCredits` everywhere the existing gate logic uses the old comparison.

- [ ] **Step 8: Single-style routing consolidation**

Per spec open item #7 — `src/app/stage/page.tsx:478` branches on `styles.length === 1`. With Triple Takes, a 1-style triple bundle is still a 3-variant set. Route everything through `/api/stage/batch`; remove the single-style branch that calls `/api/stage`.

Find the `if (styles.length === 1) {` branch and delete it. The unconditional code path that calls `/api/stage/batch` remains.

(`/api/stage` may still be hit by other callers — leave the route file in place but stop using it from the wizard. A cleanup task to delete the unused route file is **out of scope** for this plan.)

- [ ] **Step 9: Type-check, build**

Run: `npm run type-check && npm run build`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/app/stage/page.tsx src/components/staging/style-row.tsx
git commit -m "feat(stage): Take Count step + bundle-aware credit math + cap"
```

---

## Phase D — Reveal & viewer (VariantCarousel)

### Task D.1: Build the VariantCarousel component

**Files:**
- Create: `src/components/staging/variant-carousel.tsx`

This is the workhorse of the feature — used by the reveal ceremony, the gallery viewer, and the listing detail. Same component, three callers.

- [ ] **Step 1: Build the component**

```tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { cn } from '@/lib/utils/cn';
import type { VariantSlot } from '@/types';

export interface CarouselVariant {
  slot: VariantSlot;
  status: 'pending' | 'running' | 'done' | 'error' | 'failed_after_retry';
  imageUrl?: string;
  arrivedAt?: number; // ms epoch — used to compute "Take 1/2/3" landing-order labels
}

interface VariantCarouselProps {
  heroImageUrl?: string;
  variants: CarouselVariant[];
  initialSlot?: VariantSlot;
  coverSlot?: VariantSlot;
  onCoverChange?: (slot: VariantSlot) => void;
  /** When true, show the slider/compare view; otherwise render the after image full-bleed. */
  compareMode: boolean;
  onCompareModeChange?: (next: boolean) => void;
  className?: string;
}

/**
 * Persistent-slider carousel: one BeforeAfterSlider stays mounted; chips
 * select which variant is the "after" image. Slider drag position is shared
 * across variants by lifting the slider's `position` to local state and
 * passing it through.
 */
export function VariantCarousel({
  heroImageUrl,
  variants,
  initialSlot,
  coverSlot,
  onCoverChange,
  compareMode,
  onCompareModeChange,
  className,
}: VariantCarouselProps) {
  // Variants with images, in landing order (arrivedAt asc).
  const arrived = useMemo(
    () => variants.filter((v) => v.status === 'done' && v.imageUrl).sort(
      (a, b) => (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0),
    ),
    [variants],
  );

  const [activeSlot, setActiveSlot] = useState<VariantSlot | undefined>(
    initialSlot ?? arrived[0]?.slot,
  );

  // If the active variant disappears (e.g. variants list updates), fall back to first arrived.
  useEffect(() => {
    if (!arrived.find((v) => v.slot === activeSlot)) {
      setActiveSlot(arrived[0]?.slot);
    }
  }, [arrived, activeSlot]);

  // Slider drag position (0–1). Lifted to share across variants.
  const [sliderPos, setSliderPos] = useState(0.5);

  const active = arrived.find((v) => v.slot === activeSlot);

  return (
    <div className={cn('w-full', className)}>
      <div className="relative aspect-video bg-brand-navy/5 rounded-xl overflow-hidden">
        {compareMode && active?.imageUrl && heroImageUrl ? (
          <BeforeAfterSlider
            beforeSrc={heroImageUrl}
            afterSrc={active.imageUrl}
            beforeLabel="Original"
            afterLabel="Staged"
            position={sliderPos}
            onPositionChange={setSliderPos}
            className="h-full w-full"
          />
        ) : active?.imageUrl ? (
          <AnimatePresence mode="wait">
            <motion.img
              key={active.slot}
              src={active.imageUrl}
              alt={`Take with slot ${active.slot}`}
              className="h-full w-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          </AnimatePresence>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-brand-navy/40 text-sm">
            Generating…
          </div>
        )}
      </div>

      {/* Chip strip — only shown when there's more than one expected variant */}
      {variants.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          {[...variants]
            // Sort chips by landing order: arrived first, then pending.
            .sort((a, b) => {
              const aArrived = a.status === 'done';
              const bArrived = b.status === 'done';
              if (aArrived && bArrived) return (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0);
              if (aArrived) return -1;
              if (bArrived) return 1;
              return a.slot - b.slot;
            })
            .filter((v) => v.status !== 'failed_after_retry') // missing variants don't show
            .map((v, idx) => {
              const isActive = v.slot === activeSlot;
              const isCover = coverSlot === v.slot;
              const label = `Take ${idx + 1}`;
              return (
                <ChipButton
                  key={v.slot}
                  active={isActive}
                  cover={isCover}
                  label={label}
                  imageUrl={v.imageUrl}
                  pending={v.status !== 'done'}
                  onClick={() => v.status === 'done' && setActiveSlot(v.slot)}
                  onCoverToggle={
                    onCoverChange && v.status === 'done'
                      ? () => onCoverChange(v.slot)
                      : undefined
                  }
                />
              );
            })}
        </div>
      )}

      {/* Compare toggle */}
      {onCompareModeChange && (
        <button
          type="button"
          onClick={() => onCompareModeChange(!compareMode)}
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-navy"
        >
          {compareMode ? 'Exit comparison' : 'Compare with original'}
        </button>
      )}
    </div>
  );
}

interface ChipButtonProps {
  active: boolean;
  cover: boolean;
  label: string;
  imageUrl?: string;
  pending: boolean;
  onClick: () => void;
  onCoverToggle?: () => void;
}

function ChipButton({ active, cover, label, imageUrl, pending, onClick, onCoverToggle }: ChipButtonProps) {
  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={onClick}
        layout
        initial={pending ? { opacity: 0.5 } : { opacity: 1 }}
        animate={{ opacity: pending ? 0.5 : 1, scale: 1 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'h-16 w-20 rounded-lg overflow-hidden border-2 transition-all',
          active ? 'border-brand-teal' : 'border-transparent',
          pending && 'animate-pulse bg-brand-navy/10',
        )}
        aria-label={`${label} ${active ? '(active)' : ''}`}
      >
        {imageUrl && !pending ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : null}
      </motion.button>
      <p className="mt-1 text-center text-xs font-semibold text-brand-navy">{label}</p>
      {onCoverToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCoverToggle();
          }}
          aria-label={cover ? 'Remove as cover' : 'Set as cover'}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-white shadow-sm flex items-center justify-center"
        >
          <span className={cn('text-xs', cover ? 'text-brand-teal' : 'text-brand-navy/30')}>★</span>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Confirm `BeforeAfterSlider` accepts `position` and `onPositionChange`**

Open `src/components/comparison/before-after-slider.tsx`. If those props don't exist, add them:

- Accept optional `position?: number` (0–1) and `onPositionChange?: (next: number) => void`.
- Use the prop if provided as a controlled state; fall back to internal state otherwise.

This change is non-breaking for existing callers (today they don't pass `position`).

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/staging/variant-carousel.tsx src/components/comparison/before-after-slider.tsx
git commit -m "feat(staging): VariantCarousel — persistent slider + chip strip"
```

### Task D.2: Wire VariantCarousel into the reveal ceremony

**Files:**
- Modify: `src/app/stage/batch/[batchId]/page.tsx` (or wherever the batch reveal renders per-style cards)
- Modify: `src/components/staging/staging-loader.tsx` (bundle-aware copy)

- [ ] **Step 1: Find the per-style reveal card render**

Search for the component that renders one style's reveal in the batch ceremony. Each card today shows a `BeforeAfterSlider`. Replace that with `VariantCarousel` driven by the variant data from `/api/jobs/batch`.

The poll response now returns `subJobs[].variants[]`. Map each style's variants to `CarouselVariant[]`:

```tsx
const carouselVariants: CarouselVariant[] = sub.variants.map((v) => ({
  slot: v.slot,
  status: v.status,
  imageUrl: v.imageUrl,
  // arrivedAt is approximated client-side by tracking when each variant
  // first transitioned to 'done'. Maintain a Map<slot, ms> in component
  // state and update it on each poll tick.
  arrivedAt: arrivedAtBySlot[v.slot],
}));

<VariantCarousel
  heroImageUrl={heroImageUrl}
  variants={carouselVariants}
  coverSlot={sub.coverSlot}
  onCoverChange={(slot) => setCoverForStyle(sub.style, slot)}
  compareMode={compareMode}
  onCompareModeChange={setCompareMode}
/>
```

- [ ] **Step 2: Cover-change persistence**

`setCoverForStyle` calls a new endpoint `PATCH /api/jobs/batch/cover` (or extends the batch route) that updates `subJobs[styleIndex].coverSlot` on the BatchJob. The mutation pattern is the same as other DDB updates — find the index of the matching style and write `subJobs[i].coverSlot`.

Sketch the route in `src/app/api/jobs/batch/cover/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getSession } from '@/lib/auth/session';
import { getBatchJob } from '@/lib/db/batch-jobs';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { VariantSlot } from '@/types';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json()) as { batchId?: string; style?: string; slot?: VariantSlot };
  if (!body.batchId || !body.style || !body.slot) {
    return NextResponse.json({ error: 'batchId, style, slot required' }, { status: 400 });
  }

  const batch = await getBatchJob(body.batchId);
  if (!batch || batch.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const styleIndex = batch.subJobs.findIndex((s) => s.style === body.style);
  if (styleIndex < 0) {
    return NextResponse.json({ error: 'unknown style' }, { status: 400 });
  }

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${body.batchId}`, sk: 'META' },
    UpdateExpression: `SET subJobs[${styleIndex}].coverSlot = :slot, updatedAt = :now`,
    ExpressionAttributeValues: {
      ':slot': body.slot,
      ':now': new Date().toISOString(),
    },
  }));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Bundle-aware loader copy**

In `src/components/staging/staging-loader.tsx`, find the per-style line. Replace with bundle branching:

```tsx
const subline = bundle === 'triple' ? '30–60 seconds' : 'usually under 30 seconds';
// ...
<p className="text-sm text-brand-navy/70">Creating your {bundle === 'triple' ? 'three takes' : 'staging'} of {style}…</p>
<p className="text-xs text-brand-navy/50">{subline}</p>
```

The loader needs the `bundle` value — pass it through from the batch record (the loader fetches batch data already to render style names; just include the bundle).

- [ ] **Step 4: Refunded credits surface**

When the batch is terminal and `refundedCredits > 0`, surface a per-style line on each affected style's reveal card:

```tsx
{sub.variants.some((v) => v.status === 'failed_after_retry') && (
  <p className="mt-2 text-xs text-brand-teal">
    +1 credit refunded — Take {missingTakeNumber} didn&apos;t come through this time.
  </p>
)}
```

(`missingTakeNumber` is the chip label of the missing variant — derive from landing order; for purposes of this surface text, just display "this time" without specifying which take, since the missing chip is already absent from the strip.)

Actually — simpler:

```tsx
{sub.variants.some((v) => v.status === 'failed_after_retry') && (
  <p className="mt-2 text-xs text-brand-teal">
    +1 credit refunded — one of the takes didn&apos;t come through this time.
  </p>
)}
```

- [ ] **Step 5: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/app/stage/batch src/components/staging/staging-loader.tsx src/app/api/jobs/batch/cover
git commit -m "feat(reveal): VariantCarousel + cover-swap endpoint + bundle loader copy"
```

### Task D.3: Wire VariantCarousel into the gallery viewer

**Files:**
- Modify: `src/components/dashboard/gallery-viewer.tsx`

- [ ] **Step 1: Detect set vs single image**

The gallery viewer today operates on a single staged image (`upload.heroUrl`, `upload.totalVariants`, etc.). When the upload represents a set (triple bundle, multiple variants), pass them to `VariantCarousel`.

Read the existing `GalleryViewerProps` and `upload` type. If `upload.variants` is already populated when triple bundles exist, use that. If not, extend the type so the dashboard query that builds `upload` includes `variants[]` for triple sets.

- [ ] **Step 2: Replace the single-image path**

Today's compare-mode block (around lines 290-301 per the earlier grep) renders a `BeforeAfterSlider`. Replace with:

```tsx
{current && upload?.heroUrl ? (
  <VariantCarousel
    heroImageUrl={upload.heroUrl}
    variants={current.variants ?? [{
      slot: 1,
      status: 'done',
      imageUrl: current.imageUrl,
      arrivedAt: 0,
    }]}
    coverSlot={current.coverSlot}
    onCoverChange={(slot) => onCoverChange?.(current.id, slot)}
    compareMode={compareMode}
    onCompareModeChange={setCompareMode}
  />
) : null}
```

Note: when `current.variants` is undefined or single (legacy / single bundle), the carousel renders one image with no chip strip (gracefully degrades — chip strip is conditional on `variants.length > 1`).

- [ ] **Step 3: Add `onCoverChange` to GalleryViewerProps and wire from the dashboard caller**

Bubble the callback up to the dashboard component that renders the gallery. The callback hits a new endpoint `PATCH /api/stagings/:id/cover` (or reuses `/api/jobs/batch/cover` if the viewer holds the batchId — likely a separate endpoint since gallery items aren't necessarily batch-bound).

If gallery items live in their own DDB entity (search for the staging-list helper, likely `staging-jobs.ts` or `stagings.ts`), add a `coverSlot` field there too, and the endpoint just updates that field.

- [ ] **Step 4: Outer tile-swap unchanged**

Verify the existing `drag={compareMode ? false : 'x'}` swipe-between-items behaviour continues to work — chip taps are explicit click targets and don't conflict with drag.

- [ ] **Step 5: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/gallery-viewer.tsx src/app/api/stagings
git commit -m "feat(gallery): VariantCarousel in gallery viewer + cover-swap endpoint"
```

### Task D.4: Wire VariantCarousel into listing detail

**Files:**
- Modify: `src/app/listings/[id]/page.tsx` (and any sub-components it uses for the strip)

- [ ] **Step 1: Strip — show "3 takes" pill on triple sets**

Find the strip-tile component for the listing. Add a `bundle` field to whatever data the strip receives from the listing query. When `bundle === 'triple'` (or `variants.length > 1`), render a small pill:

```tsx
{bundle === 'triple' && (
  <span className="absolute top-2 right-2 bg-brand-navy/80 text-white text-xs font-bold px-2 py-1 rounded-full">
    3 takes
  </span>
)}
```

- [ ] **Step 2: Tile tap opens VariantCarousel viewer**

The listing detail tile likely already opens a viewer overlay. Reuse the gallery viewer (which now supports VariantCarousel after Task D.3) — same component.

- [ ] **Step 3: Listing thumbnail uses cover variant**

The listing query that selects a thumbnail today picks `coverS3Key` from the most recent stage. Update to:
- if the most recent set is triple: pick the variant at the user's chosen `coverSlot` (or default-cover-slot rule).
- if single: today's behaviour unchanged.

This logic likely lives in `src/lib/db/listings.ts` near `coverS3Key` resolution. Walk the most recent set's variants, find the one matching `coverSlot`, and use its S3 key.

- [ ] **Step 4: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/app/listings src/lib/db/listings.ts
git commit -m "feat(listings): variant-aware strip tiles + cover-aware listing thumbnail"
```

---

## Phase E — Sharing & export

### Task E.1: Share whichever variant is currently in the slider

**Files:**
- Modify: existing share/export action (search for "share", "export", or "download" near the reveal ceremony — likely in `src/components/staging/`)

- [ ] **Step 1: Pass the active variant's S3 key to the share action**

The share action today takes one S3 key. With the carousel, the action needs to know which variant chip is currently selected. Lift the `activeSlot` state from `VariantCarousel` to its parent, or expose it via a callback prop:

```tsx
<VariantCarousel
  // ...existing props
  activeSlot={activeSlot}
  onActiveSlotChange={setActiveSlot}
/>
```

(Add `activeSlot` as a controlled prop on `VariantCarousel`. If unset, the component falls back to internal state — non-breaking.)

The share button's `onClick` reads `activeSlot` and looks up the corresponding variant's `imageUrl` / `s3Key`.

- [ ] **Step 2: No "share all 3" affordance**

Per spec: v1 ships with single-image share only. Don't add any grid-export / multi-share UI.

- [ ] **Step 3: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/staging src/components/comparison
git commit -m "feat(share): export uses currently-selected carousel variant"
```

---

## Phase F — Bonus credit mechanic

The shift is from "increment on stage completion (Lambda)" to "increment on credit deduction (API)." This affects two files in lockstep: `src/lib/db/bonus-credit.ts` (the API-side helpers) and `lambda/staging-worker/index.mjs` (the inline copy). The Lambda's bonus path is **removed**.

### Task F.1: Rename counters and refactor `bonus-credit.ts`

**Files:**
- Modify: `src/lib/db/bonus-credit.ts`
- Modify: `src/lib/db/users.ts` (rename fields in user record)

- [ ] **Step 1: Rename fields in the User type**

In `src/lib/db/users.ts` (or wherever `User`/profile types live), rename:
- `stagesCompletedTotal` → `creditsSpentTotal`
- `lastBonusStageCount` → `lastBonusCreditCount`

These are persisted DDB attributes. **Migration approach:** read both old and new attribute names; write only new. Existing users keep functioning, and on their next credit deduction the counter rolls forward.

```ts
// In the function that loads a user profile from DDB:
const creditsSpentTotal =
  (item.creditsSpentTotal as number) ?? (item.stagesCompletedTotal as number) ?? 0;
const lastBonusCreditCount =
  (item.lastBonusCreditCount as number) ?? (item.lastBonusStageCount as number) ?? 0;
```

- [ ] **Step 2: Rewrite `bonus-credit.ts` to count per credit spent**

Replace `recordSingleStageCompletion` and `recordBatchSubJobCompletion` with one helper that runs at credit-deduction time:

```ts
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

const BONUS_EVERY = 7;

type Result =
  | { bonusGranted: false }
  | { bonusGranted: true; newCreditCount: number; newCreditsRemaining: number };

/**
 * Increment creditsSpentTotal by `amount` and grant bonus credits for every
 * 7-credit boundary crossed inside that increment. Atomic via DDB.
 *
 * Refunded credits are NOT decremented from the counter — they continue to
 * count toward bonus eligibility (per spec: refunds happen because the
 * variant didn't deliver, but the user's spend was real).
 *
 * Idempotent on `idempotencyKey` — callers pass the batchId or jobId so a
 * retry of the same logical deduction doesn't double-increment.
 */
export async function recordCreditSpend(params: {
  userId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<Result> {
  // Guard against double-increment on the same logical event.
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET creditSpendKeys.#k = :true, updatedAt = :now',
      ConditionExpression:
        '(#plan <> :admin) AND (attribute_not_exists(creditSpendKeys) OR attribute_not_exists(creditSpendKeys.#k))',
      ExpressionAttributeNames: { '#k': params.idempotencyKey, '#plan': 'plan' },
      ExpressionAttributeValues: { ':true': true, ':now': new Date().toISOString(), ':admin': 'admin' },
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  // Increment the counter.
  let newCount: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD creditsSpentTotal :amt SET updatedAt = :now',
      ExpressionAttributeValues: { ':amt': params.amount, ':now': new Date().toISOString() },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCount = (res.Attributes?.creditsSpentTotal as number) ?? 0;
  } catch (e) {
    throw e;
  }

  // Did we cross a 7-boundary?
  const oldCount = newCount - params.amount;
  const oldBonusBucket = Math.floor(oldCount / BONUS_EVERY);
  const newBonusBucket = Math.floor(newCount / BONUS_EVERY);
  const bonusToGrant = Math.max(0, newBonusBucket - oldBonusBucket);
  if (bonusToGrant === 0) return { bonusGranted: false };

  // Grant the bonus credit(s) — exactly-once via lastBonusCreditCount guard.
  const targetBonusCount = newBonusBucket * BONUS_EVERY;
  let newCreditsRemaining: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${params.userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :amt SET lastBonusCreditCount = :target, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(lastBonusCreditCount) OR lastBonusCreditCount < :target',
      ExpressionAttributeValues: {
        ':amt': bonusToGrant,
        ':target': targetBonusCount,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCreditsRemaining = (res.Attributes?.creditsRemaining as number) ?? 0;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  return {
    bonusGranted: true,
    newCreditCount: newCount,
    newCreditsRemaining,
  };
}

// REMOVED: recordSingleStageCompletion, recordBatchSubJobCompletion.
// Bonus is now granted at credit-deduction time, not stage-completion time.
```

- [ ] **Step 3: Wire `recordCreditSpend` into the deduction flow**

In `users.ts`'s `deductCredits` (where credits are subtracted), after a successful deduction call `recordCreditSpend({ userId, amount, idempotencyKey: <caller-supplied> })`. The deduction function may need to accept `idempotencyKey` as a new param.

- [ ] **Step 4: Remove the Lambda's bonus logic**

In `lambda/staging-worker/index.mjs`, find the inline copy of the bonus-credit logic (look for `BONUS_EVERY`, `lastBonusStageCount`, `stagesCompletedTotal`). Delete the function and any calls to it. The Lambda no longer touches bonus state.

(Re-deploy the Lambda after this change — Phase B already establishes the deploy pipeline.)

- [ ] **Step 5: Update copy across surfaces**

Replace *"every 7 stages"* with *"every 7 you spend"* in:
- `src/components/landing/hero.tsx` (lines ~49 and ~73 per the earlier grep)
- Any onboarding screen mentioning the rule (`src/app/onboarding/...`)
- Dashboard credit panel (`src/app/dashboard/page.tsx`)
- Footer (`src/components/landing/footer.tsx`)
- Pricing FAQ (`src/components/landing/faq.tsx`)
- Any auth/welcome emails (search `templates/` or `lib/email/`)

Search: `grep -rn "every 7 stages" src/` then `grep -rn "every seven stages" src/` and update each hit.

- [ ] **Step 6: Build, deploy Lambda, deploy Next.js**

Run: `npm run build` (catches Amplify errors)

Re-zip and upload Lambda per Phase B.3 Step 6-8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/bonus-credit.ts src/lib/db/users.ts lambda/staging-worker/index.mjs src/components/landing src/components src/app
git commit -m "refactor(bonus): per-credit-spent counting at API layer; remove Lambda bonus path"
```

### Task F.2: Add `staging_triple` credit action and bump trial to 14

**Files:**
- Modify: `src/lib/db/users.ts`
- Modify: any signup flow that sets initial credits (likely `src/app/api/auth/signup/route.ts`)

- [ ] **Step 1: Add `staging_triple` to the deduct action union**

Find the `CreditAction` union (or similar) in `users.ts`. Add `'staging_triple'`. The deduction logic itself is action-agnostic (just subtracts `amount`); the action name is for telemetry / billing logs.

- [ ] **Step 2: Set initial credits to 14**

In the signup route, find where `creditsRemaining` is set on the new user record. Change `15` → `14`.

If there's a constant `INITIAL_CREDITS` or `FREE_TRIAL_CREDITS`, change there.

- [ ] **Step 3: Update copy**

Search `grep -rn "15 credits" src/` and update relevant hits to "14 credits" — specifically:
- Hero CTA: *"Start free with 15 credits"* → *"Start free with 14 credits"* (`src/components/landing/hero.tsx`)
- Anywhere onboarding tells the user how many credits they have on first visit
- Pricing-page tier comparisons that mention the trial size
- Any welcome-email content

Do not change historic text ("we used to give 15 credits" type marketing claims) — only the live copy.

- [ ] **Step 4: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/users.ts src/app/api/auth src/components/landing src/app
git commit -m "feat(credits): staging_triple action + 14-credit free trial"
```

---

## Phase G — Landing & pricing copy

### Task G.1: Hero copy updates

**Files:**
- Modify: `src/components/landing/hero.tsx`

- [ ] **Step 1: CTA text** — *"Start free with 15 credits"* → *"Start free with 14 credits"*. (Already covered in Phase F if grep caught it; verify here.)

- [ ] **Step 2: Trust line** — *"Earn a free credit every 7 stages."* → *"Earn a free credit for every 7 you spend."*

- [ ] **Step 3: Body line** — *"A free credit every seven stages."* → *"A free credit for every 7 you spend."*

- [ ] **Step 4: Stat card** — Per Tara: *"leave it for now."* No change to the *"~30s per staged photo"* card.

- [ ] **Step 5: Type-check, build, commit**

```bash
npm run type-check && npm run build
git add src/components/landing/hero.tsx
git commit -m "copy(landing): 14-credit trial + 'every 7 you spend' bonus framing"
```

### Task G.2: New "Three Takes" landing section

**Files:**
- Create: `src/components/landing/three-takes-section.tsx`
- Modify: `src/app/page.tsx` (or wherever sections are composed) — insert between Style Showcase and Pricing.

- [ ] **Step 1: Build the component**

```tsx
'use client';

import { motion } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';

const springTransition = { type: 'spring' as const, stiffness: 80, damping: 20 };

export function ThreeTakesSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-surface-secondary">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={springTransition}
          >
            <p className="text-[19px] font-bold tracking-wider uppercase text-brand-teal mb-4">
              3 for the price of 2
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl text-brand-navy leading-[1.05]">
              Three takes on every room.
            </h2>
            <p className="mt-6 text-xl text-brand-navy/80 leading-relaxed">
              AI is creative — and inconsistent. So most rooms come in three versions:
              three different takes on the same style of the same room. Compare them.
              Pick your favourite. Keep them all.
            </p>
            <p className="mt-6 text-base text-brand-navy/60 italic">
              Prefer to move faster? Switch to single-take per style at checkout and pay 1 credit each.
            </p>
          </motion.div>

          {/* Right — visual */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ ...springTransition, delay: 0.1 }}
          >
            <BeforeAfterSlider
              beforeSrc="/landing/three-takes/empty.jpg"
              afterSrc="/landing/three-takes/take-3.jpg"
              beforeLabel="Original"
              afterLabel="Take 3"
              className="shadow-elevated"
            />
            <div className="mt-4 flex items-center justify-center gap-3">
              <ChipThumb src="/landing/three-takes/take-1-thumb.jpg" label="Take 1" />
              <ChipThumb src="/landing/three-takes/take-2-thumb.jpg" label="Take 2" />
              <ChipThumb src="/landing/three-takes/take-3-thumb.jpg" label="Take 3" active />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ChipThumb({ src, label, active }: { src: string; label: string; active?: boolean }) {
  return (
    <div>
      <div
        className={`h-16 w-20 rounded-lg overflow-hidden border-2 ${
          active ? 'border-brand-teal' : 'border-transparent'
        }`}
      >
        <img src={src} alt={label} className="h-full w-full object-cover" />
      </div>
      <p className="mt-1 text-center text-xs font-semibold text-brand-navy">{label}</p>
    </div>
  );
}
```

- [ ] **Step 2: Source the demo images**

Per the admin-only-public-images memory: images for landing surfaces must come from admin-account stagings. Run a triple-bundle stage on a demo room under the admin account, save the 3 takes plus the original to `public/landing/three-takes/`:
- `empty.jpg` — original
- `take-1.jpg` (full-size, used in slider after the user clicks chip 1)
- `take-2.jpg` / `take-3.jpg` — same
- `take-1-thumb.jpg` / `take-2-thumb.jpg` / `take-3-thumb.jpg` — compressed thumbnails

(For v1 the slider only shows take-3 statically. The chip thumbnails are decorative. A later iteration could make the chips clickable.)

- [ ] **Step 3: Insert the section into the landing**

Find the landing composition (likely `src/app/page.tsx`). Add `<ThreeTakesSection />` between the existing `<StyleShowcase />` and `<Pricing />`.

- [ ] **Step 4: Type-check, build**

Run: `npm run type-check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/three-takes-section.tsx src/app/page.tsx public/landing/three-takes
git commit -m "feat(landing): 'Three Takes' section with chip-thumbnail visual"
```

### Task G.3: Pricing explainer panel

**Files:**
- Modify: `src/components/landing/pricing.tsx`

- [ ] **Step 1: Add a panel above the pack grid**

Find where the pack cards are rendered. Above them, add:

```tsx
<div className="mx-auto max-w-2xl rounded-2xl bg-white border-2 border-brand-navy/10 p-6 mb-12">
  <p className="font-heading text-2xl text-brand-navy">How credits work</p>
  <p className="mt-3 text-base text-brand-navy/80 leading-relaxed">
    1 credit = 1 single take. 2 credits = three takes of one room (recommended).
    So 50 credits = 25 versioned rooms or 50 single takes.
  </p>
</div>
```

- [ ] **Step 2: Type-check, build, commit**

```bash
npm run type-check && npm run build
git add src/components/landing/pricing.tsx
git commit -m "feat(pricing): 'How credits work' explainer panel"
```

### Task G.4: FAQ additions

**Files:**
- Modify: `src/components/landing/faq.tsx`

- [ ] **Step 1: Append four new questions to the FAQ list**

Find the FAQ data structure (likely an array of `{ q, a }` objects). Append:

```ts
{
  q: "What's a 'take'?",
  a: 'One AI-generated version of your room in a chosen style.',
},
{
  q: 'Why three takes?',
  a: "AI is creative and inconsistent. Three takes means you almost always have one you love.",
},
{
  q: 'Can I just get one take?',
  a: 'Yes — pick "Single take per style" at checkout.',
},
{
  q: 'Do I keep all three?',
  a: 'Yes. All three takes save to your gallery and listing.',
},
```

- [ ] **Step 2: Type-check, build, commit**

```bash
npm run type-check && npm run build
git add src/components/landing/faq.tsx
git commit -m "copy(faq): four new questions explaining Three Takes"
```

---

## Phase H — End-to-end smoke testing

### Task H.1: Single-bundle smoke test

- [ ] **Step 1:** Sign in as a non-admin user (or use a test account).
- [ ] **Step 2:** Upload a hero photo and pick 1 room type.
- [ ] **Step 3:** Choose **Single Take** in the new step.
- [ ] **Step 4:** Pick 2 styles. Verify pill says "+1 credit" and total is 2.
- [ ] **Step 5:** Submit. Verify CTA shows *"Stage 2 rooms · 2 credits"*.
- [ ] **Step 6:** Watch the loader — single-mode copy.
- [ ] **Step 7:** Reveal: each style shows one image, no chip strip, today's behaviour preserved.
- [ ] **Step 8:** Verify credits deducted = 2 from `creditsRemaining` and `creditsSpentTotal` += 2.

### Task H.2: Triple-bundle smoke test

- [ ] **Step 1:** Same setup, but choose **Three Takes**.
- [ ] **Step 2:** Pick 2 styles. Verify pill says "+2 credit" and total is 4.
- [ ] **Step 3:** Verify cap shown is "of 3," not "of 10."
- [ ] **Step 4:** Submit. Verify CTA shows *"Stage 2 rooms · 4 credits · 6 versions"*.
- [ ] **Step 5:** Loader shows triple-mode copy.
- [ ] **Step 6:** Reveal: each style shows the carousel; chips animate in as variants land.
- [ ] **Step 7:** Tap chip — variant swaps; in compare mode, slider drag position persists.
- [ ] **Step 8:** Star a different chip — verify request hits the cover endpoint and persists across refresh.
- [ ] **Step 9:** Open the listing detail page — confirm "3 takes" pill on the strip tile and the cover variant matches the starred chip.
- [ ] **Step 10:** Open gallery viewer — confirm carousel works there too.

### Task H.3: Bundle-switch trim warning

- [ ] **Step 1:** Pick 7 styles in single mode.
- [ ] **Step 2:** Go back to Take Count, switch to Triple Takes.
- [ ] **Step 3:** Confirm the warning bar appears and Continue is disabled.
- [ ] **Step 4:** Trim to 3 styles — Continue re-enables.

### Task H.4: Failure-mode test

This requires manually inducing a Lambda failure (or temporarily mocking one). Easiest: temporarily set `OPENAI_API_KEY` to an invalid value in Lambda env, run a triple-bundle stage, observe.

- [ ] **Step 1:** Force a slot-3 (GPT High) failure for one style.
- [ ] **Step 2:** Verify Lambda silent-retries once.
- [ ] **Step 3:** After second failure, verify variant is marked `failed_after_retry`.
- [ ] **Step 4:** Reveal: chip for failed variant absent; refund line shown ("+1 credit refunded").
- [ ] **Step 5:** Verify `creditsRemaining` increased by 1; `refundedKeys` contains the `batchId:style` key (no double-refund on poll).

### Task H.5: Bonus-credit per-credit-spent verification

- [ ] **Step 1:** Fresh test user with 14 credits and `creditsSpentTotal = 0`.
- [ ] **Step 2:** Stage 3 styles in single mode → spends 3 credits, total = 3, no bonus.
- [ ] **Step 3:** Stage 2 styles in single mode → spends 2 credits, total = 5, no bonus.
- [ ] **Step 4:** Stage 1 style in triple mode → spends 2 credits, total = 7, **bonus granted: +1 credit**.
- [ ] **Step 5:** Verify `creditsRemaining` includes the +1; `lastBonusCreditCount = 7`.

### Task H.6: Restore env, finalise

- [ ] **Step 1:** Restore `OPENAI_API_KEY` to valid value if you mucked with it.
- [ ] **Step 2:** Push branch / open PR per the team's normal process.

---

## Out of Scope Reminders

The plan does NOT cover:
- Re-running a missing take ("retry just slot 3") — out of scope.
- Showing engine names to users.
- Mid-batch bundle mixing.
- Lean-mode for users.
- Edit feature revival.
- Stripe / Play Billing wiring.
- Auto-fallback to single-bundle on insufficient credits.

If during execution you find yourself wanting to add one of these, stop and surface it — it's spec-out-of-scope for a reason.

---

## Self-Review (Author's Final Check)

**Spec coverage:**
- Default 3-image bundle, 2 credits/style → A.1, B.1, C.2 ✓
- Single Take opt-out, 1 credit/style → A.1, B.1, C.2 ✓
- 14-credit free trial → F.2 ✓
- Take Count step before styles → C.1, C.2 ✓
- Caps 10 / 3 → A.1 (`maxStylesForBundle`), B.1, C.2 ✓
- Persistent slider + variant chips, all variants kept → D.1, D.2 ✓
- Listing variant grouping with star-icon cover swap → D.2, D.3, D.4 ✓
- Failure: silent retry once → B.3 ✓
- Refund table (1-or-2/3 = +1 credit; 0/3 = full refund existing path; 3/3 = no refund) → B.4 ✓
- Landing "Three Takes" section between Style Showcase and Pricing → G.2 ✓
- Pricing explainer panel above packs → G.3 ✓
- FAQ additions → G.4 ✓
- Hero & trust copy updates ("14 credits", "every 7 you spend") → F.1, F.2, G.1 ✓
- Per-credit-spent bonus counting at API layer; Lambda bonus removed → F.1 ✓
- Single-style routing consolidation through `/api/stage/batch` → C.2 Step 8 ✓

**Placeholder scan:** no "TBD"s. The note in B.3 about reading the Lambda first is intentional — execution requires reading existing code; the plan can't pre-print every line of a 1000-line Lambda file. Where exact code is non-obvious, it's embedded.

**Type consistency:** `Bundle`, `VariantSlot`, `BatchVariant`, `CarouselVariant` all defined and reused consistently. Cover-slot rule helper in `cover-slot.ts` referenced in B.2 and used in D.3 / D.4.

**Scope:** one feature, one plan. Phases sequenced top-to-bottom. Phase A blocks Phase B; Phase B blocks Phase C; Phase D blocks Phase E. Phase G (landing) could in theory ship independently *after* the rest, but ships in the same PR for coherence.
