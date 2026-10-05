import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { Bundle, VariantSlot } from '@/types';
import { variantsForBundle } from '@/types';

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
  /** @deprecated Legacy field. New records use variants[].jobId; reads are normalized to always populate variants[]. */
  jobId?: string;
  /** @deprecated Legacy field. New records use variants[].stagedS3Key; reads are normalized to always populate variants[]. */
  stagedS3Key?: string;
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
  /**
   * Per-style concierge notes, indexed by style. Mirrors roomAnalysisByStyle:
   * the leader Lambda for each style writes its analysis-derived notes here,
   * shared across the variants for that style. Empty for single mode.
   * Optional because pre-Task-1 records do not have this key in DDB;
   * `createBatchJob` always initialises to `{}` on new records.
   */
  conciergeNotesByStyle?: Record<string, string[]>;
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
    roomAnalysisByStyle: data.roomAnalysisByStyle ?? {},
    conciergeNotesByStyle: {},
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

/**
 * Normalize a raw DDB BatchJob to ensure required fields are populated.
 * Handles legacy records that predate the bundle/variants schema:
 *   - Default bundle to 'single' if missing
 *   - Synthesize variants[] from legacy subJob fields if missing
 */
function normalizeBatchJob(raw: BatchJob): BatchJob {
  return {
    ...raw,
    bundle: raw.bundle ?? 'single',
    subJobs: raw.subJobs.map((s) => ({
      ...s,
      variants:
        s.variants && s.variants.length > 0
          ? s.variants
          : [
              {
                slot: 1 as VariantSlot,
                jobId: s.jobId ?? '',
                status:
                  s.status === 'done'
                    ? 'done'
                    : s.status === 'error'
                      ? 'error'
                      : s.status === 'running'
                        ? 'running'
                        : 'pending',
                stagedS3Key: s.stagedS3Key,
                error: s.error,
                conciergeNotes: s.conciergeNotes,
              },
            ],
    })),
  };
}

export async function getBatchJob(batchId: string): Promise<BatchJob | null> {
  const res = await dynamodb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    }),
  );
  if (!res.Item) return null;
  return normalizeBatchJob(res.Item as BatchJob);
}

/**
 * Derive a BatchSubJob's coarse status from its variants[].
 * 'done' once every variant is terminal (done OR failed_after_retry).
 * 'running' if any variant is mid-flight.
 * 'pending' otherwise. Mirrors the rollup logic in the Lambda's
 * propagateToBatch (lambda/staging-worker/index.mjs).
 */
function rollupSubJobStatus(variants: BatchVariant[]): BatchSubJobStatus {
  const allTerminal = variants.every(
    (v) => v.status === 'done' || v.status === 'failed_after_retry',
  );
  if (allTerminal) return 'done';
  if (variants.some((v) => v.status === 'running')) return 'running';
  return 'pending';
}

/**
 * Atomically update one variant (or, for legacy single-style records, one sub-job)
 * within a BatchJob. Variant-mode is the modern path used by both bundles —
 * triple-bundle records have 3 variants per style, single-bundle records have
 * 1 variant. Mirrors lambda/staging-worker/index.mjs propagateToBatch.
 *
 * Concurrency: ConditionalCheck on (completed, failed) means concurrent siblings
 * either land in order or retry on ConditionalCheckFailedException.
 */
async function mutateSubJob(
  batchId: string,
  jobId: string,
  patch:
    | { kind: 'variant'; fn: (v: BatchVariant) => BatchVariant }
    | { kind: 'legacy'; fn: (s: BatchSubJob) => BatchSubJob },
  counterKey: 'completed' | 'failed',
  alsoRefund: boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const current = await getBatchJob(batchId);
    if (!current) throw new Error(`batch ${batchId} not found`);

    let newSubJobs = current.subJobs;
    let touched = false;
    let alreadyTerminal = false;

    if (patch.kind === 'variant') {
      // Walk subJobs[].variants[] and update the matching variant. Re-derive
      // the parent sub-job status from the resulting variants.
      newSubJobs = current.subJobs.map((s) => {
        const variants = s.variants ?? [];
        const idx = variants.findIndex((v) => v.jobId === jobId);
        if (idx < 0) return s;
        touched = true;
        // Idempotency guard: never re-touch a variant that's already terminal.
        // A prior writer (this path, or the Lambda's propagateToBatch) has
        // already counted it. Re-counting pushes completed+failed past total
        // and the batch would never register as terminal; flipping a 'done'
        // variant to 'failed_after_retry' (watchdog racing a late success)
        // would also corrupt state. Leave it untouched.
        const cur = variants[idx];
        if (cur.status === 'done' || cur.status === 'failed_after_retry') {
          alreadyTerminal = true;
          return s;
        }
        const newVariants = variants.map((v, i) => (i === idx ? patch.fn(v) : v));
        return { ...s, variants: newVariants, status: rollupSubJobStatus(newVariants) };
      });
    } else {
      // Legacy single-style records — match by top-level subJob.jobId.
      newSubJobs = current.subJobs.map((s) => {
        if (s.jobId !== jobId) return s;
        touched = true;
        return patch.fn(s);
      });
    }

    if (!touched) {
      throw new Error(`mutateSubJob: jobId ${jobId} not found in batch ${batchId}`);
    }
    if (alreadyTerminal) {
      // Found, but already counted — idempotent no-op. No write, no increment.
      return;
    }

    try {
      await dynamodb.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { pk: `BATCH#${batchId}`, sk: 'META' },
          UpdateExpression: alsoRefund
            ? `ADD ${counterKey} :one, refundedCredits :one SET subJobs = :sj`
            : `ADD ${counterKey} :one SET subJobs = :sj`,
          ConditionExpression: 'completed = :oldC AND failed = :oldF',
          ExpressionAttributeValues: {
            ':one': 1,
            ':sj': newSubJobs,
            ':oldC': current.completed,
            ':oldF': current.failed,
          },
        }),
      );
      return;
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name !== 'ConditionalCheckFailedException') throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));
      // sibling write landed between our read and update; retry
    }
  }
  throw new Error(`mutateSubJob: exceeded retries for ${batchId}/${jobId}`);
}

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
    {
      kind: 'variant',
      fn: (v) => ({
        ...v,
        status: 'done',
        stagedS3Key: args.stagedS3Key,
        conciergeNotes: args.conciergeNotes,
      }),
    },
    'completed',
    false,
  );
}

export async function markSubJobError(args: {
  batchId: string;
  jobId: string;
  error: string;
}): Promise<void> {
  await mutateSubJob(
    args.batchId,
    args.jobId,
    {
      kind: 'variant',
      fn: (v) => ({
        ...v,
        status: 'failed_after_retry',
        error: args.error,
        retried: true,
      }),
    },
    'failed',
    false, // refunds handled by applyPartialRefundsForBatch at terminal state — do not double-refund here
  );
}

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
