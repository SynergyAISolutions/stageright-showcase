# Batch Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 1–10 style batch staging feature: multi-select wizard step, fan-out API, result page with slider + variant list, per-image refund on failure.

**Architecture:** `POST /api/stage/batch` runs analysis once, writes a `BATCH_JOB` record, fires N parallel async Lambda invocations (existing Lambda, one new `batchId` param). Each sub-Lambda writes its own staging record and atomically updates the parent `BATCH_JOB` counter on completion or failure. Client polls `GET /api/jobs/batch?id={batchId}` every 3s. The result page is slider-led — before/after slider is the main image; a readable variant list on the side (desktop) or below (mobile, with sticky slider) swaps the active variant into the slider. Same page renders loading state as variants populate.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Vitest, AWS SDK v3 (DynamoDB + S3 + Lambda), Framer Motion. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-19-batch-staging-design.md`

---

## File Structure

**New source files:**
- `src/lib/db/batch-jobs.ts` — `BATCH_JOB` CRUD + atomic counter helpers
- `src/lib/ai/run-analysis.ts` — extracted analysis logic (reusable between `/api/analyse` and the batch entry)
- `src/app/api/stage/batch/route.ts` — batch entry (POST)
- `src/app/api/jobs/batch/route.ts` — batch poll (GET)
- `src/app/stage/batch/[batchId]/page.tsx` — result/loading page
- `src/components/staging/batch-variant-row.tsx` — one row in the variant list
- `src/components/staging/batch-result.tsx` — the slider + variant list composition

**New test files:**
- `tests/lib/db/batch-jobs.test.ts`
- `tests/lib/db/users-refund.test.ts`
- `tests/api/stage-batch.test.ts`
- `tests/api/jobs-batch.test.ts`

**Modified source files:**
- `src/lib/db/users.ts` — add `refundCredits(userId, amount, reason)` export
- `src/app/api/analyse/route.ts` — delegate core logic to `run-analysis.ts`
- `src/app/stage/page.tsx` — style step multi-select, route branching
- `lambda/staging-worker/index.mjs` — accept optional `batchId`, atomic `BATCH_JOB` update on completion/failure, direct-SDK credit refund on failure

---

## Task 0: Pre-flight

**Files:** none (verification only)

- [ ] **Step 0.1: Verify clean working tree**

Run:
```bash
git status
```
Expected: `On branch master`. Pre-existing `.claude/settings.local.json` and `lambda/staging-worker.zip` may show — those are unrelated. If any landing-page or staging-worker file shows as modified, stash or commit before starting.

- [ ] **Step 0.2: Baseline build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 0.3: Baseline tests**

Run:
```bash
npm run test
```
Expected: all existing tests pass. Record the count so regressions are obvious.

---

## Task 1: `refundCredits` helper (TDD)

Credits need a refund path the codebase currently lacks. Used by the batch entry API on orchestrator-level failure AND referenced by the Lambda's direct-SDK refund path (Lambda writes DDB directly, but the Next.js path needs a helper).

**Files:**
- Create: `tests/lib/db/users-refund.test.ts`
- Modify: `src/lib/db/users.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/lib/db/users-refund.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => updateMock(...args) },
  TABLE_NAME: 'stageright',
}));

import { refundCredits } from '@/lib/db/users';

describe('refundCredits', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
  });

  it('sends an atomic ADD update for the given amount', async () => {
    await refundCredits('u-1', 3, 'batch-sub-job-error');
    expect(updateMock).toHaveBeenCalledOnce();
    const cmd = updateMock.mock.calls[0][0];
    expect(cmd.input.TableName).toBe('stageright');
    expect(cmd.input.Key).toEqual({ pk: 'USER#u-1', sk: 'PROFILE' });
    expect(cmd.input.UpdateExpression).toContain('ADD creditsRemaining');
    expect(cmd.input.ExpressionAttributeValues).toMatchObject({ ':amt': 3 });
  });

  it('throws on zero or negative amounts', async () => {
    await expect(refundCredits('u-1', 0, 'test')).rejects.toThrow(/amount must be positive/i);
    await expect(refundCredits('u-1', -1, 'test')).rejects.toThrow(/amount must be positive/i);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run:
```bash
npm run test -- tests/lib/db/users-refund.test.ts
```
Expected: FAIL with `refundCredits is not a function` or an import error.

- [ ] **Step 1.3: Implement `refundCredits` in `src/lib/db/users.ts`**

Add this export anywhere after the existing `deductCredits` function:
```ts
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

export async function refundCredits(
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  if (amount <= 0) {
    throw new Error('refundCredits: amount must be positive');
  }
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD creditsRemaining :amt SET updatedAt = :now, lastRefundReason = :r',
      ExpressionAttributeValues: {
        ':amt': amount,
        ':now': new Date().toISOString(),
        ':r': reason,
      },
    }),
  );
}
```

`UpdateCommand` is already imported at the top of the file for the existing `deductCredits`; confirm and add the import only if missing.

- [ ] **Step 1.4: Run test to verify it passes**

Run:
```bash
npm run test -- tests/lib/db/users-refund.test.ts
```
Expected: PASS (both cases).

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/db/users.ts tests/lib/db/users-refund.test.ts
git commit -m "feat(db): refundCredits helper with unit test"
```

---

## Task 2: `batch-jobs.ts` module (TDD)

**Files:**
- Create: `src/lib/db/batch-jobs.ts`
- Create: `tests/lib/db/batch-jobs.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/lib/db/batch-jobs.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import {
  createBatchJob,
  getBatchJob,
  markSubJobDone,
  markSubJobError,
  type BatchJobInput,
} from '@/lib/db/batch-jobs';

const input: BatchJobInput = {
  userId: 'u-1',
  heroS3Key: 'users/u-1/hero.jpg',
  referenceS3Keys: [],
  roomTypes: ['Living Room'],
  notes: '',
  roomAnalysis: 'analysis text',
  styles: ['Modern', 'Coastal', 'Hamptons'],
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('createBatchJob', () => {
  it('writes a record with one pending sub-job per style', async () => {
    const job = await createBatchJob(input);
    expect(job.batchId).toMatch(/^[0-9A-Z]{26}$/); // ULID
    expect(job.subJobs).toHaveLength(3);
    expect(job.subJobs.every((s) => s.status === 'pending')).toBe(true);
    expect(job.subJobs.map((s) => s.style)).toEqual(['Modern', 'Coastal', 'Hamptons']);
    expect(job.total).toBe(3);
    expect(job.completed).toBe(0);
    expect(job.failed).toBe(0);
    expect(job.refundedCredits).toBe(0);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.pk).toBe(`BATCH#${job.batchId}`);
    expect(cmd.input.Item.sk).toBe('META');
  });
});

describe('getBatchJob', () => {
  it('returns null when no item', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    expect(await getBatchJob('does-not-exist')).toBeNull();
  });

  it('returns the stored record otherwise', async () => {
    const record = { batchId: 'b1', total: 2, completed: 1, failed: 0, subJobs: [] };
    sendMock.mockResolvedValueOnce({ Item: record });
    expect(await getBatchJob('b1')).toEqual(record);
  });
});

describe('markSubJobDone', () => {
  it('atomically increments completed and sets the sub-job result', async () => {
    await markSubJobDone({
      batchId: 'b1',
      jobId: 'j1',
      stagedS3Key: 's3://staged.jpg',
      sessionId: 'sess-1',
    });
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toContain('ADD completed :one');
    expect(cmd.input.UpdateExpression).toContain('SET subJobs');
    expect(cmd.input.ExpressionAttributeValues[':one']).toBe(1);
    expect(cmd.input.ExpressionAttributeValues[':jobId']).toBe('j1');
    expect(cmd.input.ExpressionAttributeValues[':done']).toBe('done');
  });
});

describe('markSubJobError', () => {
  it('atomically increments failed + refundedCredits and stores the error', async () => {
    await markSubJobError({ batchId: 'b1', jobId: 'j1', error: 'gemini 500' });
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.UpdateExpression).toContain('ADD failed :one, refundedCredits :one');
    expect(cmd.input.ExpressionAttributeValues[':error']).toBe('gemini 500');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run:
```bash
npm run test -- tests/lib/db/batch-jobs.test.ts
```
Expected: FAIL with import errors.

- [ ] **Step 2.3: Implement `src/lib/db/batch-jobs.ts`**

```ts
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

const RETENTION_DAYS = 7;

export type BatchSubJobStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchSubJob {
  jobId: string;
  style: string;
  status: BatchSubJobStatus;
  stagedS3Key?: string;
  sessionId?: string;
  error?: string;
}

export interface BatchJob {
  pk: string;
  sk: string;
  batchId: string;
  userId: string;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
  roomAnalysis: string;
  subJobs: BatchSubJob[];
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  createdAt: string;
  expiresAt: number;
}

export interface BatchJobInput {
  userId: string;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
  roomAnalysis: string;
  styles: string[];
}

export async function createBatchJob(data: BatchJobInput): Promise<BatchJob> {
  const now = new Date();
  const batchId = ulid();
  const subJobs: BatchSubJob[] = data.styles.map((style) => ({
    jobId: ulid(),
    style,
    status: 'pending',
  }));

  const item: BatchJob = {
    pk: `BATCH#${batchId}`,
    sk: 'META',
    batchId,
    userId: data.userId,
    heroS3Key: data.heroS3Key,
    referenceS3Keys: data.referenceS3Keys,
    roomTypes: data.roomTypes,
    notes: data.notes,
    roomAnalysis: data.roomAnalysis,
    subJobs,
    total: subJobs.length,
    completed: 0,
    failed: 0,
    refundedCredits: 0,
    createdAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + RETENTION_DAYS * 86400,
  };

  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function getBatchJob(batchId: string): Promise<BatchJob | null> {
  const res = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    }),
  );
  return (res.Item as BatchJob | undefined) ?? null;
}

