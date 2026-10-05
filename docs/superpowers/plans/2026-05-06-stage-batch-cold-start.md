# /api/stage/batch cold-start fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/stage/batch` return `202 { batchId }` in <1 s by moving Opus 4.7 analysis out of the API route and into the staging-worker Lambda via a leader-variant pattern.

**Architecture:** API stops running analysis. In triple mode, API only invokes the slot-1 staging Lambda per style with `isLeader: true`. The leader Lambda runs analysis, persists it to the BatchJob record, async-invokes its slot-2 and slot-3 siblings with the analysis baked into their payload, then runs its own staging variant. Single mode is unchanged. Shared-analysis cost basis preserved.

**Tech Stack:** Next.js 14 (App Router), Vitest, AWS SDK (Lambda + DynamoDB), Node.js Lambda (.mjs).

**Spec:** `docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md`

---

## File Structure

| File | Responsibility | Change kind |
|---|---|---|
| `src/lib/db/batch-jobs.ts` | DDB CRUD for `BatchJob` | Modify: init empty maps in `createBatchJob`, add `conciergeNotesByStyle` to type, new `setRoomAnalysisForStyle` helper |
| `src/app/api/stage/batch/route.ts` | API entry | Modify: delete analysis block, only invoke leaders in triple mode, drop `maxDuration` |
| `src/app/api/jobs/batch/route.ts` | Polling endpoint | Modify: stale-batch watchdog before terminal-state evaluation |
| `lambda/staging-worker/index.mjs` | Worker | Modify: handle `params.isLeader`, run analysis → DDB persist → fan out siblings → run own variant |
| `tests/lib/db/batch-jobs.test.ts` | Existing test | Extend with `setRoomAnalysisForStyle` and empty-map-init tests |
| `tests/api/stage-batch.test.ts` | Existing test | Update assertions for triple-mode (3 invocations not 9, all isLeader=true) |
| `tests/api/jobs-batch.test.ts` | Existing test | Add watchdog tests |

No new files. No new test files. No IAM changes assumed in tests — IAM (`lambda:InvokeFunction` self-permission) is verified manually during deploy.

---

## Task 1: `setRoomAnalysisForStyle` helper + empty-map init in `createBatchJob`

**Files:**
- Modify: `src/lib/db/batch-jobs.ts`
- Modify: `tests/lib/db/batch-jobs.test.ts`

- [ ] **Step 1.1: Write the failing test for empty-map init**

Open `tests/lib/db/batch-jobs.test.ts`. Add this test inside the existing `describe('createBatchJob', () => { ... })` block (after the existing test at line 33-46):

```typescript
it('initialises roomAnalysisByStyle and conciergeNotesByStyle as empty maps', async () => {
  await createBatchJob(input);
  const cmd = sendMock.mock.calls[0][0];
  expect(cmd.input.Item.roomAnalysisByStyle).toEqual({});
  expect(cmd.input.Item.conciergeNotesByStyle).toEqual({});
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm run test -- tests/lib/db/batch-jobs.test.ts`
Expected: this test FAILS (today `roomAnalysisByStyle` is conditionally added; `conciergeNotesByStyle` does not exist).

- [ ] **Step 1.3: Write the failing test for `setRoomAnalysisForStyle`**

Add this new `describe` block at the end of the same test file:

```typescript
describe('setRoomAnalysisForStyle', () => {
  it('writes path-targeted update for a single style without clobbering siblings', async () => {
    sendMock.mockResolvedValueOnce({});
    const { setRoomAnalysisForStyle } = await import('@/lib/db/batch-jobs');
    await setRoomAnalysisForStyle({
      batchId: 'b1',
      style: 'Modern',
      analysis: 'analysis text for modern',
      conciergeNotes: ['note one', 'note two'],
    });
    expect(sendMock).toHaveBeenCalledOnce();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ pk: 'BATCH#b1', sk: 'META' });
    expect(cmd.input.UpdateExpression).toContain('roomAnalysisByStyle.#style = :a');
    expect(cmd.input.UpdateExpression).toContain('conciergeNotesByStyle.#style = :n');
    expect(cmd.input.ExpressionAttributeNames).toEqual({ '#style': 'Modern' });
    expect(cmd.input.ExpressionAttributeValues[':a']).toBe('analysis text for modern');
    expect(cmd.input.ExpressionAttributeValues[':n']).toEqual(['note one', 'note two']);
  });
});
```

- [ ] **Step 1.4: Run test to verify both fail**

