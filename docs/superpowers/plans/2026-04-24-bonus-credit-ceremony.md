# Bonus Credit Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the every-7-stages free-credit bonus — server-side exactly-once grant, client-side celebration moment (envelope + counter pulse) on the result screen, and full copy sweep from "regeneration" vocabulary to "free credit" vocabulary.

**Architecture:** Lambda writes both the completed sub-job AND calls a shared `recordStageCompletion` helper that atomically increments `User.stagesCompletedTotal`, grants `+1 creditsRemaining` on every 7th stage, and marks the triggering stage-job with `bonusTriggered: true`. The single-stage API route (`/api/stage`) calls the same helper inline. The batch poll route passes the `bonusTriggered` flag through to the client unchanged. Client-side, a new `BonusCreditEnvelope` rises with gold accent 1.5s after reveal-peak, and the existing `CreditBalance` gains a `pulse` prop that animates the number tick.

**Tech Stack:** Next.js 14 App Router (TypeScript strict), framer-motion 12, AWS SDK v3 (`@aws-sdk/lib-dynamodb`), vitest, AWS Lambda (Node 20).

**Spec:** `docs/superpowers/specs/2026-04-24-bonus-credit-ceremony-design.md`

---

## File Structure

**Create:**
- `src/lib/db/bonus-credit.ts` — `recordSingleStageCompletion`, `recordBatchSubJobCompletion`, shared `grantBonusIfDue` helper
- `src/components/staging/bonus-credit-envelope.tsx` — celebration surface
- `src/components/onboarding/bonus-credit-primer.tsx` — renamed from `regeneration-primer.tsx` with updated copy
- `tests/lib/db/bonus-credit.test.ts` — unit tests for helpers
- `tests/components/bonus-credit-envelope.test.tsx` — component tests

**Modify:**
- `src/types/index.ts` — User fields + PLANS.free.features copy
- `src/lib/db/batch-jobs.ts` — BatchSubJob fields
- `src/lib/db/stagings.ts` — Staging fields
- `src/components/staging/credit-balance.tsx` — `pulse` prop
- `src/components/staging/batch-result.tsx` — wire envelope + counter pulse
- `src/app/stage/page.tsx` — wire envelope + counter pulse on single-stage result
- `src/app/onboarding/onboarding-flow.tsx` — import rename (RegenerationPrimer → BonusCreditPrimer)
- `src/app/api/jobs/batch/route.ts` — pass `bonusTriggered` + `bonusStageCount` through
- `src/app/api/stage/route.ts` — call `recordSingleStageCompletion` after Staging write; return flags
- `lambda/staging-worker/index.mjs` — inline port of helper, call sites in batch + single paths, KEEP IN SYNC comment
- `src/components/landing/hero.tsx` — copy
- `src/components/landing/how-it-works.tsx` — copy + illustration refresh (rename `RegenerateIllustration` → `FreeCreditIllustration`)
- `src/components/landing/pricing.tsx` — copy
- `src/components/landing/comparison.tsx` — copy
- `src/components/landing/faq.tsx` — copy
- `src/components/landing/cta.tsx` — copy
- `src/components/onboarding/how-it-works-screen.tsx` — step 04 copy
- `src/app/layout.tsx` — metadata + FAQ structured data copy
- `CLAUDE.md` — policy section

**Delete:**
- `src/components/onboarding/regeneration-primer.tsx` — replaced by renamed file

---

## Task 1: Types + PLANS.free.features copy

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/db/batch-jobs.ts:9-17`
- Modify: `src/lib/db/stagings.ts:17-30`

- [ ] **Step 1: Branch off master**

```bash
git checkout master
git checkout -b feat/bonus-credit-ceremony
```

- [ ] **Step 2: Add User fields**

Modify `src/types/index.ts` around line 172 (after `firstStageAt`):

```typescript
  firstStageAt?: string | null;  // ISO timestamp; set atomically on first successful stage
  stagesCompletedTotal?: number; // monotonic counter; increments on each successful stage (batch or single). Default 0 for new/existing accounts.
  lastBonusStageCount?: number;  // stage-count value at which the last bonus was granted; exactly-once guard.
}
```

- [ ] **Step 3: Update PLANS.free.features copy**

Modify `src/types/index.ts` line 56:

```typescript
      '15 credits to start',
      'Photorealistic staging',
      'Earn a free credit every 7 stages',