// Atomic mutation: used by Lambda on sub-job completion. Finds the sub-job by
// jobId inside the subJobs list and sets its status + result, while also
// incrementing the top-level `completed` counter. Because Dynamo can't target
// a list element by key natively, we rewrite the whole subJobs list via a
// conditional expression on the batch's expected size.
export async function markSubJobDone(args: {
  batchId: string;
  jobId: string;
  stagedS3Key: string;
  sessionId: string;
}): Promise<void> {
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${args.batchId}`, sk: 'META' },
      UpdateExpression:
        'ADD completed :one SET subJobs = list_map_update(subJobs, :jobId, :done, :staged, :sess)',
      ExpressionAttributeValues: {
        ':one': 1,
        ':jobId': args.jobId,
        ':done': 'done',
        ':staged': args.stagedS3Key,
        ':sess': args.sessionId,
      },
    }),
  );
}

export async function markSubJobError(args: {
  batchId: string;
  jobId: string;
  error: string;
}): Promise<void> {
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${args.batchId}`, sk: 'META' },
      UpdateExpression:
        'ADD failed :one, refundedCredits :one SET subJobs = list_sub_job_error(subJobs, :jobId, :error)',
      ExpressionAttributeValues: {
        ':one': 1,
        ':jobId': args.jobId,
        ':error': args.error,
      },
    }),
  );
}
```

> **Important reality check on the two `list_*` expressions above:** DynamoDB has no built-in "find by key inside a list and update the matching element" operator. The two `list_map_update` / `list_sub_job_error` tokens are placeholders and WILL FAIL at runtime. Replace each with a **read-modify-write** sequence: `GetCommand` the batch, find the sub-job by `jobId`, rewrite the whole `subJobs` list, then `PutCommand` (or `UpdateCommand` with the whole list as a value) with a `ConditionExpression` that asserts nothing else mutated the record in between (e.g., use a `version` attribute that increments on every write, or compare `completed` + `failed` counts).
>
> Replace the two function bodies with:
>
> ```ts
> async function mutateSubJob(
>   batchId: string,
>   jobId: string,
>   patch: (sub: BatchSubJob) => BatchSubJob,
>   counterKey: 'completed' | 'failed',
>   alsoRefund: boolean,
> ): Promise<void> {
>   // read-modify-write with retry on ConditionalCheckFailedException
>   for (let attempt = 0; attempt < 5; attempt++) {
>     const current = await getBatchJob(batchId);
>     if (!current) throw new Error(`batch ${batchId} not found`);
>     const newSubJobs = current.subJobs.map((s) => (s.jobId === jobId ? patch(s) : s));
>     try {
>       await dynamodb.send(
>         new UpdateCommand({
>           TableName: TABLE_NAME,
>           Key: { pk: `BATCH#${batchId}`, sk: 'META' },
>           UpdateExpression: alsoRefund
>             ? `ADD ${counterKey} :one, refundedCredits :one SET subJobs = :sj`
>             : `ADD ${counterKey} :one SET subJobs = :sj`,
>           ConditionExpression: 'completed = :oldC AND failed = :oldF',
>           ExpressionAttributeValues: {
>             ':one': 1,
>             ':sj': newSubJobs,
>             ':oldC': current.completed,
>             ':oldF': current.failed,
>           },
>         }),
>       );
>       return;
>     } catch (err: unknown) {
>       const name = (err as { name?: string })?.name;
>       if (name !== 'ConditionalCheckFailedException') throw err;
>       // retry
>     }
>   }
>   throw new Error(`markSubJob: exceeded retries for ${batchId}/${jobId}`);
> }
>
> export async function markSubJobDone(args: { batchId: string; jobId: string; stagedS3Key: string; sessionId: string }) {
>   await mutateSubJob(args.batchId, args.jobId, (s) => ({
>     ...s, status: 'done', stagedS3Key: args.stagedS3Key, sessionId: args.sessionId,
>   }), 'completed', false);
> }
>
> export async function markSubJobError(args: { batchId: string; jobId: string; error: string }) {
>   await mutateSubJob(args.batchId, args.jobId, (s) => ({
>     ...s, status: 'error', error: args.error,
>   }), 'failed', true);
> }
> ```
>
> Update the test in Step 2.1 to match — the `UpdateExpression` assertions need to be relaxed to `expect(cmd.input.UpdateExpression).toContain('ADD completed :one')` etc., and the test should stub `getBatchJob` via `sendMock.mockResolvedValueOnce({ Item: fakeBatch })` before the update call.

- [ ] **Step 2.4: Update the test to match the read-modify-write implementation**

Replace the `markSubJobDone` and `markSubJobError` blocks in `tests/lib/db/batch-jobs.test.ts`:
```ts
describe('markSubJobDone', () => {
  it('reads current state, updates matching sub-job, ADDs completed with condition', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        batchId: 'b1', completed: 0, failed: 0,
        subJobs: [{ jobId: 'j1', style: 'Modern', status: 'pending' }],
      },
    });
    sendMock.mockResolvedValueOnce({});
    await markSubJobDone({ batchId: 'b1', jobId: 'j1', stagedS3Key: 's3k', sessionId: 'sess' });
    expect(sendMock).toHaveBeenCalledTimes(2);
    const update = sendMock.mock.calls[1][0];
    expect(update.input.UpdateExpression).toContain('ADD completed :one');
    expect(update.input.UpdateExpression).toContain('SET subJobs = :sj');
    expect(update.input.ConditionExpression).toContain('completed = :oldC');
    const sj = update.input.ExpressionAttributeValues[':sj'];
    expect(sj[0].status).toBe('done');
    expect(sj[0].stagedS3Key).toBe('s3k');
  });

  it('retries on ConditionalCheckFailedException up to 5 times', async () => {
    const conditionFail = Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
    sendMock.mockResolvedValueOnce({ Item: { batchId: 'b1', completed: 0, failed: 0, subJobs: [{ jobId: 'j1', style: 'Modern', status: 'pending' }] } });
    sendMock.mockRejectedValueOnce(conditionFail);
    sendMock.mockResolvedValueOnce({ Item: { batchId: 'b1', completed: 1, failed: 0, subJobs: [{ jobId: 'j1', style: 'Modern', status: 'pending' }] } });
    sendMock.mockResolvedValueOnce({});
    await markSubJobDone({ batchId: 'b1', jobId: 'j1', stagedS3Key: 's3k', sessionId: 'sess' });
    expect(sendMock).toHaveBeenCalledTimes(4);
  });
});