Run: `npm run test -- tests/lib/db/batch-jobs.test.ts`
Expected: 2 failing tests (the empty-map init from Step 1.1, and the `setRoomAnalysisForStyle` test from Step 1.3 fails to import).

- [ ] **Step 1.5: Update `BatchJob` type and `createBatchJob` to init empty maps**

In `src/lib/db/batch-jobs.ts`, modify the `BatchJob` interface (currently lines 48-73). Add a new optional field:

```typescript
  /**
   * Per-style concierge notes, indexed by style. Mirrors roomAnalysisByStyle:
   * the leader Lambda for each style writes its analysis-derived notes here,
   * shared across the variants for that style. Empty for single mode.
   */
  conciergeNotesByStyle?: Record<string, string[]>;
```

Place it directly under `roomAnalysisByStyle?: Record<string, string>;`.

In the same file, modify `createBatchJob` (currently lines 87-130). Replace the conditional `roomAnalysisByStyle` spread with always-empty maps:

Find:
```typescript
    ...(data.roomAnalysisByStyle ? { roomAnalysisByStyle: data.roomAnalysisByStyle } : {}),
    roomAnalysis: '', // legacy field; per-style data lives in roomAnalysisByStyle
```

Replace with:
```typescript
    roomAnalysisByStyle: data.roomAnalysisByStyle ?? {},
    conciergeNotesByStyle: {},
    roomAnalysis: '', // legacy field; per-style data lives in roomAnalysisByStyle
```

- [ ] **Step 1.6: Add `setRoomAnalysisForStyle` helper**

In `src/lib/db/batch-jobs.ts`, add this new export at the end of the file:

```typescript
/**
 * Persists a single style's analysis + concierge notes onto the BatchJob
 * record using a path-targeted UpdateExpression. Concurrent leaders for
 * different styles do NOT clobber each other — DDB serializes UpdateItem
 * on a single record and each leader writes a different map key.
 *
 * Called by the staging-worker Lambda's leader path. The siblings get the
 * same analysis via their invocation payload (NOT via reading this back),
 * so this write is for observability + recovery, not a critical path.
 */
export async function setRoomAnalysisForStyle(args: {
  batchId: string;
  style: string;
  analysis: string;
  conciergeNotes: string[];
}): Promise<void> {
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${args.batchId}`, sk: 'META' },
      UpdateExpression:
        'SET roomAnalysisByStyle.#style = :a, conciergeNotesByStyle.#style = :n',
      ExpressionAttributeNames: { '#style': args.style },
      ExpressionAttributeValues: {
        ':a': args.analysis,
        ':n': args.conciergeNotes,
      },
    }),
  );
}
```

- [ ] **Step 1.7: Run tests to verify they pass**

Run: `npm run test -- tests/lib/db/batch-jobs.test.ts`
Expected: all tests in the file PASS.

- [ ] **Step 1.8: Commit**

```bash
git add src/lib/db/batch-jobs.ts tests/lib/db/batch-jobs.test.ts
git commit -m "feat(batch-jobs): add setRoomAnalysisForStyle helper, init empty maps"
```

---

## Task 2: API route — drop analysis, only invoke leaders in triple mode

**Files:**
- Modify: `src/app/api/stage/batch/route.ts`
- Modify: `tests/api/stage-batch.test.ts`

- [ ] **Step 2.1: Update existing happy-path test for triple-mode leader-only fan-out**

In `tests/api/stage-batch.test.ts`, find the existing test `'202 on happy path: deducts N credits, creates batch, invokes Lambda N times (analysis runs in Lambda)'` (around line 81). The current `goodBody` defines `bundle: undefined` (defaults to triple). With 2 styles in triple mode, today's behaviour is 6 invocations; under this design it becomes 2 (slot-1 leader per style).

Replace the body of that test with:

```typescript
  it('202 on triple happy path: deducts N credits, invokes only slot-1 leaders, no in-route analysis', async () => {
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(202);
    expect(deductCredits).toHaveBeenCalledWith('u1', expect.anything(), 4); // triple = 2 credits/style * 2 styles
    expect(runAnalysis).not.toHaveBeenCalled(); // analysis no longer in API route at all
    expect(createBatchJob).toHaveBeenCalledOnce();
    // 2 styles, 1 leader each — NOT 6 invocations.
    expect(invokeStagingWorker).toHaveBeenCalledTimes(2);
    // Every invocation must carry isLeader: true and variantSlot: 1.
    for (const call of vi.mocked(invokeStagingWorker).mock.calls) {
      expect(call[0].params).toMatchObject({ isLeader: true, variantSlot: 1 });
    }
    const body = await res.json();
    expect(body.batchId).toBe('b-1');
    expect(body.subJobs).toHaveLength(2);
  });