```

- [ ] **Step 4: Extend BatchSubJob**

Modify `src/lib/db/batch-jobs.ts`, replace the `BatchSubJob` interface (lines 9-17):

```typescript
export interface BatchSubJob {
  jobId: string;
  style: string;
  status: BatchSubJobStatus;
  stagedS3Key?: string;
  sessionId?: string;
  error?: string;
  conciergeNotes?: string[];  // 0-4 room observations parsed by the Lambda; shown per-variant in the concierge-notes expander
  stageCounted?: boolean;     // set true when this sub-job has incremented User.stagesCompletedTotal; prevents double-count on Lambda retries
  bonusTriggered?: boolean;   // true if THIS sub-job crossed a 7-stage boundary and granted a bonus credit; client fires envelope when this variant reveals
  bonusStageCount?: number;   // stage-count value at the moment the bonus was granted (e.g. 7, 14, 21)
}
```

- [ ] **Step 5: Extend Staging**

Modify `src/lib/db/stagings.ts`, replace the `Staging` interface (lines 17-30):

```typescript
export interface Staging {
  pk: string;
  sk: string;
  id: string;
  userId: string;
  sessionId: string;
  style: string;
  roomTypes: string[];
  heroS3Key: string;
  stagedS3Key: string;
  notes?: string;
  createdAt: string;
  expiresAt: number;
  stageCounted?: boolean;
  bonusTriggered?: boolean;
  bonusStageCount?: number;
}
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/db/batch-jobs.ts src/lib/db/stagings.ts
git commit -m "types(bonus-credit): User stage counter + sub-job/staging tracking fields"
```

---

## Task 2: `recordStageCompletion` helper (TDD)

**Files:**
- Create: `src/lib/db/bonus-credit.ts`
- Create: `tests/lib/db/bonus-credit.test.ts`

- [ ] **Step 1: Check existing test infrastructure**

Read `tests/lib/db/first-stage.test.ts` (it already exists from PR #1). Use the same vitest + `@aws-sdk/client-dynamodb` mock pattern. Confirm `@aws-sdk/client-dynamodb` and `vitest` are present in devDependencies.

Run: `npx vitest run tests/lib/db/first-stage.test.ts`
Expected: PASS (existing tests pass, confirms infra works).

- [ ] **Step 2: Write the failing tests**

Create `tests/lib/db/bonus-credit.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

// Mock the shared DynamoDB client
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: DynamoDBDocumentClient.from({} as never),
  TABLE_NAME: 'stageright-test',
}));

import { dynamodb } from '@/lib/aws/dynamodb';
import {
  recordSingleStageCompletion,
  recordBatchSubJobCompletion,
} from '@/lib/db/bonus-credit';

const ddbMock = mockClient(dynamodb);

beforeEach(() => {
  ddbMock.reset();
});

describe('recordSingleStageCompletion', () => {
  it('short-circuits if stageCounted already set (idempotent on retry)', async () => {
    ddbMock.on(UpdateCommand).rejectsOnce(
      new ConditionalCheckFailedException({ message: 'already counted', $metadata: {} })
    );
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('increments counter, no bonus when newCount % 7 !== 0', async () => {
    // 1st call (guard): succeeds
    // 2nd call (increment user): succeeds, returns new count = 3
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 3 } }); // user increment
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
    expect(ddbMock.calls()).toHaveLength(2);
  });

  it('grants bonus when newCount crosses a 7-boundary', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } }) // user counter increment
      .resolvesOnce({ Attributes: { creditsRemaining: 9 } }) // user credit grant
      .resolvesOnce({}); // stage-job bonus marker (best-effort)
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 7,
      newCreditsRemaining: 9,
    });
    expect(ddbMock.calls()).toHaveLength(4);
  });

  it('returns bonusGranted: false if double-grant guard trips', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // stage-job guard
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } }) // counter increment
      .rejectsOnce(
        new ConditionalCheckFailedException({ message: 'already granted', $metadata: {} })
      ); // credit grant guard fails
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('grants bonus at 14 (second boundary)', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({})
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 14 } })
      .resolvesOnce({ Attributes: { creditsRemaining: 5 } })
      .resolvesOnce({});
    const result = await recordSingleStageCompletion({
      userId: 'u1',
      stagingPk: 'USER#u1',
      stagingSk: 'STAGING#2026-01-01T00:00:00Z#abc',
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 14,
      newCreditsRemaining: 5,
    });
  });
});