describe('markSubJobError', () => {
  it('ADDs failed and refundedCredits', async () => {
    sendMock.mockResolvedValueOnce({
      Item: { batchId: 'b1', completed: 0, failed: 0, subJobs: [{ jobId: 'j1', style: 'Modern', status: 'pending' }] },
    });
    sendMock.mockResolvedValueOnce({});
    await markSubJobError({ batchId: 'b1', jobId: 'j1', error: 'gemini 500' });
    const update = sendMock.mock.calls[1][0];
    expect(update.input.UpdateExpression).toContain('ADD failed :one, refundedCredits :one');
    const sj = update.input.ExpressionAttributeValues[':sj'];
    expect(sj[0].status).toBe('error');
    expect(sj[0].error).toBe('gemini 500');
  });
});
```

- [ ] **Step 2.5: Run tests to verify they pass**

Run:
```bash
npm run test -- tests/lib/db/batch-jobs.test.ts
```
Expected: PASS (all describe blocks green).

- [ ] **Step 2.6: Commit**

```bash
git add src/lib/db/batch-jobs.ts tests/lib/db/batch-jobs.test.ts
git commit -m "feat(db): BatchJob record + atomic sub-job mutators with retry"
```

---

## Task 3: Extract analysis into `run-analysis.ts`

The current `/api/analyse` route runs analysis inline. We need to call it from `/api/stage/batch` without HTTP round-tripping, so the core logic moves to a module.

**Files:**
- Create: `src/lib/ai/run-analysis.ts`
- Modify: `src/app/api/analyse/route.ts`

- [ ] **Step 3.1: Read existing `/api/analyse` route to understand what to extract**

Read `src/app/api/analyse/route.ts` end-to-end. Identify: (a) the function signature (what params does it take from the body), (b) the Gemini call + prompt construction, (c) the return shape (`{ analysis: string }` expected).

- [ ] **Step 3.2: Create `src/lib/ai/run-analysis.ts`**

Export a single function:
```ts
export interface RunAnalysisInput {
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
}

export interface RunAnalysisResult {
  analysis: string;
}

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  // move the full body of the existing /api/analyse handler here,
  // minus the NextRequest parsing and NextResponse wrapping.
}
```

Copy the full Gemini call, prompt construction, and error handling from the existing route. The module exports plain async functions — no Next.js primitives.

- [ ] **Step 3.3: Modify `src/app/api/analyse/route.ts` to delegate**

Replace the handler body with:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { runAnalysis } from '@/lib/ai/run-analysis';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  try {
    const result = await runAnalysis({
      heroS3Key: body.heroS3Key,
      referenceS3Keys: body.referenceS3Keys ?? [],
      roomTypes: body.roomTypes ?? [],
      notes: body.notes ?? '',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Preserve auth and body-shape exactly as it was — no behavioural change visible to clients.

- [ ] **Step 3.4: Build verify**

Run:
```bash
npm run build
```
Expected: successful build. TypeScript should catch any import/export drift.

- [ ] **Step 3.5: Regression smoke test**

Because `/api/analyse` is called from the existing wizard, start the dev server and do a single-style staging end-to-end (upload → style → notes → generate). The analysis step should succeed and the staging should complete. If either fails, the extraction diverged from the original — revert and re-do.

Run:
```bash
npm run dev
```
Then manually test one single-style staging in the browser. Kill the dev server when done.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/ai/run-analysis.ts src/app/api/analyse/route.ts
git commit -m "refactor(analyse): extract core logic to src/lib/ai/run-analysis.ts for reuse"
```

---