```

Note: `goodBody` does not set `bundle`, which defaults to `'triple'`. Confirm by reading the route code (line 65) — yes, default is `'triple'`.

The mock for `createBatchJob` (lines 11-17 of the test file) needs to return `subJobs[].variants[]` shape so the route's `flatMap(s => s.variants.map(...))` works. Update the mock at the top of the file:

Find:
```typescript
vi.mock('@/lib/db/batch-jobs', () => ({
  createBatchJob: vi.fn(async (i) => ({
    batchId: 'b-1',
    subJobs: i.styles.map((s: string, idx: number) => ({ jobId: `j-${idx}`, style: s, status: 'pending' })),
    total: i.styles.length,
  })),
}));
```

Replace with:
```typescript
vi.mock('@/lib/db/batch-jobs', () => ({
  createBatchJob: vi.fn(async (i) => ({
    batchId: 'b-1',
    subJobs: i.styles.map((s: string, idx: number) => ({
      style: s,
      status: 'pending',
      variants:
        i.bundle === 'triple'
          ? [
              { slot: 1, jobId: `j-${idx}-1`, status: 'pending' },
              { slot: 2, jobId: `j-${idx}-2`, status: 'pending' },
              { slot: 3, jobId: `j-${idx}-3`, status: 'pending' },
            ]
          : [{ slot: 1, jobId: `j-${idx}-1`, status: 'pending' }],
    })),
    total: i.bundle === 'triple' ? i.styles.length * 3 : i.styles.length,
  })),
}));
```

- [ ] **Step 2.2: Add a single-mode regression test**

Add this test inside the same `describe('POST /api/stage/batch', () => { ... })` block:

```typescript
  it('202 on single-mode: invokes 1 Lambda per style, no isLeader flag', async () => {
    const res = await POST(makeReq({ ...goodBody, bundle: 'single' }));
    expect(res.status).toBe(202);
    expect(deductCredits).toHaveBeenCalledWith('u1', expect.anything(), 2); // single = 1 credit/style * 2 styles
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(invokeStagingWorker).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(invokeStagingWorker).mock.calls) {
      expect(call[0].params.isLeader).toBeUndefined();
      expect(call[0].params.variantSlot).toBe(1);
    }
  });
```

- [ ] **Step 2.3: Run tests to verify they fail**

Run: `npm run test -- tests/api/stage-batch.test.ts`
Expected: the two updated/new tests FAIL because today's route still calls `runAnalysis` and invokes all 6 variants in triple.

- [ ] **Step 2.4: Modify the route — delete analysis block + maxDuration export**

In `src/app/api/stage/batch/route.ts`:

(a) Delete line 19: `export const maxDuration = 60;` — remove this line entirely.

(b) Delete lines 141-198 (the `useOpus47` const, the comment block, and the entire `if (bundle === 'triple') { ... }` analysis block). Replace with:

```typescript
  // Analysis no longer runs at the API layer. The staging-worker Lambda runs
  // it instead — for triple bundle, the slot-1 leader per style runs analysis
  // once and fans out to siblings with the result. For single bundle, the
  // Lambda runs its own analysis exactly as today. See spec
  // docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md.
  const useOpus47 = true;
```

(c) Delete the `roomAnalysisByStyle` and `conciergeNotesByStyle` references in the `createBatchJob` call. Find lines around 200-210:

```typescript
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

Replace with:

```typescript
  const batch = await createBatchJob({
    userId: session.user.id,
    bundle,
    heroS3Key,
    referenceS3Keys,
    roomTypes,
    notes,
    styles,
    listingId,
  });
```

(d) In the same file, modify the fan-out at lines 214-262. Change the `flatMap` so triple-bundle only invokes slot-1 variants and tags them as leaders. Replace:

```typescript
  await Promise.all(
    batch.subJobs.flatMap((sub) =>
      sub.variants.map((variant) => {
```

With:

```typescript
  await Promise.all(
    batch.subJobs.flatMap((sub) =>
      sub.variants
        // Triple mode: only invoke slot-1 leaders — they fan out to siblings
        // from inside the Lambda. Single mode: only one variant exists, this
        // is a no-op filter.
        .filter((v) => bundle === 'single' || v.slot === 1)
        .map((variant) => {
```

(e) In the same `Promise.all` block, find the `params` object inside `invokeStagingWorker(...)`. Add `isLeader: true` for triple-mode invocations. Locate the lines around 246-258:

```typescript
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
            // Triple mode: pre-computed analysis + notes. Single mode: empty → Lambda runs its own.
            roomAnalysis: sharedAnalysis,
            conciergeNotes: sharedConciergeNotes,
            useOpus47,
            ...
          },
        });
```

Find the `roomAnalysis: sharedAnalysis` and `conciergeNotes: sharedConciergeNotes` lines, and the constant declarations earlier (`const sharedAnalysis = ...; const sharedConciergeNotes = ...;`). Delete those four lines entirely (the constants and their usages). Replace with passing empty values + the leader flag for triple mode:

The full new `params` object becomes:

```typescript
          params: {
            userId: session.user.id,
            sessionId: variant.jobId,
            heroS3Key,
            referenceS3Keys,
            roomTypes,
            style: sub.style,
            notes,
            // Always empty from the API now. The Lambda either receives this
            // pre-populated from a leader's fan-out (siblings in triple mode)
            // or runs its own analysis (single mode + leaders themselves).
            roomAnalysis: '',
            conciergeNotes: [],
            useOpus47,
            model: dispatchModel,
            provider: dispatchProvider,
            quality: dispatchQuality,
            analysisMode: dispatchAnalysisMode,
            variantSlot: variant.slot,
            bundle,
            applyWatermark: !isAdmin,
            ...(bundle === 'triple' ? { isLeader: true } : {}),
            ...(listingId ? { listingId } : {}),
          },
```

- [ ] **Step 2.5: Run tests to verify they pass**

Run: `npm run test -- tests/api/stage-batch.test.ts`
Expected: all tests PASS, including the two new/updated.

- [ ] **Step 2.6: Run type-check to confirm no type drift**

Run: `npm run type-check`
Expected: no errors. (`runAnalysis` import is now unused — TypeScript will flag it as an unused import only if eslint is run, not type-check. Continue to Step 2.7.)

- [ ] **Step 2.7: Remove the unused `runAnalysis` import**

In `src/app/api/stage/batch/route.ts`, delete line 10: `import { runAnalysis } from '@/lib/ai/run-analysis';`

- [ ] **Step 2.8: Run lint to confirm clean**

Run: `npm run lint`
Expected: no errors related to the modified files.

- [ ] **Step 2.9: Commit**

```bash
git add src/app/api/stage/batch/route.ts tests/api/stage-batch.test.ts
git commit -m "feat(stage/batch): drop in-route analysis, invoke only slot-1 leaders in triple mode"
```

---

## Task 3: Polling endpoint — stale-batch watchdog — DEFERRED

**Deferred 2026-05-06.** Implementer found that `mutateSubJob` (the helper underpinning `markSubJobError`) uses legacy `subJobs[].jobId` lookup and is not variant-aware. Implementing the watchdog correctly requires fixing `mutateSubJob` first or inlining variant-aware DDB writes — neither is appropriate to bolt onto this PR. The Lambda's `propagateToBatch` already provides variant-aware writes for the live Three Takes flow; the watchdog is defence-in-depth for a rare failure case. Track as a follow-up PR.

The original task definition is preserved below for that follow-up.

---

## Task 3 (original definition, deferred)

**Files:**
- Modify: `src/app/api/jobs/batch/route.ts`
- Modify: `tests/api/jobs-batch.test.ts`

- [ ] **Step 3.1: Read the existing polling test to find the right place to add new tests**

Read `tests/api/jobs-batch.test.ts` to understand the existing mock setup. Then add a new test:

```typescript
// add this inside the existing describe block. Adjust the mock structure
// to match whatever the existing tests use — getBatchJob returns the
// BatchJob shape directly.

it('marks pending variants as failed_after_retry when batch is older than 3 minutes', async () => {
  const stale = new Date(Date.now() - 4 * 60 * 1000).toISOString(); // 4 min ago
  vi.mocked(getBatchJob).mockResolvedValueOnce({
    pk: 'BATCH#b1', sk: 'META',
    batchId: 'b1', userId: 'u1', bundle: 'triple',
    heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
    roomAnalysis: '', subJobs: [
      { style: 'Modern', status: 'pending', variants: [
        { slot: 1, jobId: 'j1', status: 'done', stagedS3Key: 's1' },
        { slot: 2, jobId: 'j2', status: 'pending' },
        { slot: 3, jobId: 'j3', status: 'pending' },
      ]},
    ],
    total: 3, completed: 1, failed: 0, refundedCredits: 0,
    createdAt: stale,
  } as any);

  const res = await GET(makeReq('b1'));
  expect(res.status).toBe(200);
  // The watchdog should have called markSubJobError for the two pending variants.
  expect(vi.mocked(markSubJobError)).toHaveBeenCalledTimes(2);
});

it('does not touch fresh batches with pending variants', async () => {
  const fresh = new Date().toISOString();
  vi.mocked(getBatchJob).mockResolvedValueOnce({
    pk: 'BATCH#b1', sk: 'META',
    batchId: 'b1', userId: 'u1', bundle: 'triple',
    heroS3Key: 'h.jpg', referenceS3Keys: [], roomTypes: [], notes: '',
    roomAnalysis: '', subJobs: [
      { style: 'Modern', status: 'pending', variants: [
        { slot: 1, jobId: 'j1', status: 'pending' },
      ]},
    ],
    total: 1, completed: 0, failed: 0, refundedCredits: 0,
    createdAt: fresh,
  } as any);

  const res = await GET(makeReq('b1'));
  expect(res.status).toBe(200);
  expect(vi.mocked(markSubJobError)).not.toHaveBeenCalled();
});
```