describe('recordBatchSubJobCompletion', () => {
  it('short-circuits if subJobs[i].stageCounted already set', async () => {
    ddbMock.on(UpdateCommand).rejectsOnce(
      new ConditionalCheckFailedException({ message: 'already counted', $metadata: {} })
    );
    const result = await recordBatchSubJobCompletion({
      userId: 'u1',
      batchId: 'batch1',
      subJobIndex: 0,
    });
    expect(result).toEqual({ bonusGranted: false });
  });

  it('grants bonus at boundary, targets subJobs[i] in DDB path', async () => {
    ddbMock
      .on(UpdateCommand)
      .resolvesOnce({}) // guard on subJobs[2]
      .resolvesOnce({ Attributes: { stagesCompletedTotal: 7 } })
      .resolvesOnce({ Attributes: { creditsRemaining: 4 } })
      .resolvesOnce({}); // subJobs[2] bonus marker
    const result = await recordBatchSubJobCompletion({
      userId: 'u1',
      batchId: 'batch1',
      subJobIndex: 2,
    });
    expect(result).toEqual({
      bonusGranted: true,
      newStageCount: 7,
      newCreditsRemaining: 4,
    });
    // Verify the guard UpdateExpression addressed subJobs[2]
    const guardCall = ddbMock.calls()[0].args[0].input as UpdateCommand['input'];
    expect(guardCall.UpdateExpression).toContain('subJobs[2].stageCounted');
    expect(guardCall.ConditionExpression).toContain('attribute_not_exists(subJobs[2].stageCounted)');
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npx vitest run tests/lib/db/bonus-credit.test.ts`
Expected: FAIL with "Cannot find module '@/lib/db/bonus-credit'" — the implementation file doesn't exist yet.

- [ ] **Step 4: Check for aws-sdk-client-mock**

Run: `cat package.json | grep aws-sdk-client-mock`
If missing: `npm install --save-dev aws-sdk-client-mock` and commit the lockfile update separately before continuing.

- [ ] **Step 5: Write the helper implementation**

Create `src/lib/db/bonus-credit.ts`:

```typescript
/**
 * Bonus-credit earn logic. Every 7 successful stages grants +1 creditsRemaining.
 * Atomic exactly-once via ConditionExpression on lastBonusStageCount.
 *
 * KEEP IN SYNC with lambda/staging-worker/index.mjs — an inline copy lives
 * there because the Lambda is bundled standalone. Any change here must be
 * mirrored in the Lambda file, then Lambda redeployed.
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

const BONUS_EVERY = 7;

type Result =
  | { bonusGranted: false }
  | { bonusGranted: true; newStageCount: number; newCreditsRemaining: number };

/**
 * Shared internal: increment the user's counter and grant a bonus if the new
 * count crosses a 7-boundary. Caller is responsible for the pre-guard (marking
 * the stage-job record so retries don't double-count).
 */
async function grantBonusIfDue(userId: string): Promise<Result> {
  // Increment counter. ConditionExpression: plan != 'admin' — skip bonus
  // pipeline entirely for admin without a separate Get. Failure on this guard
  // means the user is admin; return bonusGranted: false cleanly.
  let newCount: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD stagesCompletedTotal :one SET updatedAt = :now',
      ConditionExpression: '#plan <> :admin',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':admin': 'admin',
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCount = (res.Attributes?.stagesCompletedTotal as number) ?? 0;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  if (newCount <= 0 || newCount % BONUS_EVERY !== 0) {
    return { bonusGranted: false };
  }

  // Grant the bonus — exactly-once via lastBonusStageCount guard.
  let newCreditsRemaining: number;
  try {
    const res = await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :one SET lastBonusStageCount = :newCount, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(lastBonusStageCount) OR lastBonusStageCount <> :newCount',
      ExpressionAttributeValues: {
        ':one': 1,
        ':newCount': newCount,
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

  return { bonusGranted: true, newStageCount: newCount, newCreditsRemaining };
}

/**
 * Single-stage path. Guards via Staging record's `stageCounted` attribute.
 */
export async function recordSingleStageCompletion(params: {
  userId: string;
  stagingPk: string;
  stagingSk: string;
}): Promise<Result> {
  // Claim the Staging record (idempotent per record).
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: params.stagingPk, sk: params.stagingSk },
      UpdateExpression: 'SET stageCounted = :true',
      ConditionExpression: 'attribute_not_exists(stageCounted)',
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(params.userId);
  if (!result.bonusGranted) return result;

  // Best-effort: mark the Staging record with bonusTriggered so the client
  // can detect and fire the envelope.
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: params.stagingPk, sk: params.stagingSk },
      UpdateExpression: 'SET bonusTriggered = :true, bonusStageCount = :n',
      ExpressionAttributeValues: {
        ':true': true,
        ':n': result.newStageCount,
      },
    }));
  } catch {
    /* credit still granted; ceremony may not fire this time. Acceptable. */
  }

  return result;
}

/**
 * Batch path. Guards via BatchJob.subJobs[subJobIndex].stageCounted.
 */
export async function recordBatchSubJobCompletion(params: {
  userId: string;
  batchId: string;
  subJobIndex: number;
}): Promise<Result> {
  const i = params.subJobIndex;
  // Claim the sub-job (idempotent per sub-job).
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${params.batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].stageCounted = :true`,
      ConditionExpression: `attribute_not_exists(subJobs[${i}].stageCounted)`,
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(params.userId);
  if (!result.bonusGranted) return result;

  // Best-effort: mark the sub-job with bonusTriggered.
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${params.batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].bonusTriggered = :true, subJobs[${i}].bonusStageCount = :n`,
      ExpressionAttributeValues: {
        ':true': true,
        ':n': result.newStageCount,
      },
    }));
  } catch {
    /* credit granted; ceremony may not fire this time. Acceptable. */
  }

  return result;
}
```

- [ ] **Step 6: Run tests to confirm they pass**

Run: `npx vitest run tests/lib/db/bonus-credit.test.ts`
Expected: PASS (6/6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/bonus-credit.ts tests/lib/db/bonus-credit.test.ts
git commit -m "feat(bonus-credit): recordStageCompletion helpers with exactly-once grant guard"
```

---

## Task 3: Lambda inline port + call sites

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

- [ ] **Step 1: Locate the completion write points in the Lambda**

Read `lambda/staging-worker/index.mjs` and identify:
1. The `propagateToBatch` function (writes `subJobs[i].status = 'done'` and `completed += 1`).
2. The single-stage completion point (writes the Staging record into DDB).

- [ ] **Step 2: Inline the helpers into the Lambda**

Add these functions near the top of `lambda/staging-worker/index.mjs`, next to the existing inline `parseConciergeNotes` / `stripConciergeNotes`. Use a clear `KEEP IN SYNC` header:

```javascript
/**
 * KEEP IN SYNC with src/lib/db/bonus-credit.ts — inline because Lambda is bundled standalone.
 * Change either? Change both. Redeploy Lambda.
 */
const BONUS_EVERY = 7;

async function grantBonusIfDue(ddb, TABLE_NAME, userId) {
  let newCount = 0;
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD stagesCompletedTotal :one SET updatedAt = :now',
      ConditionExpression: '#plan <> :admin',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':admin': 'admin',
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCount = (res.Attributes && res.Attributes.stagesCompletedTotal) || 0;
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  if (newCount <= 0 || newCount % BONUS_EVERY !== 0) {
    return { bonusGranted: false };
  }

  let newCreditsRemaining = 0;
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :one SET lastBonusStageCount = :n, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(lastBonusStageCount) OR lastBonusStageCount <> :n',
      ExpressionAttributeValues: {
        ':one': 1,
        ':n': newCount,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCreditsRemaining = (res.Attributes && res.Attributes.creditsRemaining) || 0;
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  return { bonusGranted: true, newStageCount: newCount, newCreditsRemaining };
}

async function recordBatchSubJobCompletion(ddb, TABLE_NAME, { userId, batchId, subJobIndex }) {
  const i = subJobIndex;
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].stageCounted = :true`,
      ConditionExpression: `attribute_not_exists(subJobs[${i}].stageCounted)`,
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(ddb, TABLE_NAME, userId);
  if (!result.bonusGranted) return result;

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].bonusTriggered = :true, subJobs[${i}].bonusStageCount = :n`,
      ExpressionAttributeValues: { ':true': true, ':n': result.newStageCount },
    }));
  } catch {
    /* credit granted; marker failed — client won't ceremony this variant. Acceptable. */
  }

  return result;
}

async function recordSingleStageCompletion(ddb, TABLE_NAME, { userId, stagingPk, stagingSk }) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: stagingPk, sk: stagingSk },
      UpdateExpression: 'SET stageCounted = :true',
      ConditionExpression: 'attribute_not_exists(stageCounted)',
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(ddb, TABLE_NAME, userId);
  if (!result.bonusGranted) return result;

  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: stagingPk, sk: stagingSk },
      UpdateExpression: 'SET bonusTriggered = :true, bonusStageCount = :n',
      ExpressionAttributeValues: { ':true': true, ':n': result.newStageCount },
    }));
  } catch {
    /* acceptable */
  }

  return result;
}
```

- [ ] **Step 3: Wire the batch call site**

In `propagateToBatch` (or wherever the sub-job is marked `status = 'done'`), right AFTER the successful DDB write, call:

```javascript
// Earn a free credit every 7 stages (spec: 2026-04-24-bonus-credit-ceremony).
// Best-effort; errors here should NOT fail the staging pipeline.
try {
  await recordBatchSubJobCompletion(ddb, TABLE_NAME, {
    userId: batch.userId,
    batchId: batch.batchId,
    subJobIndex: i, // the array index of the sub-job just marked done
  });
} catch (err) {
  console.error('[bonus-credit] batch sub-job record failed', err);
}
```

Substitute `i` / `batch.userId` / `batch.batchId` with whatever variable names the surrounding Lambda code already uses. Only call on the `status = 'done'` success branch — not on error.

- [ ] **Step 4: Wire the single-stage call site**

Find where the Lambda writes the Staging record for single-stage (should be after a successful `PutCommand` that writes `STAGING#...`). Right AFTER the successful write, call:

```javascript
// Earn a free credit every 7 stages.
try {
  await recordSingleStageCompletion(ddb, TABLE_NAME, {
    userId: stagingItem.userId,
    stagingPk: stagingItem.pk,
    stagingSk: stagingItem.sk,
  });
} catch (err) {
  console.error('[bonus-credit] single-stage record failed', err);
}
```

Substitute variable names as required. If the Lambda does NOT handle single-stage completions (they're handled synchronously in `/api/stage/route.ts` instead), skip this step — the API route will handle it (Task 4).

- [ ] **Step 5: Commit (code only — Lambda redeploy happens in Task 10)**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): inline recordStageCompletion helpers + call sites (redeploy in Task 10)"
```

---

## Task 4: API route wiring

**Files:**
- Modify: `src/app/api/jobs/batch/route.ts`
- Modify: `src/app/api/stage/route.ts`

- [ ] **Step 1: Pass bonus flags through the batch poll response**

In `src/app/api/jobs/batch/route.ts`, find the `subJobs` mapping (currently lines 28-39) and extend it:

```typescript
  const subJobs = await Promise.all(
    batch.subJobs.map(async (s) => ({
      jobId: s.jobId,
      style: s.style,
      status: s.status,
      imageUrl: s.stagedS3Key ? await getSignedDownloadUrl(s.stagedS3Key) : undefined,
      s3Key: s.stagedS3Key,
      sessionId: s.sessionId,
      error: s.error,
      conciergeNotes: s.conciergeNotes ?? [],
      bonusTriggered: s.bonusTriggered ?? false,
      bonusStageCount: s.bonusStageCount,
    })),
  );
```

- [ ] **Step 2: Handle the single-stage path in /api/stage**

Read `src/app/api/stage/route.ts`. Locate the successful-completion block (after `createStaging(...)` returns and before the response). Add:

```typescript
import { recordSingleStageCompletion } from '@/lib/db/bonus-credit';

// ... existing code ...

const staging = await createStaging({ /* existing params */ });

// Earn a free credit every 7 stages (spec: 2026-04-24-bonus-credit-ceremony).
// Best-effort — don't let a bonus-credit failure break the staging response.
let bonusTriggered = false;
let bonusStageCount: number | undefined;
let updatedCreditsRemaining: number | undefined;
try {
  const result = await recordSingleStageCompletion({
    userId: session.user.id,
    stagingPk: staging.pk,
    stagingSk: staging.sk,
  });
  if (result.bonusGranted) {
    bonusTriggered = true;
    bonusStageCount = result.newStageCount;
    updatedCreditsRemaining = result.newCreditsRemaining;
  }
} catch (err) {
  console.error('[bonus-credit] single-stage record failed', err);
}