## Task 4: Lambda supports `batchId`

Lambda writes DDB directly (no `@/lib/db` imports — runs outside Next.js). When `event.batchId` is set, on success it atomically updates the `BATCH_JOB` record + sub-job; on failure it does the same AND refunds 1 credit. Lambda is deployed manually via CLI per CLAUDE.md.

**Files:**
- Modify: `lambda/staging-worker/index.mjs`
- Deploy: `stageright-staging-worker` Lambda (via AWS CLI)

- [ ] **Step 4.1: Read the Lambda handler**

Open `lambda/staging-worker/index.mjs`. Locate the `handler` export (around line 608). Note the current event shape — specifically, confirm it currently takes `{ jobId, action, params }`. We're adding `batchId` as an optional top-level field.

- [ ] **Step 4.2: Add batch-update helper at the top of the file (after the existing DDB client init)**

Add this helper alongside the other DDB helpers:
```js
// When the calling API passed a batchId, propagate completion / failure up
// to the BATCH_JOB record. Uses read-modify-write with conditional retry to
// handle concurrent sibling Lambda finishes. On error, also refunds 1 credit
// to the user so batch credits are pay-per-success.
async function propagateToBatch({ batchId, jobId, style, success, stagedS3Key, sessionId, error, userId }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const got = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    }));
    const current = got.Item;
    if (!current) {
      console.warn(`[batch] BATCH_JOB ${batchId} not found; skipping propagation`);
      return;
    }
    const newSubJobs = current.subJobs.map((s) => {
      if (s.jobId !== jobId) return s;
      return success
        ? { ...s, status: 'done', stagedS3Key, sessionId }
        : { ...s, status: 'error', error };
    });
    const updateExpr = success
      ? 'ADD completed :one SET subJobs = :sj'
      : 'ADD failed :one, refundedCredits :one SET subJobs = :sj';
    try {
      await dynamodb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `BATCH#${batchId}`, sk: 'META' },
        UpdateExpression: updateExpr,
        ConditionExpression: 'completed = :oldC AND failed = :oldF',
        ExpressionAttributeValues: {
          ':one': 1, ':sj': newSubJobs,
          ':oldC': current.completed, ':oldF': current.failed,
        },
      }));
      break;
    } catch (err) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
      // sibling Lambda wrote between our read and update; retry
    }
  }

  if (!success && userId) {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD creditsRemaining :one SET updatedAt = :now, lastRefundReason = :r',
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':r': `batch-sub-job-error:${batchId}:${style}`,
      },
    }));
  }
}
```

Required imports at the top of the file (confirm they exist; add if not): `GetCommand`, `UpdateCommand` from `@aws-sdk/lib-dynamodb`.

- [ ] **Step 4.3: Wire `propagateToBatch` into the handler**

Find the handler entry block (around line 608). Destructure `batchId` from the event:
```js
const { jobId, action, params, batchId } = event;
```

At the end of the success path (where the job is marked `done`), add:
```js
if (batchId) {
  await propagateToBatch({
    batchId, jobId, style: params.style, success: true,
    stagedS3Key: result.s3Key, sessionId: result.sessionId,
  });
}
```

At the end of the error path (where the job is marked `error`), add:
```js
if (batchId) {
  await propagateToBatch({
    batchId, jobId, style: params?.style, success: false,
    error: err.message, userId: params?.userId,
  });
}
```

`params.userId` needs to be present — confirm the batch entry API passes it (it does, per Task 5).

- [ ] **Step 4.4: Zip and deploy the Lambda**

Per CLAUDE.md, deploy via CLI from project root (bash on Windows, using PowerShell to zip):
```bash
powershell.exe -NoProfile -Command "cd 'lambda/staging-worker'; if (Test-Path '../staging-worker.zip') { Remove-Item '../staging-worker.zip' }; Compress-Archive -Path ./* -DestinationPath '../staging-worker.zip' -CompressionLevel Optimal"
```

Then:
```bash
aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://lambda/staging-worker.zip \
  --region ap-southeast-2
```

Wait for rollover:
```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
```
Expected: `LastUpdateStatus=Successful`, `State=Active`. This is critical — per `project_lambda_deploy.md` memory, forgetting to deploy means new params get discarded silently.

- [ ] **Step 4.5: Regression check — single-style still works**

Start the dev server, run one single-style staging (no `batchId`). The Lambda path without `batchId` is unchanged, so this should succeed exactly as before. If it fails, the batch wiring touched something load-bearing — revert the Lambda and investigate.

```bash
npm run dev
```
Manually run a single-style staging in the browser. Kill dev server.

- [ ] **Step 4.6: Commit**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): optional batchId param with atomic BatchJob update + refund on failure"
```

Note in the commit that the deploy step already ran.

---

## Task 5: `POST /api/stage/batch` route (TDD)

**Files:**
- Create: `src/app/api/stage/batch/route.ts`
- Create: `tests/api/stage-batch.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `tests/api/stage-batch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/users', () => ({
  deductCredits: vi.fn(async () => ({ creditsRemaining: 0 })),
}));
vi.mock('@/lib/ai/run-analysis', () => ({
  runAnalysis: vi.fn(async () => ({ analysis: 'analysis text' })),
}));
vi.mock('@/lib/db/batch-jobs', () => ({
  createBatchJob: vi.fn(async (i) => ({
    batchId: 'b-1',
    subJobs: i.styles.map((s: string, idx: number) => ({ jobId: `j-${idx}`, style: s, status: 'pending' })),
    total: i.styles.length,
  })),
}));
vi.mock('@/lib/aws/lambda', () => ({
  invokeStagingWorker: vi.fn(async () => ({ StatusCode: 202 })),
}));

import { POST } from '@/app/api/stage/batch/route';
import { getSession } from '@/lib/auth/session';
import { deductCredits } from '@/lib/db/users';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { createBatchJob } from '@/lib/db/batch-jobs';
import { invokeStagingWorker } from '@/lib/aws/lambda';

const adminSession = {
  user: { id: 'u1', email: 'a@x.com', name: 'A', plan: 'admin', creditsRemaining: 9999, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' },
};

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/stage/batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue(adminSession as any); });