If the existing test file does not yet mock `markSubJobError`, add it to the mock at the top:

```typescript
vi.mock('@/lib/db/batch-jobs', () => ({
  getBatchJob: vi.fn(),
  markSubJobError: vi.fn(async () => {}),
}));
```

And add the import alongside `getBatchJob`:

```typescript
import { getBatchJob, markSubJobError } from '@/lib/db/batch-jobs';
```

If those mocks/imports already exist with different shape, adapt to match.

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npm run test -- tests/api/jobs-batch.test.ts`
Expected: the two new tests FAIL — no watchdog yet.

- [ ] **Step 3.3: Add watchdog logic to the polling endpoint**

In `src/app/api/jobs/batch/route.ts`, add the import for `markSubJobError` at the top alongside `getBatchJob`:

```typescript
import { getBatchJob, markSubJobError } from '@/lib/db/batch-jobs';
```

Then insert the watchdog block immediately after the auth check (after line 30: `if (batch.userId !== session.user.id) { ... }` and before the existing `Promise.all(batch.subJobs.map(async (s) => { ... }))` at line 32):

```typescript
  // Stale-batch watchdog: if the batch is older than 3 minutes and any
  // variant is still pending, mark those variants as failed_after_retry so
  // the existing terminal-state machinery (partial refunds) can fire. Three
  // minutes ≈ 3× the realistic end-to-end (~30-60s observed); tunable.
  // See spec docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md.
  const STALE_MS = 3 * 60 * 1000;
  const ageMs = Date.now() - new Date(batch.createdAt).getTime();
  if (ageMs > STALE_MS) {
    const stalePending: { jobId: string }[] = [];
    for (const sub of batch.subJobs) {
      for (const v of sub.variants ?? []) {
        if (v.status === 'pending' || v.status === 'running') {
          stalePending.push({ jobId: v.jobId });
        }
      }
    }
    if (stalePending.length > 0) {
      await Promise.all(
        stalePending.map((v) =>
          markSubJobError({
            batchId: batch.batchId,
            jobId: v.jobId,
            error: 'stale-watchdog: batch exceeded 3min with pending variant',
          }),
        ),
      );
      // Re-fetch so the rest of the response renders the post-watchdog state.
      const refreshed = await getBatchJob(batch.batchId);
      if (refreshed) {
        Object.assign(batch, refreshed);
      }
    }
  }