return NextResponse.json({
  // ... existing fields ...
  bonusTriggered,
  bonusStageCount,
  creditsRemaining: updatedCreditsRemaining ?? /* existing creditsRemaining value */,
});
```

Important: if the Lambda also writes the Staging record for single-stage, DO NOT also call `recordSingleStageCompletion` in both places — choose one. The guard prevents double-counting, but only one is semantically cleaner. Prefer the API route when the route writes the Staging synchronously; prefer Lambda when the Lambda owns the write. Verify which is the case by reading the route.

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (ignore pre-existing `<img>` warnings).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/jobs/batch/route.ts src/app/api/stage/route.ts
git commit -m "feat(api): pass bonusTriggered/bonusStageCount from Lambda to client"
```

---

## Task 5: `BonusCreditEnvelope` component

**Files:**
- Create: `src/components/staging/bonus-credit-envelope.tsx`
- Create: `tests/components/bonus-credit-envelope.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/bonus-credit-envelope.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { BonusCreditEnvelope } from '@/components/staging/bonus-credit-envelope';

describe('BonusCreditEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders copy with ARIA status role', () => {
    const onDismiss = vi.fn();
    render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={onDismiss} />
      </AnimatePresence>,
    );
    expect(screen.getByText('+1 free credit')).toBeInTheDocument();
    expect(screen.getByText(/because AI can be unpredictable/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('auto-dismisses after ~6 seconds', () => {
    const onDismiss = vi.fn();
    render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={onDismiss} />
      </AnimatePresence>,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest onDismiss via ref (doesn't reset the timer on parent re-render)', () => {
    const firstOnDismiss = vi.fn();
    const secondOnDismiss = vi.fn();
    const { rerender } = render(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={firstOnDismiss} />
      </AnimatePresence>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(
      <AnimatePresence>
        <BonusCreditEnvelope onDismiss={secondOnDismiss} />
      </AnimatePresence>,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(firstOnDismiss).not.toHaveBeenCalled();
    expect(secondOnDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run tests/components/bonus-credit-envelope.test.tsx`
Expected: FAIL with "Cannot find module '@/components/staging/bonus-credit-envelope'".

- [ ] **Step 3: Create the component**

Create `src/components/staging/bonus-credit-envelope.tsx`:

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface BonusCreditEnvelopeProps {
  onDismiss: () => void;
}

export function BonusCreditEnvelope({ onDismiss }: BonusCreditEnvelopeProps) {
  // Keep latest onDismiss in a ref so parent re-renders (inline arrow props)
  // don't tear down and restart the 6s timer. Pattern matches FirstStageWelcomeToast.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const id = setTimeout(() => onDismissRef.current(), 6000);
    return () => clearTimeout(id);
  }, []);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 1.5 }}
      className="fixed left-1/2 -translate-x-1/2 z-[60] bottom-4 sm:bottom-6 max-w-[420px] w-[calc(100vw-2rem)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 bg-brand-navy text-white rounded-2xl shadow-elevated border border-brand-gold/40 px-4 py-3.5 pr-2">
        <span className="flex-shrink-0 size-8 rounded-full bg-brand-gold/20 text-brand-gold flex items-center justify-center mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[14px] leading-snug">+1 free credit</p>
          <p className="text-[12px] text-white/70 leading-snug mt-0.5">
            On us, because AI can be unpredictable.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 size-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run tests/components/bonus-credit-envelope.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/staging/bonus-credit-envelope.tsx tests/components/bonus-credit-envelope.test.tsx
git commit -m "feat(bonus-credit): BonusCreditEnvelope celebration surface"
```

---

## Task 6: `CreditBalance` pulse prop

**Files:**
- Modify: `src/components/staging/credit-balance.tsx`

- [ ] **Step 1: Rewrite CreditBalance with pulse animation**

Replace `src/components/staging/credit-balance.tsx` entirely:

```typescript
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface CreditBalanceProps {
  credits: number;
  plan: string;
  pulse?: boolean;
  className?: string;
}

export function CreditBalance({ credits, plan, pulse, className }: CreditBalanceProps) {
  const isLow = credits <= 5 && plan !== 'admin';

  return (
    <motion.div
      animate={pulse ? {
        scale: [1, 1.08, 1],
        boxShadow: [
          '0 0 0 0 rgba(214, 168, 95, 0)',
          '0 0 0 10px rgba(214, 168, 95, 0.35)',
          '0 0 0 0 rgba(214, 168, 95, 0)',
        ],
      } : {}}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border',
        isLow
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-surface-secondary text-ink-secondary border-surface-border',
        className,
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {plan === 'admin' ? (
        'Unlimited'
      ) : (
        <span className="tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={credits}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="inline-block"
            >
              {credits}
            </motion.span>
          </AnimatePresence>
          {' credits'}
        </span>
      )}
    </motion.div>
  );
}
```

The colour `rgba(214, 168, 95, ...)` is the brand gold in RGB — check `tailwind.config.ts` for the actual hex if different, and update.

- [ ] **Step 2: Type-check + visual sanity**

Run: `npm run type-check`
Expected: PASS.

Run: `npm run build`
Expected: PASS (catches JSX apostrophe issues; we added none but run to be sure).

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/credit-balance.tsx
git commit -m "feat(credit-balance): pulse prop animates tick + gold glow on bonus"
```