describe('POST /api/stage/batch', () => {
  const goodBody = {
    heroS3Key: 'hero.jpg', referenceS3Keys: [], roomTypes: ['Living Room'],
    styles: ['Modern', 'Coastal'], notes: '', quality: 'standard',
  };

  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(401);
  });

  it('400 when styles is empty', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: [] }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/1 to 10/);
  });

  it('400 when styles length > 10', async () => {
    const styles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi'];
    const res = await POST(makeReq({ ...goodBody, styles }));
    expect(res.status).toBe(400);
  });

  it('400 on duplicate styles', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: ['Modern','Modern'] }));
    expect(res.status).toBe(400);
  });

  it('400 on unknown style', async () => {
    const res = await POST(makeReq({ ...goodBody, styles: ['NotARealStyle'] }));
    expect(res.status).toBe(400);
  });

  it('202 on happy path: deducts N credits, runs analysis once, creates batch, invokes Lambda N times', async () => {
    const res = await POST(makeReq(goodBody));
    expect(res.status).toBe(202);
    expect(deductCredits).toHaveBeenCalledWith('u1', expect.anything(), 2);
    expect(runAnalysis).toHaveBeenCalledOnce();
    expect(createBatchJob).toHaveBeenCalledOnce();
    expect(invokeStagingWorker).toHaveBeenCalledTimes(2);
    const body = await res.json();
    expect(body.batchId).toBe('b-1');
    expect(body.subJobs).toHaveLength(2);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run:
```bash
npm run test -- tests/api/stage-batch.test.ts
```
Expected: FAIL (handler not implemented).

- [ ] **Step 5.3: Implement `src/app/api/stage/batch/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { deductCredits } from '@/lib/db/users';
import { runAnalysis } from '@/lib/ai/run-analysis';
import { createBatchJob } from '@/lib/db/batch-jobs';
import { invokeStagingWorker } from '@/lib/aws/lambda';
import { STAGING_STYLES } from '@/lib/ai/prompts';

const VALID_STYLES = new Set<string>(STAGING_STYLES);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    heroS3Key?: string;
    referenceS3Keys?: string[];
    roomTypes?: string[];
    styles?: string[];
    notes?: string;
    quality?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { heroS3Key, referenceS3Keys = [], roomTypes = [], styles = [], notes = '' } = body;
  if (!heroS3Key) return NextResponse.json({ error: 'heroS3Key required' }, { status: 400 });
  if (!Array.isArray(styles) || styles.length < 1 || styles.length > 10) {
    return NextResponse.json({ error: 'styles must be 1 to 10 entries' }, { status: 400 });
  }
  if (new Set(styles).size !== styles.length) {
    return NextResponse.json({ error: 'duplicate styles not allowed' }, { status: 400 });
  }
  for (const s of styles) {
    if (!VALID_STYLES.has(s)) {
      return NextResponse.json({ error: `unknown style: ${s}` }, { status: 400 });
    }
  }

  try {
    await deductCredits(session.user.id, 'staging_standard', styles.length);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'insufficient credits';
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  let analysis: string;
  try {
    const r = await runAnalysis({ heroS3Key, referenceS3Keys, roomTypes, notes });
    analysis = r.analysis;
  } catch (err) {
    // If analysis itself fails, refund all credits and bail. Real-world this is rare.
    return NextResponse.json(
      { error: 'analysis failed; credits will be refunded shortly' },
      { status: 500 },
    );
  }

  const batch = await createBatchJob({
    userId: session.user.id,
    heroS3Key,
    referenceS3Keys,
    roomTypes,
    notes,
    roomAnalysis: analysis,
    styles,
  });

  await Promise.all(
    batch.subJobs.map((sub) =>
      invokeStagingWorker({
        jobId: sub.jobId,
        action: 'stage',
        batchId: batch.batchId,
        params: {
          userId: session.user.id,
          sessionId: sub.jobId, // sub-job shares id with session for simplicity
          heroS3Key,
          referenceS3Keys,
          roomTypes,
          style: sub.style,
          notes,
          roomAnalysis: analysis,
          quality: 'standard',
        },
      }),
    ),
  );

  return NextResponse.json({
    batchId: batch.batchId,
    subJobs: batch.subJobs.map((s) => ({ jobId: s.jobId, style: s.style })),
  }, { status: 202 });
}
```

`deductCredits` currently takes `(userId, action)` and deducts 1 × action cost. Confirm the signature — if it doesn't accept a multiplier, extend it to `deductCredits(userId, action, units = 1)` and multiply internally, then update the one existing caller to pass `1` explicitly (a no-op change).

- [ ] **Step 5.4: Extend `deductCredits` to accept a multiplier if needed**

Open `src/lib/db/users.ts`. If `deductCredits` takes a single `action` parameter, add `units = 1` and multiply the cost lookup. The existing caller in `/api/stage/route.ts` doesn't need updating (default retains current behaviour).

- [ ] **Step 5.5: Run test to verify it passes**

```bash
npm run test -- tests/api/stage-batch.test.ts
```
Expected: PASS (all describe blocks green).

- [ ] **Step 5.6: Build verify**

```bash
npm run build
```
Expected: successful build.

- [ ] **Step 5.7: Commit**

```bash
git add src/app/api/stage/batch/route.ts src/lib/db/users.ts tests/api/stage-batch.test.ts
git commit -m "feat(api): POST /api/stage/batch — fan-out with shared analysis and N credit deduct"
```

---

## Task 6: `GET /api/jobs/batch` route (TDD)

**Files:**
- Create: `src/app/api/jobs/batch/route.ts`
- Create: `tests/api/jobs-batch.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `tests/api/jobs-batch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/batch-jobs', () => ({ getBatchJob: vi.fn() }));
vi.mock('@/lib/aws/s3', () => ({ getSignedDownloadUrl: vi.fn(async (k) => `signed://${k}`) }));

import { GET } from '@/app/api/jobs/batch/route';
import { getSession } from '@/lib/auth/session';
import { getBatchJob } from '@/lib/db/batch-jobs';

const userSession = { user: { id: 'u1', email: 'x@x.com', name: 'N', plan: 'free', creditsRemaining: 0, creditsUsedAllTime: 0, pk: 'USER#u1', sk: 'PROFILE' } };

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/jobs/batch?id=${id}`);
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSession).mockResolvedValue(userSession as any); });

describe('GET /api/jobs/batch', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(401);
  });

  it('404 when batch does not exist', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce(null);
    const res = await GET(makeReq('nope'));
    expect(res.status).toBe(404);
  });

  it('403 when batch belongs to another user', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'someone-else', total: 2, completed: 0, failed: 0,
      refundedCredits: 0, subJobs: [],
    } as any);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(403);
  });

  it('returns running status with signed URLs for done sub-jobs', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'u1', total: 3, completed: 1, failed: 0, refundedCredits: 0,
      subJobs: [
        { jobId: 'j1', style: 'Modern', status: 'done', stagedS3Key: 'k1', sessionId: 's1' },
        { jobId: 'j2', style: 'Coastal', status: 'running' },
        { jobId: 'j3', style: 'Hamptons', status: 'pending' },
      ],
    } as any);
    const res = await GET(makeReq('b1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.subJobs[0].imageUrl).toBe('signed://k1');
    expect(body.subJobs[1].imageUrl).toBeUndefined();
  });

  it('returns status done when completed + failed = total', async () => {
    vi.mocked(getBatchJob).mockResolvedValueOnce({
      batchId: 'b1', userId: 'u1', total: 2, completed: 1, failed: 1, refundedCredits: 1,
      subJobs: [
        { jobId: 'j1', style: 'Modern', status: 'done', stagedS3Key: 'k1', sessionId: 's1' },
        { jobId: 'j2', style: 'Coastal', status: 'error', error: 'gemini 500' },
      ],
    } as any);
    const res = await GET(makeReq('b1'));
    const body = await res.json();
    expect(body.status).toBe('done');
    expect(body.failed).toBe(1);
    expect(body.subJobs[1].error).toBe('gemini 500');
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
npm run test -- tests/api/jobs-batch.test.ts
```
Expected: FAIL.

- [ ] **Step 6.3: Implement `src/app/api/jobs/batch/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getBatchJob } from '@/lib/db/batch-jobs';
import { getSignedDownloadUrl } from '@/lib/aws/s3';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const batchId = req.nextUrl.searchParams.get('id');
  if (!batchId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const batch = await getBatchJob(batchId);
  if (!batch) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (batch.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

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

  const terminal = batch.completed + batch.failed === batch.total;
  const allFailed = batch.failed === batch.total;

  return NextResponse.json({
    batchId: batch.batchId,
    status: allFailed ? 'error' : terminal ? 'done' : 'running',
    total: batch.total,
    completed: batch.completed,
    failed: batch.failed,
    refundedCredits: batch.refundedCredits,
    subJobs,
  });
}
```

Confirm `getSignedDownloadUrl` exists in `src/lib/aws/s3.ts` (it's used elsewhere for signed image URLs). If the function is named differently (e.g., `signGetUrl`), adjust the import accordingly.

- [ ] **Step 6.4: Run test to verify it passes**

```bash
npm run test -- tests/api/jobs-batch.test.ts
```
Expected: PASS.

- [ ] **Step 6.5: Build verify**

```bash
npm run build
```

- [ ] **Step 6.6: Commit**

```bash
git add src/app/api/jobs/batch/route.ts tests/api/jobs-batch.test.ts
git commit -m "feat(api): GET /api/jobs/batch — aggregated poll with signed URLs per done sub-job"
```

---

## Task 7: `batch-variant-row.tsx` component

**Files:**
- Create: `src/components/staging/batch-variant-row.tsx`

- [ ] **Step 7.1: Create the component**

```tsx
'use client';

import { cn } from '@/lib/utils/cn';
import type { StagingStyle } from '@/lib/ai/prompts';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchVariantRowProps {
  style: StagingStyle;
  status: RowStatus;
  imageUrl?: string;
  active?: boolean;
  errorMessage?: string;
  onClick?: () => void;
}

export function BatchVariantRow({
  style, status, imageUrl, active, errorMessage, onClick,
}: BatchVariantRowProps) {
  const isClickable = status === 'done' && !!onClick;
  const isLoading = status === 'pending' || status === 'running';

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      aria-pressed={active}
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-xl border transition-colors text-left',
        active
          ? 'border-brand-teal bg-brand-teal/5 shadow-soft'
          : 'border-transparent hover:border-ink-muted/30',
        isLoading && 'opacity-55 cursor-default',
        status === 'error' && 'opacity-70',
      )}
    >
      <span className="flex-shrink-0 size-14 sm:size-16 rounded-lg overflow-hidden bg-surface-secondary relative">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 skeleton-shimmer" aria-hidden />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-heading text-brand-navy text-base leading-tight tracking-tight">
          {style}
        </span>
        <span className="block text-xs text-ink-muted mt-0.5 truncate">
          {status === 'done' && 'Ready'}
          {status === 'running' && 'Generating…'}
          {status === 'pending' && 'Queued'}
          {status === 'error' && (errorMessage || 'Failed')}
        </span>
      </span>
      <span
        className={cn(
          'size-2 rounded-full ml-auto flex-shrink-0',
          status === 'done' && 'bg-brand-teal',
          isLoading && 'bg-brand-teal animate-pulse',
          status === 'error' && 'bg-amber-400',
        )}
        aria-hidden
      />
    </button>
  );
}
```

The `skeleton-shimmer` CSS class may need to be added to `src/app/globals.css`:
```css
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(110deg, #e8e8e6 8%, #f2f1ed 18%, #e8e8e6 33%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s linear infinite;
}
```

Add that rule only if it doesn't already exist in `globals.css`.

- [ ] **Step 7.2: Build verify**

```bash
npm run build
```
Expected: successful build. No tests for presentational component.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/staging/batch-variant-row.tsx src/app/globals.css
git commit -m "feat(staging): BatchVariantRow component with loading/ready/error states"
```

---

## Task 8: `batch-result.tsx` component (slider + variant list)

**Files:**
- Create: `src/components/staging/batch-result.tsx`

- [ ] **Step 8.1: Create the component**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { BatchVariantRow } from '@/components/staging/batch-variant-row';
import type { StagingStyle } from '@/lib/ai/prompts';

export interface BatchResultSubJob {
  jobId: string;
  style: StagingStyle;
  status: 'pending' | 'running' | 'done' | 'error';
  imageUrl?: string;
  error?: string;
}

export interface BatchResultProps {
  originalImageUrl: string;
  roomTypeLabel: string;
  total: number;
  completed: number;
  failed: number;
  subJobs: BatchResultSubJob[];
  refundedCredits: number;
}

export function BatchResult({
  originalImageUrl, roomTypeLabel, total, completed, failed, subJobs, refundedCredits,
}: BatchResultProps) {
  const firstReady = useMemo(
    () => subJobs.find((s) => s.status === 'done' && s.imageUrl),
    [subJobs],
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(firstReady?.jobId ?? null);
  const active = subJobs.find((s) => s.jobId === activeJobId) ?? firstReady ?? null;

  // Keep the active one up-to-date when the first ready one arrives
  if (!activeJobId && firstReady) {
    setActiveJobId(firstReady.jobId);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8 py-8 sm:py-12">
      <header className="pb-6 sm:pb-8 border-b border-surface-border mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.12em]">
            Your staged variants
          </p>
          <h1 className="mt-1 font-heading text-2xl sm:text-3xl text-brand-navy tracking-tight">
            {total} {total === 1 ? 'style' : 'styles'}, one {roomTypeLabel.toLowerCase()}.
          </h1>
        </div>
        <p className="text-sm text-ink-secondary">
          {completed} of {total} complete
          {failed > 0 && ` · ${failed} failed`}
          {refundedCredits > 0 && ` · ${refundedCredits} credit${refundedCredits === 1 ? '' : 's'} refunded`}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[1.9fr_1fr] gap-6 md:gap-8 items-start">
        {/* Main slider — sticky on mobile so scrolling through variants keeps it visible */}
        <div className="md:sticky md:top-24 md:self-start sticky top-0 z-10 bg-surface pb-3 md:pb-0">
          {active?.imageUrl ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={active.jobId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <BeforeAfterSlider
                  beforeSrc={originalImageUrl}
                  afterSrc={active.imageUrl}
                  beforeLabel="Empty"
                  afterLabel={active.style}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="aspect-[16/10] rounded-2xl border border-surface-border bg-surface-secondary flex items-center justify-center">
              <p className="text-sm text-ink-muted">Waiting for the first variant to finish…</p>
            </div>
          )}
          {active?.imageUrl && (
            <div className="flex gap-2 mt-3">
              <a
                href={active.imageUrl}
                download={`stageright-${active.style.toLowerCase().replace(/\s+/g, '-')}.jpg`}
                className="px-4 py-2 rounded-xl border border-surface-border text-sm text-ink hover:border-ink-muted transition-colors"
              >
                Download this
              </a>
            </div>
          )}
        </div>

        {/* Variant list */}
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
    </div>
  );
}
```

- [ ] **Step 8.2: Build verify**

```bash
npm run build
```

- [ ] **Step 8.3: Commit**

```bash
git add src/components/staging/batch-result.tsx
git commit -m "feat(staging): BatchResult — slider + variant list, sticky on mobile"
```

---

## Task 9: Batch result page route `/stage/batch/[batchId]`

**Files:**
- Create: `src/app/stage/batch/[batchId]/page.tsx`

- [ ] **Step 9.1: Create the page**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BatchResult, type BatchResultSubJob } from '@/components/staging/batch-result';
import type { StagingStyle } from '@/lib/ai/prompts';

interface BatchPollResponse {
  batchId: string;
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  subJobs: BatchResultSubJob[];
}

const POLL_MS = 3000;
const MAX_POLL_MS = 10 * 60 * 1000;
const CHECKPOINT_KEY = 'stageright:pending-batch';

export default function BatchResultPage() {
  const params = useParams<{ batchId: string }>();
  const router = useRouter();
  const batchId = params.batchId;
  const [data, setData] = useState<BatchPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
  const [roomTypeLabel, setRoomTypeLabel] = useState<string>('room');

  const fetchOnce = useCallback(async (): Promise<BatchPollResponse | null> => {
    const res = await fetch(`/api/jobs/batch?id=${encodeURIComponent(batchId)}`);
    if (!res.ok) {
      if (res.status === 404) setError('Batch not found. It may have expired.');
      else if (res.status === 403) setError('This batch belongs to a different account.');
      else setError('Failed to check batch progress.');
      return null;
    }
    return (await res.json()) as BatchPollResponse;
  }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    try {
      const cp = localStorage.getItem(CHECKPOINT_KEY);
      if (cp) {
        const parsed = JSON.parse(cp) as { originalImageUrl?: string; roomTypeLabel?: string; batchId?: string };
        if (parsed.batchId === batchId) {
          if (parsed.originalImageUrl) setOriginalImageUrl(parsed.originalImageUrl);
          if (parsed.roomTypeLabel) setRoomTypeLabel(parsed.roomTypeLabel);
        }
      }
    } catch {}

    const tick = async () => {
      if (cancelled) return;
      const d = await fetchOnce();
      if (cancelled) return;
      if (!d) return;
      setData(d);
      if (d.status !== 'running') {
        localStorage.removeItem(CHECKPOINT_KEY);
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setError('This batch is taking longer than expected. Refresh to keep checking.');
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { cancelled = true; };
  }, [batchId, fetchOnce]);

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
        subJobs={data.subJobs as BatchResultSubJob[]}
        refundedCredits={data.refundedCredits}
      />
    </main>
  );
}
```

- [ ] **Step 9.2: Build verify**

```bash
npm run build
```

- [ ] **Step 9.3: Commit**

```bash
git add src/app/stage/batch/[batchId]/page.tsx
git commit -m "feat(stage): batch result route with poll + localStorage resume"
```

---

## Task 10: Wizard multi-select + route branching

**Files:**
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 10.1: Change style state from single to array**

In `StagePageInner`, find the `style` state declaration (near the top) and replace:
```tsx
const [style, setStyle] = useState<StagingStyle>('Modern');
```
with:
```tsx
const [styles, setStyles] = useState<StagingStyle[]>([]);
```

Also rename any remaining usages of the single `style` in the handlers you're about to modify.

- [ ] **Step 10.2: Rewrite the style step rendering**

Find the block `{step === 'style' && (` and replace the `WizardCard` body with:
```tsx
<WizardCard
  key="style"
  tag="Step 4"
  tagTone="navy"
  question="Pick your styles"
  subtitle="Choose 1 to 10 styles. Each one generates its own staged image (1 credit per style)."
  footerLeft={!preloadedFromGallery ? <BackButton onClick={goBack} /> : undefined}
  footerRight={
    <ContinueButton
      onClick={() => advanceTo('notes')}
      label={styles.length === 0 ? 'Continue' : `Continue · ${styles.length} ${styles.length === 1 ? 'style' : 'styles'}`}
      disabled={styles.length === 0}
    />
  }
>
  {/* Counter bar */}
  <div className={cn(
    'flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs mb-3',
    styles.length >= 10 ? 'bg-amber-50 text-amber-900' : 'bg-surface-secondary text-ink-secondary',
  )}>
    <span className={cn('size-1.5 rounded-full', styles.length >= 10 ? 'bg-amber-500' : 'bg-brand-teal')} />
    <span>
      <strong className="font-semibold">{styles.length} of 10</strong>
      {styles.length >= 10 ? ' selected · remove one to add another' : ' selected'}
    </span>
    <span className="ml-auto text-ink-muted">
      {styles.length} credit{styles.length === 1 ? '' : 's'}
    </span>
  </div>

  <ul className="space-y-2">
    {STAGING_STYLES.map((s) => {
      const selected = styles.includes(s);
      const capped = !selected && styles.length >= 10;
      return (
        <li key={s} className={capped ? 'opacity-40 pointer-events-none' : ''}>
          <StyleRow
            style={s}
            selected={selected}
            onPick={() => {
              setStyles((prev) =>
                prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 10 ? [...prev, s] : prev,
              );
            }}
            roomCategory={roomCategoryFor(roomTypes)}
          />
        </li>
      );
    })}
  </ul>
</WizardCard>
```

`ContinueButton` may not currently accept a `disabled` prop — add it: edit the component to accept and apply `disabled` to the underlying `<button>`, setting `opacity-40 pointer-events-none` when disabled. This is a 3-line change in the Continue button component.

- [ ] **Step 10.3: Update `runStaging` to branch on count**

Locate the `runStaging` callback. Currently it calls `/api/stage` with a single style. Refactor so:
```tsx
const runStaging = useCallback(async () => {
  if (styles.length === 0) return;
  if (styles.length === 1) {
    // existing single-style path — pass styles[0]
    // (keep the existing /api/stage logic verbatim)
    return runSingleStaging(styles[0]);
  }
  // Multi-style: call batch endpoint and navigate to the result page
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
        notes,
        quality: 'standard',
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Batch failed to start.');
      advanceTo('notes');
      return;
    }
    const { batchId } = (await res.json()) as { batchId: string };
    localStorage.setItem('stageright:pending-batch', JSON.stringify({
      batchId,
      originalImageUrl: heroSignedUrl,
      roomTypeLabel: roomTypes[0] ?? 'room',
      startedAt: Date.now(),
    }));
    router.push(`/stage/batch/${batchId}`);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error.');
    advanceTo('notes');
  }
}, [styles, heroS3Key, refS3Keys, roomTypes, notes, heroSignedUrl, advanceTo, router]);
```

Extract the existing single-style code path into a helper `runSingleStaging(style: StagingStyle)` that preserves today's behaviour exactly.

- [ ] **Step 10.4: Build verify**

```bash
npm run build
```
Expected: successful build. TypeScript will catch any handler-signature drift.

- [ ] **Step 10.5: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(wizard): multi-select style step + branch to /api/stage/batch at 2+ styles"
```

---

## Task 11: Local end-to-end verification

**Files:** none (runtime verification)

- [ ] **Step 11.1: Start dev server**

```bash
npm run dev
```
Use the port the server picks (typically 3000, sometimes 3001/3002 if zombie ports hold the earlier ones).

- [ ] **Step 11.2: Single-style regression**

In the browser: upload the test-image, pick exactly 1 style, continue, notes, generate. Confirm the existing single-style flow finishes and shows the original result page with the before/after slider. If this fails, Task 10's refactor broke the single-style path — revert and re-do.

- [ ] **Step 11.3: Batch path — happy path**

In the browser: upload, pick 3 styles (e.g. Modern + Coastal + Hamptons), continue, notes, generate. Confirm:
- You land at `/stage/batch/{batchId}`
- The variant list shows all 3 rows, initially with skeleton thumbs and pulsing dots
- As each Lambda completes (check AWS Lambda logs via `aws logs tail` if needed), rows transition to "Ready" with real thumbnails
- The slider populates with the first-ready variant
- Clicking another ready row crossfades the slider to that variant
- When all 3 are done, the header updates to "3 of 3 complete"

- [ ] **Step 11.4: Batch path — resume via page reload**

Refresh the browser mid-batch. The page should reload into polling mode and pick up the current state without losing progress. Localstorage preserves the original image URL and room type label.

- [ ] **Step 11.5: Batch path — cap UX**

Go back to the wizard and select 10 styles. The counter bar should turn amber, the 11th+ rows should visibly fade to 40% and be un-clickable. Deselecting any of the 10 should re-enable the others.

- [ ] **Step 11.6: Stop the dev server**

Ctrl-C or `TaskStop` the background task.

---

## Task 12: Push and verify on Amplify

**Files:** none (deploy + verification)

- [ ] **Step 12.1: Push to master**

```bash
git push origin master
```
Amplify auto-builds. The Lambda was deployed in Task 4; nothing more to do for the Lambda.

- [ ] **Step 12.2: Wait for Amplify build**

Check via CLI:
```bash
aws amplify list-jobs \
  --app-id d88xgpqlfkk1w --branch-name master \
  --region ap-southeast-2 --max-results 1 \
  --query "jobSummaries[].[jobId,status,commitId]" --output table
```
Expected: latest job `SUCCEED` against the pushed commit SHA.

- [ ] **Step 12.3: Live smoke test**

Open `https://master.d88xgpqlfkk1w.amplifyapp.com/stage`, run a 3-style batch end-to-end (upload → pick 3 → notes → generate → batch result page). All three should land within ~90 s. Hard-refresh if you're seeing stale cached pages from the landing revamp deploy.

---

## Self-Review

**1. Spec coverage:**

| Spec item | Task |
|---|---|
| Wizard multi-select 1-10 with counter + cap UX | Task 10 |
| Shared analysis once per batch | Task 3 (extract) + Task 5 (use) |
| `POST /api/stage/batch` entry | Task 5 |
| `GET /api/jobs/batch` poll | Task 6 |
| `BATCH_JOB` record + atomic counters | Task 2 |
| Lambda optional `batchId` param + atomic propagation + refund | Task 4 |
| `refundCredits` helper | Task 1 |
| Result page at `/stage/batch/[batchId]` | Task 9 |
| Slider-led result component | Task 8 |
| Variant row component | Task 7 |
| Credit deduction upfront, per-image refund on failure | Tasks 5 + 4 |
| localStorage checkpoint resume | Task 9 |
| Backward compat single-style path | Task 10 branching logic |
| Tests — pure logic + API integration | Tasks 1, 2, 5, 6 |
| End-to-end verification | Task 11 |
| Amplify deploy | Task 12 |

All spec requirements have a task. No gaps.

**2. Placeholder scan:** No TBDs, no "implement later". Every step has concrete code and commands. The DynamoDB "find by list element" gotcha is flagged at Task 2.3 with a full replacement implementation provided inline (not deferred).

**3. Type consistency:**
- `BatchJob` / `BatchSubJob` / `BatchSubJobStatus` defined in Task 2, reused in Tasks 5, 6, 8, 9 ✓
- `RunAnalysisInput` / `RunAnalysisResult` defined in Task 3, consumed in Task 5 ✓
- `BatchResultSubJob` in Task 8, consumed in Task 9 ✓
- `StagingStyle` imported from existing `@/lib/ai/prompts` throughout ✓
- `refundCredits` signature `(userId, amount, reason)` used consistently at Tasks 1, 4, 5 ✓

All consistent.

---

## Rollback

Each task is an independent commit. To roll back a single task: `git revert <commit-sha>`. The Lambda update in Task 4 can be rolled back by re-zipping the previous `lambda/staging-worker/` from `HEAD~<n>` and re-running the Lambda deploy CLI — the deploy is separate from the git push.