```

Note: `markSubJobError` already exists in `src/lib/db/batch-jobs.ts` (line 248) and is variant-aware via `mutateSubJob`. **Confirm before relying on it** — read `mutateSubJob` (line 187) and verify it walks `subJobs[].variants[]` not just legacy `s.jobId`. The TODO comment on line 179-185 says the helper currently uses legacy lookup. **If still legacy at implementation time, fix `mutateSubJob` first OR add a variant-aware `markVariantError` helper as part of Task 1 instead.**

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm run test -- tests/api/jobs-batch.test.ts`
Expected: all tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/api/jobs/batch/route.ts tests/api/jobs-batch.test.ts
git commit -m "feat(jobs/batch): stale-batch watchdog marks pending variants as errored after 3min"
```

---

## Task 4: Lambda — leader fan-out logic

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

> Note: the Lambda is .mjs and not covered by Vitest. There are no unit tests for it in the repo today. Verification is via the integration smoke test in Task 6 + prod cold-start repro. Keep changes small and audit by reading.

- [ ] **Step 4.1: Add Lambda invoke imports**

In `lambda/staging-worker/index.mjs`, add `LambdaClient` and `InvokeCommand` to the existing AWS SDK imports near the top (around line 7-15). Add a new import line:

```javascript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
```

Then below the existing client initialisations (after line 30 where `ai` is created), add:

```javascript
const lambdaClient = new LambdaClient({ region: REGION });
const SELF_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'stageright-staging-worker';
```

`AWS_LAMBDA_FUNCTION_NAME` is auto-set by the Lambda runtime, so this is a no-config pattern.

- [ ] **Step 4.2: Verify @aws-sdk/client-lambda is in the Lambda's package.json**

Run from project root:

```bash
grep '"@aws-sdk/client-lambda"' lambda/staging-worker/package.json || echo "MISSING"
```

If it prints `MISSING`, add it:

```bash
cd lambda/staging-worker && npm install --save @aws-sdk/client-lambda
```

This will be re-installed during the linux-x64 ritual at deploy time anyway, but it must be in package.json now or the Lambda will fail at INIT.

- [ ] **Step 4.3: Add `fanOutSiblings` and `runAsLeader` helpers**

In `lambda/staging-worker/index.mjs`, add these new functions immediately after `runAnalysisInLambda` (which ends around line 408, before `downloadFromS3`):

```javascript
// ---------- Leader fan-out ----------
//
// In triple mode, the API only invokes slot-1 Lambdas as leaders. Each leader
// runs analysis once, persists the result to BATCH_JOB.roomAnalysisByStyle[style]
// + conciergeNotesByStyle[style] for observability, then async-invokes the
// slot-2 and slot-3 Lambdas for its style with the analysis baked into their
// payload. Siblings receive a non-empty roomAnalysis and skip their own
// analysis (existing behaviour at the empty-string fallback below).
//
// Spec: docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md