---

## Task 7: Wire envelope + pulse into result screens

**Files:**
- Modify: `src/components/staging/batch-result.tsx`
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 1: Wire into BatchResult**

Read `src/components/staging/batch-result.tsx` to locate:
- The `activeVariant` / `activeSubJob` state
- The `onRevealPeak` handler on `BeforeAfterSlider`
- The `<FirstStageWelcomeToast>` render (if present) so we know the AnimatePresence pattern

Add:

```typescript
import { BonusCreditEnvelope } from '@/components/staging/bonus-credit-envelope';
import { AnimatePresence } from 'framer-motion';

// ... in the component body, alongside existing state:
const [showBonusEnvelope, setShowBonusEnvelope] = useState(false);
const [pulseCreditBalance, setPulseCreditBalance] = useState(false);

// Update the `onRevealPeak` handler (or wherever the lid-lift peak fires):
const handleRevealPeak = () => {
  // Existing: fire welcome-toast-is-first logic if applicable
  // NEW: if this variant earned a bonus, fire envelope + pulse
  if (activeSubJob?.bonusTriggered) {
    setShowBonusEnvelope(true);
    setPulseCreditBalance(true);
    // pulse is a one-shot; reset after the animation so it can fire again on
    // a subsequent variant (e.g., batch crossing two boundaries)
    setTimeout(() => setPulseCreditBalance(false), 900);
  }
};
```

Pass `pulse={pulseCreditBalance}` to whichever `<CreditBalance>` is rendered in the surrounding page chrome (the batch page at `src/app/stage/batch/[batchId]/page.tsx` likely owns it; pass the signal up via a callback or lift state).

At the render point of BatchResult, render the envelope:

```tsx
<AnimatePresence>
  {showBonusEnvelope && (
    <BonusCreditEnvelope onDismiss={() => setShowBonusEnvelope(false)} />
  )}
</AnimatePresence>
```

Place this at the root of the BatchResult JSX — NOT inside the step-switcher's AnimatePresence (same lesson as FirstStageWelcomeToast in PR #5).

- [ ] **Step 2: Wire into single-stage result on /stage**

Read `src/app/stage/page.tsx` around the stage-result rendering (search for where the response from `/api/stage` is consumed). The response now includes `bonusTriggered` and `bonusStageCount`. Mirror the BatchResult wiring:

```typescript
import { BonusCreditEnvelope } from '@/components/staging/bonus-credit-envelope';

const [showBonusEnvelope, setShowBonusEnvelope] = useState(false);
const [pulseCreditBalance, setPulseCreditBalance] = useState(false);

// After `/api/stage` response lands:
if (response.bonusTriggered) {
  // fire after the reveal-peak, same delay/rhythm as batch.
  // If the single-stage reveal uses BeforeAfterSlider's autoReveal, hook into its onRevealPeak.
}
```

The exact wiring depends on the single-stage result flow. Use the `onRevealPeak` ref pattern from PR #1/PR #3 if an `autoReveal` slider is used, otherwise trigger the envelope + pulse immediately after the response lands.

Pass `pulse={pulseCreditBalance}` into the `<CreditBalance>` already rendered at `src/app/stage/page.tsx:554`.

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/staging/batch-result.tsx src/app/stage/page.tsx src/app/stage/batch/\[batchId\]/page.tsx
git commit -m "feat(result): wire BonusCreditEnvelope + CreditBalance pulse on bonus-triggering reveals"
```

---

## Task 8: Landing copy sweep + illustration refresh

**Files:**
- Modify: `src/components/landing/hero.tsx`
- Modify: `src/components/landing/how-it-works.tsx`
- Modify: `src/components/landing/pricing.tsx`
- Modify: `src/components/landing/comparison.tsx`
- Modify: `src/components/landing/faq.tsx`
- Modify: `src/components/landing/cta.tsx`
- Modify: `src/app/layout.tsx`

Each edit below specifies the exact line and before/after text. Use the `Edit` tool; re-read each file first to confirm surrounding context.

- [ ] **Step 1: hero.tsx**

`src/components/landing/hero.tsx:49`:
- Before: `curated styles. A free regeneration every ten stages.`
- After: `curated styles. A free credit every seven stages.`

`src/components/landing/hero.tsx:73`:
- Before: `No credit card required. Earn a free regeneration every 10 stages.`
- After: `No credit card required. Earn a free credit every 7 stages.`

- [ ] **Step 2: how-it-works.tsx — step 04 description**

`src/components/landing/how-it-works.tsx:60`:
- Before: `'Not quite right? Spend a regeneration token and re-stage any past room at any style — no forms, no waiting. Earn one every 10 stages. They stack. They don’t expire.'`
- After: `'Not quite right? Every 7 stages earns a free credit — peace of mind for when AI gets weird. Credits stack and don’t expire.'`

- [ ] **Step 3: how-it-works.tsx — illustration**

Rename the local component `RegenerateIllustration` → `FreeCreditIllustration` (update both the function declaration and the call site in the same file). Edit the content:

`line ~283`: `Your regeneration meter` → `Your free-credit meter`
`line ~290`: `regenerations available` → `free credits, unused`
`line ~304`: `Progress to your next free regeneration` → `Progress to your next free credit`
`line ~305`: `7 / 10` → `5 / 7`
`line ~310`: `width: '70%'` → `width: '71%'` (5/7 ≈ 71.4%)
`line ~317`: `+1 regeneration every 10 stages. Stacks. Never expires.` → `+1 free credit every 7 stages. Stack. Never expire.`

Keep the two gold pip elements (`size-6 rounded-full bg-brand-gold/90 ...`) as-is.

- [ ] **Step 4: pricing.tsx**

`line 117`:
- Before: `<span className="block">Every 10 stages earns a free regeneration.</span>`
- After: `<span className="block">Every 7 stages earns a free credit.</span>`

`line 318`:
- Before: `Earn 1 free regeneration every 10 stages. They stack.`
- After: `Earn 1 free credit every 7 stages. They stack.`

`line 322`:
- Before: `Credits and regenerations never expire while your account is active.`
- After: `Credits never expire while your account is active.`

- [ ] **Step 5: comparison.tsx**

`line 35`:
- Before: `'Free regeneration every 10 stages'`
- After: `'Free credit every 7 stages'`

- [ ] **Step 6: faq.tsx**

`line 29`:
- Before: `"No. Credits and earned regenerations never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`
- After: `"No. Credits never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`