async function fanOutSiblings({ batchId, style, leaderEvent, sharedAnalysis, sharedConciergeNotes }) {
  // Read the BATCH_JOB record to find sibling jobIds + their dispatch config.
  const got = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${batchId}`, sk: 'META' },
  }));
  if (!got.Item) {
    console.error(`[StagingWorker] fanOut: batch ${batchId} not found`);
    return;
  }
  const sub = (got.Item.subJobs || []).find((s) => s.style === style);
  if (!sub) {
    console.error(`[StagingWorker] fanOut: subJob for style=${style} not in batch ${batchId}`);
    return;
  }
  const siblings = (sub.variants || []).filter((v) => v.slot !== 1);

  // Dispatch config per slot — must match TRIPLE_VARIANTS in src/types.
  // Slot 2 = GPT Image 2 Full Medium. Slot 3 = GPT Image 2 Full High.
  // If src/types.ts changes, this MUST change with it.
  const slotConfig = {
    2: { provider: 'openai', model: 'gpt-image-2', quality: 'medium' },
    3: { provider: 'openai', model: 'gpt-image-2', quality: 'high' },
  };

  await Promise.all(siblings.map(async (variant) => {
    const cfg = slotConfig[variant.slot];
    if (!cfg) {
      console.error(`[StagingWorker] fanOut: no config for slot ${variant.slot}`);
      return;
    }
    const siblingPayload = {
      jobId: variant.jobId,
      action: 'stage',
      batchId,
      params: {
        ...leaderEvent.params,
        sessionId: variant.jobId,
        roomAnalysis: sharedAnalysis,
        conciergeNotes: sharedConciergeNotes,
        provider: cfg.provider,
        model: cfg.model,
        quality: cfg.quality,
        variantSlot: variant.slot,
        isLeader: false, // explicit
      },
    };
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: SELF_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(siblingPayload)),
      }));
      console.log(`[StagingWorker] Fanned out sibling slot=${variant.slot} jobId=${variant.jobId}`);
    } catch (err) {
      console.error(`[StagingWorker] Sibling invoke failed slot=${variant.slot}: ${err.message}`);
      // Mark this variant errored directly so terminal-state refund fires.
      try {
        await propagateToBatch({
          batchId, jobId: variant.jobId, style,
          success: false, error: `fanout-failed: ${err.message}`,
          variantSlot: variant.slot,
        });
      } catch (propErr) {
        console.error(`[StagingWorker] propagateToBatch on fanout failure also failed: ${propErr.message}`);
      }
    }
  }));
}

async function runAsLeader(event) {
  const { params, batchId } = event;
  const { style, roomTypes = [], notes = '', useOpus47, heroS3Key, referenceS3Keys = [] } = params;
  console.log(`[StagingWorker] LEADER for style=${style} batchId=${batchId}`);

  // 1. Run analysis. If it fails, log and continue with empty analysis —
  //    siblings will fall back to per-Lambda analysis. Cost increase on this
  //    rare failure path is acceptable.
  let analysis = '';
  let conciergeNotes = [];
  try {
    const heroBuf = await downloadFromS3(heroS3Key);
    const refsBufs = await Promise.all(referenceS3Keys.map(downloadFromS3));
    const result = await runAnalysisInLambda({
      heroBase64: heroBuf.toString('base64'),
      refsBase64: refsBufs.map((b) => b.toString('base64')),
      style, notes, roomTypes, useOpus47,
    });
    analysis = result.analysis || '';
    conciergeNotes = result.concierge_notes || [];
  } catch (err) {
    console.error(`[StagingWorker] LEADER analysis failed style=${style}: ${err.message}`);
  }

  // 2. Persist for observability. Best-effort — failure here does not block
  //    fan-out (siblings get analysis from payload, not from DDB).
  if (analysis) {
    try {
      await setRoomAnalysisForStyleInLambda({
        batchId, style, analysis, conciergeNotes,
      });
    } catch (err) {
      console.warn(`[StagingWorker] LEADER ddb persist failed style=${style}: ${err.message}`);
    }
  }

  // 3. Fan out to slots 2 + 3.
  await fanOutSiblings({
    batchId, style,
    leaderEvent: event,
    sharedAnalysis: analysis,
    sharedConciergeNotes: conciergeNotes,
  });

  // 4. Return analysis so the leader's own variant can use it — saves
  //    re-running analysis in stageRoom's empty-string fallback.
  return { analysis, conciergeNotes };
}

// In-Lambda mirror of src/lib/db/batch-jobs.ts setRoomAnalysisForStyle.
// Kept here (not factored into a shared module) because the Lambda's bundling
// is independent of the Next.js app — sharing TS code would require
// restructuring. Keep these two implementations byte-aligned on schema.
async function setRoomAnalysisForStyleInLambda({ batchId, style, analysis, conciergeNotes }) {
  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    UpdateExpression: 'SET roomAnalysisByStyle.#style = :a, conciergeNotesByStyle.#style = :n',
    ExpressionAttributeNames: { '#style': style },
    ExpressionAttributeValues: { ':a': analysis, ':n': conciergeNotes },
  }));
}
```

- [ ] **Step 4.4: Wire `runAsLeader` into the handler**

In the existing `handler` (starts line 1383), find the `if (action === 'stage') {` branch (line ~1389). Just before the `try { result = await stageRoom(params, jobId); }` block, add the leader call:

```javascript
    if (action === 'stage') {
      // If this invocation is a triple-mode leader, run shared analysis +
      // fan out siblings BEFORE running our own variant. The leader's own
      // staging then uses the analysis it just computed (via params mutation)
      // to skip the in-stageRoom analysis fallback.
      if (params.isLeader && batchId) {
        const leaderResult = await runAsLeader(event);
        // Mutate params so stageRoom's existing "if roomAnalysis empty, run
        // own analysis" branch is skipped — we already have it.
        params.roomAnalysis = leaderResult.analysis;
        params.conciergeNotes = leaderResult.conciergeNotes;
      }

      // Silent retry-once on generation failure. ...
      try {
        result = await stageRoom(params, jobId);
      } catch (firstErr) {
        ...
```

(The `...` lines stay exactly as they are — only insert the new `if (params.isLeader && batchId) { ... }` block.)

- [ ] **Step 4.5: Verify the Lambda's IAM role has self-invoke permission**

Manual step — not a code change.

```bash
aws iam list-attached-role-policies --role-name stageright-staging-worker-role --region ap-southeast-2 2>&1 | head -20
aws iam list-role-policies --role-name stageright-staging-worker-role --region ap-southeast-2 2>&1
```

(Role name might differ — find it via `aws lambda get-function-configuration --function-name stageright-staging-worker --region ap-southeast-2 --query Role`.)

If no policy permits `lambda:InvokeFunction` on the function ARN, add an inline policy:

```bash
ROLE_NAME=<role-name-from-above>
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "self-invoke" --policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:ap-southeast-2:*:function:stageright-staging-worker"
  }]
}' --region ap-southeast-2
```

- [ ] **Step 4.6: Commit**

```bash
git add lambda/staging-worker/index.mjs lambda/staging-worker/package.json lambda/staging-worker/package-lock.json
git commit -m "feat(staging-worker): leader fan-out — slot-1 runs shared analysis and invokes siblings"
```

---

## Task 5: Local pre-deploy verification

- [ ] **Step 5.1: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5.2: Test full suite**

Run: `npm run test`
Expected: all tests PASS.

- [ ] **Step 5.3: Lint**

Run: `npm run lint`
Expected: no errors related to modified files.

- [ ] **Step 5.4: Production build**

Run: `npm run build`
Expected: build succeeds. (Per the apostrophes-break-Amplify memory, `next build` catches `react/no-unescaped-entities` and other issues that `type-check` misses.)

If any step fails, fix inline before continuing.

---

## Task 6: Lambda redeploy (manual — per CLAUDE.md "Deploying the staging-worker Lambda")

- [ ] **Step 6.1: Linux-x64 dependency install**

Run from project root via Bash:

```bash
cd lambda/staging-worker && rm -rf node_modules package-lock.json && \
  npm install --omit=dev --include=optional --os=linux --cpu=x64 --libc=glibc
```

- [ ] **Step 6.2: Verify sharp linux binaries are present**

Run from project root:

```bash
ls lambda/staging-worker/node_modules/@img/ | grep -i linux
ls lambda/staging-worker/node_modules/sharp/ > /dev/null && echo "sharp ok" || echo "SHARP MISSING"
ls lambda/staging-worker/node_modules/@aws-sdk/client-lambda > /dev/null && echo "client-lambda ok" || echo "CLIENT-LAMBDA MISSING"
```

Expected: `@img/sharp-linux-x64`, `sharp ok`, `client-lambda ok`. If any are missing, **stop** — do not zip. Investigate before proceeding.

- [ ] **Step 6.3: Zip via PowerShell ZipFile (long-path safe)**

```bash
powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; \$src = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker'; \$dst = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker.zip'; if (Test-Path \$dst) { Remove-Item \$dst -Force }; [System.IO.Compression.ZipFile]::CreateFromDirectory(\$src, \$dst, [System.IO.Compression.CompressionLevel]::Optimal, \$false)"
```

- [ ] **Step 6.4: Upload**

```bash
cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2
```

- [ ] **Step 6.5: Wait for rollover**

```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
```

Expected: `LastUpdateStatus: Successful`, `State: Active`. Re-run if `InProgress`.

- [ ] **Step 6.6: Smoke test the Lambda alone**

In the AWS console (or via CLI), invoke the Lambda directly with a test event matching today's payload shape (no `isLeader`, single-mode style of params) and confirm it still stages successfully. This proves backwards compatibility before pushing the new API.

---

## Task 7: Push to Amplify + cold-start repro

- [ ] **Step 7.1: Push**

```bash
git push origin master
```

Amplify auto-deploys (~3 min). Watch the Amplify console for build success.

- [ ] **Step 7.2: Wait for cold start**

Wait at least 15 minutes after the Amplify deploy completes so the SSR Lambda goes cold.

- [ ] **Step 7.3: Trigger the actual repro**

In a browser:
1. Sign in.
2. Go to `/stage`. Upload a hero image, pick 3 styles, leave bundle as default (Triple Take).
3. Submit.
4. Confirm the browser receives a `202 { batchId }` within ~1 second (Network tab — look for the POST to `/api/stage/batch`).
5. Confirm the reveal page loads, shows the wait/concierge ceremony, and progressively populates 9 variants across the 3 styles.

If the browser sees "Failed to fetch" — the fix did not land. Investigate before declaring done.

- [ ] **Step 7.4: Verify single-mode regression**

Submit a single-mode batch (Single Take) with 1 style. Confirm it works as before.

- [ ] **Step 7.5: Verify onboarding regression**

Walk through `/onboarding` from a fresh test account. Confirm the cached demo flow still works (zero credits, no Lambda call expected for the demo image — but verify nothing crashes).

- [ ] **Step 7.6: Verify /admin/compare regression**

Submit a 1-style admin compare run from `/admin/compare`. Confirm the 6-variant grid populates.

- [ ] **Step 7.7: Done**

If all four smoke tests pass, the fix is live. Update `project_three_takes_shipped.md` memory if you want to note that batch-mode now uses leader fan-out.

---

## Open verification points (carry into implementation)

These were flagged in the spec and should be confirmed during implementation:

1. **Does `mutateSubJob` in `src/lib/db/batch-jobs.ts` walk `subJobs[].variants[]` correctly for triple bundles?** The TODO at lines 179-185 says it currently uses legacy `s.jobId` lookup. If the watchdog's `markSubJobError` calls fail for triple batches, fix `mutateSubJob` first as part of Task 1.
2. **Does the Lambda's IAM role already permit `lambda:InvokeFunction` on itself?** Verified in Step 4.5.
3. **Does a stale-batch reaper already exist?** Search `applyPartialRefundsForBatch` and adjacent code paths. If present, extend that instead of duplicating.