`line 33`:
- Before: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free regeneration after ten stages.'`
- After: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free credit after seven stages.'`

- [ ] **Step 7: cta.tsx**

`line 18`: find the line starting with `No credit card, no lock-in. Earn your first free regeneration`.
- Before: `Earn your first free regeneration`
- After: `Earn your first free credit`
- Check lines 18-25 for any continuation mentioning "after 10 stages" or similar — if present, update to "after 7 stages".

- [ ] **Step 8: layout.tsx — metadata + FAQ JSON-LD**

`line 25`:
- Before: `… 12 styles, a free regeneration every 10 stages. 15 free credits …`
- After: `… 12 styles, a free credit every 7 stages. 15 free credits …`

`line 155`:
- Before: `"No. Credits and earned regenerations never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`
- After: `"No. Credits never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`

`line 163`:
- Before: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free regeneration after ten stages.'`
- After: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free credit after seven stages.'`

- [ ] **Step 9: Full production build**

Run: `npm run build`
Expected: PASS. If `react/no-unescaped-entities` fires, check you used `&apos;` for any apostrophes in JSX text (`don't` inside JSX children fails; `don't` inside a TypeScript string literal is fine).

- [ ] **Step 10: Commit**

```bash
git add src/components/landing/*.tsx src/app/layout.tsx
git commit -m "copy(landing): sweep 'regeneration every 10' -> 'free credit every 7'"
```

---

## Task 9: Onboarding copy + primer rename + CLAUDE.md

**Files:**
- Create: `src/components/onboarding/bonus-credit-primer.tsx`
- Delete: `src/components/onboarding/regeneration-primer.tsx`
- Modify: `src/app/onboarding/onboarding-flow.tsx` (import rename)
- Modify: `src/components/onboarding/how-it-works-screen.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the existing primer**

Run: `cat src/components/onboarding/regeneration-primer.tsx`
Expected: small component, 10-30 lines.

- [ ] **Step 2: Create the renamed component**

Create `src/components/onboarding/bonus-credit-primer.tsx` with this exact content:

```typescript
'use client';

export function BonusCreditPrimer() {
  return (
    <div className="mt-6 max-w-xl mx-auto rounded-xl border-2 border-brand-teal bg-white px-5 py-4 flex items-start gap-3">
      <span className="flex-shrink-0 size-3 rounded-full bg-brand-teal mt-1.5" aria-hidden="true" />
      <p className="text-[19px] text-brand-navy font-medium leading-snug">
        You&apos;ve earned 1 of your 7 stages toward your first free credit.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Update onboarding-flow.tsx import**

In `src/app/onboarding/onboarding-flow.tsx:21` (and wherever else `RegenerationPrimer` is used):

- Before: `import { RegenerationPrimer } from '@/components/onboarding/regeneration-primer';`
- After: `import { BonusCreditPrimer } from '@/components/onboarding/bonus-credit-primer';`

And any `<RegenerationPrimer …/>` usage → `<BonusCreditPrimer …/>`.

- [ ] **Step 4: Delete the old primer**

```bash
git rm src/components/onboarding/regeneration-primer.tsx
```

- [ ] **Step 5: Update how-it-works-screen.tsx**

In `src/components/onboarding/how-it-works-screen.tsx:7`:

- Before: `{ num: '04', title: 'Regenerate (optional)', who: 'You', time: 'free', desc: 'Not quite right? Earn one every 10 stages.' },`
- After: `{ num: '04', title: 'Free credit every 7 stages', who: 'You', time: 'free', desc: 'Re-stage or try a new style — on us. Peace of mind for when AI gets weird.' },`

- [ ] **Step 6: Update CLAUDE.md**

In `CLAUDE.md`, find the `### Regeneration bank (primary quality mechanic)` section (around line 205) and replace the whole section with:

```markdown
### Free-credit bonus (primary quality mechanic)
- Every 7 successful stages earns +1 free credit. Credit goes straight to the user's wallet — same currency as any other credit.
- No separate token system. No separate spend flow. Users redeem by staging again.
- Exactly-once guarantee server-side: `User.lastBonusStageCount` + ConditionExpression.
- Dormant in repo: `FlagReviewDialog`, `FlaggedPill`, `/admin/reviews` — not imported in live flow.
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: PASS. Apostrophe check: the primer copy uses `&apos;` inside JSX text.

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding/bonus-credit-primer.tsx src/app/onboarding/onboarding-flow.tsx src/components/onboarding/how-it-works-screen.tsx CLAUDE.md
# (git rm already staged the delete)
git commit -m "copy(onboarding+docs): rename primer, sweep remaining 10->7 mentions"
```

---

## Task 10: Lambda redeploy + PR + ship

**Files:** none new — deploy + ship flow.

- [ ] **Step 1: Zip the Lambda (Windows bsdtar)**

```bash
/c/Windows/System32/tar.exe --format=zip -a -c -f lambda/staging-worker.zip -C lambda/staging-worker .
```

Expected: `lambda/staging-worker.zip` created, ~10MB.

- [ ] **Step 2: Deploy Lambda**

```bash
aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://lambda/staging-worker.zip \
  --region ap-southeast-2
```

Expected: JSON response with `LastUpdateStatus: InProgress` or `Successful`.

- [ ] **Step 3: Poll Lambda until Active**

```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}" \
  --output json
```

Repeat until `LastUpdateStatus: Successful, State: Active`. Typically <30s.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/bonus-credit-ceremony
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(bonus-credit): every-7-stages free credit + celebration ceremony" --body "$(cat <<'EOF'
## Summary
- Ships the every-7-stages bonus credit — exactly-once atomic grant, celebration envelope on result screen, counter pulse in the header.
- Collapses the "regeneration" vocabulary to plain "free credit" across all user-facing copy. One currency, one mental model.
- Lambda redeployed with inline copy of the new helpers.

## What changed
### Server
- New \`src/lib/db/bonus-credit.ts\` with \`recordSingleStageCompletion\`, \`recordBatchSubJobCompletion\`, and shared \`grantBonusIfDue\`. Atomic via ConditionExpression on \`lastBonusStageCount\`.
- \`User\` gains \`stagesCompletedTotal\` + \`lastBonusStageCount\` (optional, defaults to 0).
- \`BatchSubJob\` and \`Staging\` gain \`stageCounted\`, \`bonusTriggered\`, \`bonusStageCount\`.
- Lambda: inline helper copy + call sites in batch + single completion paths. KEEP IN SYNC comment mirrors \`bonus-credit.ts\`.
- \`/api/jobs/batch\` passes \`bonusTriggered\` and \`bonusStageCount\` through per-subJob.
- \`/api/stage\` calls the helper after the single-stage Staging write (if the route owns the write; otherwise Lambda does).

### Client
- New \`BonusCreditEnvelope\` — bottom-rising card with gold accent, 6s dwell, ref-stabilised onDismiss.
- \`CreditBalance\` gains a \`pulse\` prop — animates scale + gold glow + number cross-fade.
- Result screens (batch + single) wire envelope and pulse off \`bonusTriggered\`, triggered from the reveal-peak.

### Copy
- Full sweep: hero, how-it-works (incl. illustration rename + label updates), pricing, comparison, faq, cta, layout metadata + FAQ JSON-LD, onboarding how-it-works step 04, primer rename.
- CLAUDE.md: \"Regeneration bank\" section replaced with \"Free-credit bonus\".

## Test plan
- [ ] Fresh user: stage 7 times (mix of batch + single). On the 7th reveal, verify envelope rises 1.5s after lid-lift settles and CreditBalance pulses once.
- [ ] Admin user: stage 7+ times, verify no envelope (admin plan skipped server-side).
- [ ] Batch spanning two boundaries (e.g. user at count 6, batch of 10): verify two variants carry \`bonusTriggered\`; envelope fires on each as the user clicks through.
- [ ] Reduced-motion: verify envelope fades without slide; pulse animates without scale.
- [ ] Landing page: copy reads correctly on all surfaces; illustration shows \"5 / 7\" progress.
- [ ] Onboarding: primer card reads \"1 of your 7 stages toward your first free credit\".
- [ ] Lambda retry safety: force a retry on a completed sub-job (e.g. via logs) — verify no double-count.

Spec: \`docs/superpowers/specs/2026-04-24-bonus-credit-ceremony-design.md\`
Plan: \`docs/superpowers/plans/2026-04-24-bonus-credit-ceremony.md\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Squash-merge**

```bash
gh pr merge --squash --delete-branch
```

Expected: may warn "branches diverged" for the local sync — that's fine, the merge completes on GitHub. Continue to step 7.

- [ ] **Step 7: Sync local master**

```bash
git checkout master
git fetch origin
git reset --hard origin/master
git log --oneline -3
```

Expected: top commit is the squash-merged PR.

- [ ] **Step 8: Poll Amplify**

```bash
aws amplify list-jobs --app-id d88xgpqlfkk1w --branch-name master --max-items 1 --region ap-southeast-2 --query 'jobSummaries[].{jobId:jobId,status:status,commitId:commitId}' --output table
```

Repeat until status changes from `RUNNING`/`PENDING` to `SUCCEED`.

- [ ] **Step 9: Manual QA on live**

Visit `https://master.d88xgpqlfkk1w.amplifyapp.com/` and walk through the test plan above. Particular spots:
- Landing: hero, how-it-works illustration, pricing, FAQ all read "free credit every 7 stages"
- Sign up a new account, complete 7 stages (5 free + 2 batch sub-jobs). Verify envelope + counter pulse on stage 7.

- [ ] **Step 10: Final commit if any QA tweaks needed, else done**

If any small copy tweaks surface during QA, make them on a new branch, small PR, ship. Otherwise the feature is live.
